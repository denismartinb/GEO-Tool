import { describe, expect, it, vi } from "vitest";
import { decideConsent, readConsent } from "./consent";

const ID = "auth_1234567890";
function oauth(details: unknown, decision: unknown = { data: { redirect_url: "https://claude.ai/api/mcp/auth_callback?code=c&state=s" }, error: null }) {
  return {
    getAuthorizationDetails: vi.fn(async () => details as { data: unknown; error: unknown }),
    approveAuthorization: vi.fn(async () => decision as { data: { redirect_url: string } | null; error: unknown }),
    denyAuthorization: vi.fn(async () => decision as { data: { redirect_url: string } | null; error: unknown })
  };
}

describe("OAuth consent (MCP-SERVER-1, log §418)", () => {
  it("shows who asks, for which account and where it goes back", async () => {
    const o = oauth({
      data: { authorization_id: ID, redirect_uri: "https://claude.ai/api/mcp/auth_callback", client: { name: "Claude" }, user: { id: "u", email: "a@b.es" }, scope: "" },
      error: null
    });
    expect(await readConsent(o, ID)).toEqual({
      kind: "ask",
      request: { authorizationId: ID, clientName: "Claude", redirectHost: "claude.ai", email: "a@b.es" }
    });
  });

  it("goes straight back when the user already consented", async () => {
    const o = oauth({ data: { redirect_url: "https://chatgpt.com/connector_platform_oauth_redirect?code=x" }, error: null });
    expect(await readConsent(o, ID)).toEqual({ kind: "redirect", url: "https://chatgpt.com/connector_platform_oauth_redirect?code=x" });
  });

  it("refuses a malformed id without calling Supabase, and an expired one", async () => {
    const o = oauth({ data: null, error: { message: "expired" } });
    expect(await readConsent(o, "../../x")).toEqual({ kind: "invalid" });
    expect(o.getAuthorizationDetails).not.toHaveBeenCalled();
    expect(await readConsent(o, ID)).toEqual({ kind: "invalid" });
  });

  it("never follows a script URL", async () => {
    const o = oauth({ data: { redirect_url: "javascript:alert(1)" }, error: null });
    expect(await readConsent(o, ID)).toEqual({ kind: "invalid" });
  });

  it("approves or denies through Supabase and returns where to go", async () => {
    const o = oauth(null);
    expect(await decideConsent(o, ID, true)).toEqual({ kind: "redirect", url: "https://claude.ai/api/mcp/auth_callback?code=c&state=s" });
    expect(o.approveAuthorization).toHaveBeenCalledWith(ID, { skipBrowserRedirect: true });
    await decideConsent(o, ID, false);
    expect(o.denyAuthorization).toHaveBeenCalledWith(ID, { skipBrowserRedirect: true });
    expect(await decideConsent(oauth(null, { data: null, error: { message: "x" } }), ID, true)).toEqual({ kind: "error" });
  });
});
