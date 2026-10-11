import "server-only";

import { getSiteUrl } from "@/lib/site-url";

/**
 * SEARCH-SEO-1 Fase 3 (log §284). The only module that talks to Google for the
 * Search Console connection: OAuth (code exchange with PKCE, refresh, revoke)
 * and the three read endpoints the screen uses (sites, Search Analytics, URL
 * Inspection).
 *
 * Every call has a timeout and one retry on a network error or 5xx
 * (`.claude/rules/scan.md`, "every outbound provider call"). Errors become a
 * self-authored category; nothing from Google's body is logged or returned,
 * because token and API errors can echo request details. Logs carry the
 * operation, the category and the HTTP status only — never a code, token or
 * state.
 */

export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
export const GSC_CALLBACK_PATH = "/api/search-console/callback";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const SITES_ENDPOINT = "https://www.googleapis.com/webmasters/v3/sites";
const INSPECT_ENDPOINT = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";
const TIMEOUT_MS = 10_000;
const LOG_PREFIX = "[search-console]";

export type GscErrorCategory = "revoked" | "permission" | "quota" | "timeout" | "unavailable" | "config";

export class GscError extends Error {
  constructor(readonly category: GscErrorCategory) {
    super(`search_console:${category}`);
    this.name = "GscError";
  }
}

export function getOAuthClient(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** Built from `getSiteUrl()`, never from the request's Host header. */
export function getRedirectUri(): string {
  return `${getSiteUrl()}${GSC_CALLBACK_PATH}`;
}

/**
 * `select_account` always shows Google's account picker: the Search Console
 * property often lives in a different Google account than the one used to
 * sign in to GenScore, so no `login_hint` is sent.
 */
export function buildAuthUrl(input: { clientId: string; state: string; codeChallenge: string }): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: GSC_SCOPE,
    access_type: "offline",
    prompt: "select_account consent",
    include_granted_scopes: "false",
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256"
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

function categorize(status: number, oauthError?: string): GscErrorCategory {
  if (oauthError === "invalid_grant") return "revoked";
  if (oauthError === "invalid_client" || oauthError === "unauthorized_client") return "config";
  if (status === 401) return "revoked";
  if (status === 403) return "permission";
  if (status === 429) return "quota";
  if (status === 400 || status === 404) return "permission";
  return "unavailable";
}

async function call(op: string, url: string, init: RequestInit): Promise<unknown> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      if (attempt === 0) continue;
      console.warn(`${LOG_PREFIX} request_failed`, { op, category: timedOut ? "timeout" : "unavailable" });
      throw new GscError(timedOut ? "timeout" : "unavailable");
    }
    if (response.ok) return response.json().catch(() => ({}));
    if (response.status >= 500 && attempt === 0) continue;
    let oauthError: string | undefined;
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === "string") oauthError = body.error;
    } catch {
      // Body is never read beyond the OAuth error code.
    }
    const category = categorize(response.status, oauthError);
    console.warn(`${LOG_PREFIX} http_error`, { op, category, status: response.status });
    throw new GscError(category);
  }
  throw new GscError("unavailable");
}

function form(body: Record<string, string>): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString()
  };
}

export type TokenGrant = { accessToken: string; refreshToken: string | null; scope: string };

function readGrant(raw: unknown): TokenGrant {
  const body = raw as { access_token?: unknown; refresh_token?: unknown; scope?: unknown };
  if (typeof body.access_token !== "string") throw new GscError("unavailable");
  return {
    accessToken: body.access_token,
    refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : null,
    scope: typeof body.scope === "string" ? body.scope : ""
  };
}

