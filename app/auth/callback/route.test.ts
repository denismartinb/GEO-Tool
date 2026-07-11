import { beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { exchangeCodeForSession }
  })
}));

import { GET } from "./route";

function requestFor(search: string): Request {
  return new Request(`https://app.example.com/auth/callback${search}`);
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("exchanges a valid code and redirects to next (default /dashboard)", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });

    const response = await GET(requestFor("?code=abc123"));

    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc123");
    expect(response.headers.get("location")).toBe("https://app.example.com/dashboard");
  });

  it("honors an explicit next param on success", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });

    const response = await GET(requestFor("?code=abc123&next=/dashboard/billing"));

    expect(response.headers.get("location")).toBe("https://app.example.com/dashboard/billing");
  });

  it("never lands the user on a stale/unauthenticated /dashboard when the exchange fails", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: "invalid PKCE code verifier" } });

    const response = await GET(requestFor("?code=abc123"));

    const location = response.headers.get("location") ?? "";
    expect(location.startsWith("https://app.example.com/login?error=")).toBe(true);
    expect(location).not.toContain("invalid+PKCE");
    expect(location).not.toContain("PKCE");
  });

  it("redirects to a safe login error when the provider itself reports an error", async () => {
    const response = await GET(requestFor("?error=access_denied&error_description=User+cancelled"));

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    const location = response.headers.get("location") ?? "";
    expect(location.startsWith("https://app.example.com/login?error=")).toBe(true);
  });

  it("redirects to a safe login error instead of a bare next when neither code nor error is present", async () => {
    const response = await GET(requestFor(""));

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    const location = response.headers.get("location") ?? "";
    expect(location.startsWith("https://app.example.com/login?error=")).toBe(true);
  });
});
