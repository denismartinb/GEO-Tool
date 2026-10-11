import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { requireActiveProject } from "@/lib/project-workspace";
import { saveConnection } from "@/lib/search-console/connection";
import { encryptRefreshToken, nonceMatches, verifyOAuthState } from "@/lib/search-console/crypto";
import { exchangeCode, grantHasScope, revokeToken } from "@/lib/search-console/google";
import {
  GSC_OAUTH_COOKIE,
  GSC_OAUTH_COOKIE_OPTIONS,
  screenPath,
  unpackOAuthCookie,
  type ConnectOutcome
} from "@/lib/search-console/oauth-cookie";

export const dynamic = "force-dynamic";

/**
 * SEARCH-SEO-1 Fase 3 (log §284). Google's redirect back after consent.
 *
 * Checks, in order: state signature and expiry, nonce == cookie, the session
 * user is the one who started the flow, and that user still owns the
 * project. Only then is the code exchanged (with the PKCE verifier from the
 * cookie, so a code leaked through request logs is useless) and the refresh
 * token encrypted and stored. The redirect target is built here from the
 * verified project id — no `next` parameter is accepted. The cookie is
 * deleted on every outcome, and Google's `error_description` is never shown
 * or stored.
 */
function finish(request: NextRequest, path: string): NextResponse {
  const response = NextResponse.redirect(new URL(path, request.nextUrl.origin));
  response.cookies.set(GSC_OAUTH_COOKIE, "", { ...GSC_OAUTH_COOKIE_OPTIONS, maxAge: 0 });
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const state = verifyOAuthState(params.get("state"), Date.now());
  if (!state) return finish(request, "/dashboard");

  const cookie = unpackOAuthCookie(request.cookies.get(GSC_OAUTH_COOKIE)?.value);
  if (!cookie || !nonceMatches(cookie.nonce, state.n)) return finish(request, "/dashboard");

  const { user } = await requireUser();
  if (user.id !== state.u) return finish(request, "/dashboard");
  await requireActiveProject(state.p);

  const done = (outcome: ConnectOutcome) => finish(request, screenPath(state.p, outcome));

  if (params.get("error")) return done("denied");
  const code = params.get("code");
  if (!code || code.length > 2048) return done("error");

  try {
    const grant = await exchangeCode(code, cookie.verifier);
    if (!grantHasScope(grant.scope)) {
      await revokeToken(grant.accessToken);
      return done("scope");
    }
    if (!grant.refreshToken) return done("error");
    const ids = { projectId: state.p, ownerUserId: user.id };
    const saved = await saveConnection(ids, encryptRefreshToken(grant.refreshToken, ids.projectId, ids.ownerUserId));
    if (!saved) {
      await revokeToken(grant.refreshToken);
      return done("error");
    }
    return done("connected");
  } catch {
    return done("error");
  }
}