export async function exchangeCode(code: string, codeVerifier: string): Promise<TokenGrant> {
  const client = getOAuthClient();
  if (!client) throw new GscError("config");
  return readGrant(
    await call(
      "token_exchange",
      TOKEN_ENDPOINT,
      form({
        code,
        client_id: client.clientId,
        client_secret: client.clientSecret,
        redirect_uri: getRedirectUri(),
        grant_type: "authorization_code",
        code_verifier: codeVerifier
      })
    )
  );
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenGrant> {
  const client = getOAuthClient();
  if (!client) throw new GscError("config");
  return readGrant(
    await call(
      "token_refresh",
      TOKEN_ENDPOINT,
      form({
        refresh_token: refreshToken,
        client_id: client.clientId,
        client_secret: client.clientSecret,
        grant_type: "refresh_token"
      })
    )
  );
}

/** Best-effort: never throws, the caller deletes the row regardless. */
export async function revokeToken(token: string): Promise<boolean> {
  try {
    const response = await fetch(REVOKE_ENDPOINT, {
      ...form({ token }),
      cache: "no-store",
      signal: AbortSignal.timeout(5_000)
    });
    if (!response.ok) console.warn(`${LOG_PREFIX} revoke_failed`, { status: response.status });
    return response.ok;
  } catch {
    console.warn(`${LOG_PREFIX} revoke_failed`, { status: 0 });
    return false;
  }
}

export function grantHasScope(scope: string): boolean {
  return scope.split(/\s+/).includes(GSC_SCOPE);
}

function bearer(accessToken: string): Record<string, string> {
  return { authorization: `Bearer ${accessToken}`, "content-type": "application/json" };
}

export type GscSite = { siteUrl: string; permissionLevel: string };

/** Verified properties only: `siteUnverifiedUser` cannot read any data. */
export async function listSites(accessToken: string): Promise<GscSite[]> {
  const raw = (await call("sites_list", SITES_ENDPOINT, { headers: bearer(accessToken) })) as {
    siteEntry?: Array<{ siteUrl?: unknown; permissionLevel?: unknown }>;
  };
  return (raw.siteEntry ?? [])
    .filter(
      (s): s is { siteUrl: string; permissionLevel: string } =>
        typeof s.siteUrl === "string" && typeof s.permissionLevel === "string"
    )
    .filter((s) => s.permissionLevel !== "siteUnverifiedUser")
    .map((s) => ({ siteUrl: s.siteUrl, permissionLevel: s.permissionLevel }));
}

export type AnalyticsRow = { keys: string[]; clicks: number; impressions: number; position: number };

export async function querySearchAnalytics(
  accessToken: string,
  siteUrl: string,
  body: { startDate: string; endDate: string; dimensions?: string[]; rowLimit?: number }
): Promise<AnalyticsRow[]> {
  const raw = (await call(
    "search_analytics",
    `${SITES_ENDPOINT}/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    { method: "POST", headers: bearer(accessToken), body: JSON.stringify({ ...body, dataState: "final" }) }
  )) as { rows?: Array<{ keys?: unknown; clicks?: unknown; impressions?: unknown; position?: unknown }> };
  return (raw.rows ?? []).map((r) => ({
    keys: Array.isArray(r.keys) ? r.keys.filter((k): k is string => typeof k === "string") : [],
    clicks: typeof r.clicks === "number" ? r.clicks : 0,
    impressions: typeof r.impressions === "number" ? r.impressions : 0,
    position: typeof r.position === "number" ? r.position : 0
  }));
}

export async function inspectUrl(
  accessToken: string,
  siteUrl: string,
  inspectionUrl: string
): Promise<{ verdict: string | null; coverageState: string | null }> {
  const raw = (await call("url_inspection", INSPECT_ENDPOINT, {
    method: "POST",
    headers: bearer(accessToken),
    body: JSON.stringify({ inspectionUrl, siteUrl, languageCode: "es-ES" })
  })) as { inspectionResult?: { indexStatusResult?: { verdict?: unknown; coverageState?: unknown } } };
  const status = raw.inspectionResult?.indexStatusResult;
  return {
    verdict: typeof status?.verdict === "string" ? status.verdict : null,
    coverageState: typeof status?.coverageState === "string" ? status.coverageState : null
  };
}
