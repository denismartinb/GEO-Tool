/**
 * MCP-SERVER-1 (log §418): the consent step of Supabase Auth's OAuth 2.1
 * server, behind `/oauth/consentir`. The outcome is returned, never decided
 * with `redirect()` (`.claude/rules/server-actions.md`): the page and the
 * action translate it.
 *
 * Supabase keeps the authorization request and binds it to the signed-in
 * user; `authorizationId` is only a handle to it, so a forged one fails at
 * Supabase. The client is the user's own cookie client, never service role.
 */

export const AUTHORIZATION_ID = /^[A-Za-z0-9_-]{8,128}$/;

type OAuthApi = {
  getAuthorizationDetails(id: string): Promise<{ data: unknown; error: unknown }>;
  approveAuthorization(id: string, o?: { skipBrowserRedirect?: boolean }): Promise<{ data: { redirect_url: string } | null; error: unknown }>;
  denyAuthorization(id: string, o?: { skipBrowserRedirect?: boolean }): Promise<{ data: { redirect_url: string } | null; error: unknown }>;
};

export type ConsentRequest = {
  authorizationId: string;
  clientName: string;
  /** Host the client sends the user back to, shown so a look-alike name cannot hide it. */
  redirectHost: string;
  email: string;
};

export type ConsentView =
  | { kind: "invalid" }
  | { kind: "redirect"; url: string }
  | { kind: "ask"; request: ConsentRequest };

function safeRedirect(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url);
    // Supabase builds it from the client's registered redirect URI (a web
    // address or a desktop app's own scheme). Script and data URLs never.
    if (u.protocol === "javascript:" || u.protocol === "data:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export async function readConsent(oauth: OAuthApi, authorizationId: string | undefined): Promise<ConsentView> {
  if (!authorizationId || !AUTHORIZATION_ID.test(authorizationId)) return { kind: "invalid" };
  const { data, error } = await oauth.getAuthorizationDetails(authorizationId).catch(() => ({ data: null, error: true }));
  if (error || !data || typeof data !== "object") return { kind: "invalid" };
  if (!("authorization_id" in data)) {
    const url = safeRedirect((data as { redirect_url?: unknown }).redirect_url);
    return url ? { kind: "redirect", url } : { kind: "invalid" };
  }
  const d = data as { authorization_id: string; redirect_uri?: string; client?: { name?: string }; user?: { email?: string } };
  let redirectHost = "";
  try {
    redirectHost = new URL(d.redirect_uri ?? "").host;
  } catch {
    redirectHost = "";
  }
  return {
    kind: "ask",
    request: {
      authorizationId: d.authorization_id,
      clientName: (d.client?.name ?? "").trim().slice(0, 80) || "Una aplicación",
      redirectHost,
      email: d.user?.email ?? ""
    }
  };
}

export type ConsentDecision = { kind: "redirect"; url: string } | { kind: "error" };

export async function decideConsent(oauth: OAuthApi, authorizationId: string, approve: boolean): Promise<ConsentDecision> {
  if (!AUTHORIZATION_ID.test(authorizationId)) return { kind: "error" };
  const call = approve ? oauth.approveAuthorization : oauth.denyAuthorization;
  const { data, error } = await call.call(oauth, authorizationId, { skipBrowserRedirect: true }).catch(() => ({ data: null, error: true }));
  const url = !error && data ? safeRedirect(data.redirect_url) : null;
  return url ? { kind: "redirect", url } : { kind: "error" };
}
