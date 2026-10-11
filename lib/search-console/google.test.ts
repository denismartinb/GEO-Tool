import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAuthUrl, GSC_SCOPE } from "@/lib/search-console/google";

describe("buildAuthUrl", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.genscore.es/"));
  afterEach(() => vi.unstubAllEnvs());

  const params = () =>
    new URL(buildAuthUrl({ clientId: "client", state: "s", codeChallenge: "c" })).searchParams;

  it("always shows Google's account picker and never pre-selects an account", () => {
    expect(params().get("prompt")).toBe("select_account consent");
    expect(params().has("login_hint")).toBe(false);
  });

  it("asks only for the read-only scope, offline, with PKCE", () => {
    const p = params();
    expect(p.get("scope")).toBe(GSC_SCOPE);
    expect(p.get("access_type")).toBe("offline");
    expect(p.get("code_challenge_method")).toBe("S256");
    expect(p.get("redirect_uri")).toBe("https://www.genscore.es/api/search-console/callback");
  });
});
