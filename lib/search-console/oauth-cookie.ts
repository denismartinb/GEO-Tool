import { GSC_CALLBACK_PATH } from "@/lib/search-console/google";

/**
 * The single-use cookie of a Search Console connect flow (log §284): the
 * state's nonce and the PKCE verifier. httpOnly, scoped to the callback path
 * and ten minutes long; the callback deletes it on every outcome.
 */
export const GSC_OAUTH_COOKIE = "gs_gsc_oauth";

export const GSC_OAUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: GSC_CALLBACK_PATH,
  maxAge: 600
};

export function packOAuthCookie(nonce: string, verifier: string): string {
  return `${nonce}.${verifier}`;
}

export function unpackOAuthCookie(raw: string | undefined): { nonce: string; verifier: string } | null {
  if (!raw || raw.length > 256) return null;
  const [nonce, verifier, extra] = raw.split(".");
  if (!nonce || !verifier || extra !== undefined) return null;
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(verifier)) return null;
  return { nonce, verifier };
}

export type ConnectOutcome = "connected" | "denied" | "error" | "scope";

export function screenPath(projectId: string, outcome?: ConnectOutcome): string {
  const base = `/dashboard/projects/${projectId}/search-console`;
  return outcome ? `${base}?gsc=${outcome}` : base;
}
