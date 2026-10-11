import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const requireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: () => requireUser() }));

const requireActiveProject = vi.fn();
vi.mock("@/lib/project-workspace", () => ({ requireActiveProject: (id: string) => requireActiveProject(id) }));

const saveConnection = vi.fn();
vi.mock("@/lib/search-console/connection", () => ({ saveConnection: (...a: unknown[]) => saveConnection(...a) }));

const exchangeCode = vi.fn();
const revokeToken = vi.fn();
vi.mock("@/lib/search-console/google", async (orig) => ({
  ...(await orig<typeof import("@/lib/search-console/google")>()),
  exchangeCode: (...a: unknown[]) => exchangeCode(...a),
  revokeToken: (...a: unknown[]) => revokeToken(...a)
}));

import { GET } from "./route";
import { decryptRefreshToken, signOAuthState } from "@/lib/search-console/crypto";
import { GSC_SCOPE } from "@/lib/search-console/google";
import { GSC_OAUTH_COOKIE } from "@/lib/search-console/oauth-cookie";

const P = "11111111-1111-4111-8111-111111111111";
const U = "22222222-2222-4222-8222-222222222222";
const NONCE = "n".repeat(43);
const VERIFIER = "v".repeat(64);

function request(params: Record<string, string>, cookie = `${NONCE}.${VERIFIER}`) {
  const url = new URL("https://www.genscore.es/api/search-console/callback");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url, { headers: { cookie: `${GSC_OAUTH_COOKIE}=${cookie}` } });
}

function validState(overrides: Partial<{ p: string; u: string; n: string; exp: number }> = {}) {
  return signOAuthState({ p: P, u: U, n: NONCE, exp: Date.now() + 60_000, ...overrides })!;
}

describe("GET /api/search-console/callback", () => {
  beforeEach(() => {
    process.env.GSC_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    requireUser.mockReset().mockResolvedValue({ user: { id: U } });
    requireActiveProject.mockReset().mockResolvedValue({ id: P });
    saveConnection.mockReset().mockResolvedValue(true);
    exchangeCode.mockReset().mockResolvedValue({ accessToken: "at", refreshToken: "rt", scope: GSC_SCOPE });
    revokeToken.mockReset().mockResolvedValue(true);
  });

  it("stores the encrypted refresh token and lands on the screen", async () => {
    const res = await GET(request({ state: validState(), code: "abc" }));
    expect(res.headers.get("location")).toBe(`https://www.genscore.es/dashboard/projects/${P}/search-console?gsc=connected`);
    expect(exchangeCode).toHaveBeenCalledWith("abc", VERIFIER);
    const [ids, ciphertext] = saveConnection.mock.calls[0];
    expect(ids).toEqual({ projectId: P, ownerUserId: U });
    expect(ciphertext).not.toContain("rt");
    expect(decryptRefreshToken(ciphertext, P, U)?.token).toBe("rt");
    expect(res.headers.get("set-cookie")).toMatch(new RegExp(`${GSC_OAUTH_COOKIE}=;`));
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("rejects a forged, expired or nonce-less state before touching anything", async () => {
    for (const req of [
      request({ state: "forged.sig", code: "abc" }),
      request({ state: validState({ exp: Date.now() - 1 }), code: "abc" }),
      request({ state: validState(), code: "abc" }, `${"x".repeat(43)}.${VERIFIER}`)
    ]) {
      const res = await GET(req);
      expect(res.headers.get("location")).toBe("https://www.genscore.es/dashboard");
    }
    expect(requireUser).not.toHaveBeenCalled();
    expect(exchangeCode).not.toHaveBeenCalled();
    expect(saveConnection).not.toHaveBeenCalled();
  });

  it("refuses when another user finishes a flow someone else started", async () => {
    requireUser.mockResolvedValue({ user: { id: "33333333-3333-4333-8333-333333333333" } });
    const res = await GET(request({ state: validState(), code: "abc" }));
    expect(res.headers.get("location")).toBe("https://www.genscore.es/dashboard");
    expect(saveConnection).not.toHaveBeenCalled();
  });

  it("writes nothing for a project the user does not own (404)", async () => {
    requireActiveProject.mockRejectedValue(new Error("NEXT_HTTP_ERROR_FALLBACK;404"));
    await expect(GET(request({ state: validState(), code: "abc" }))).rejects.toThrow("404");
    expect(exchangeCode).not.toHaveBeenCalled();
    expect(saveConnection).not.toHaveBeenCalled();
  });

  it("maps a denied consent to its own outcome, without Google's text", async () => {
    const res = await GET(request({ state: validState(), error: "access_denied", error_description: "<script>" }));
    expect(res.headers.get("location")).toBe(`https://www.genscore.es/dashboard/projects/${P}/search-console?gsc=denied`);
    expect(exchangeCode).not.toHaveBeenCalled();
  });

  it("revokes and refuses a grant without the read-only scope", async () => {
    exchangeCode.mockResolvedValue({ accessToken: "at", refreshToken: "rt", scope: "openid" });
    const res = await GET(request({ state: validState(), code: "abc" }));
    expect(res.headers.get("location")).toContain("gsc=scope");
    expect(revokeToken).toHaveBeenCalledWith("at");
    expect(saveConnection).not.toHaveBeenCalled();
  });
});
