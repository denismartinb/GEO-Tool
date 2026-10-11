import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { requireActiveProject } from "@/lib/project-workspace";
import { OAUTH_STATE_TTL_MS, pkceChallenge, randomToken, signOAuthState } from "@/lib/search-console/crypto";
import { buildAuthUrl, getOAuthClient } from "@/lib/search-console/google";
import { GSC_OAUTH_COOKIE, GSC_OAUTH_COOKIE_OPTIONS, packOAuthCookie, screenPath } from "@/lib/search-console/oauth-cookie";

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * SEARCH-SEO-1 Fase 3 (log §284). Starts the read-only Search Console
 * connection: proves the session owns the project, signs a state bound to
 * project, user and a nonce, keeps nonce + PKCE verifier in a single-use
 * httpOnly cookie, and sends the browser to Google's consent screen.
 */
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId") ?? "";
  if (!UUID_PATTERN.test(projectId)) {
    return NextResponse.json({ error: "invalid_project" }, { status: 400 });
  }

  const { user } = await requireUser();
  await requireActiveProject(projectId);

  const client = getOAuthClient();
  const nonce = randomToken();
  const verifier = randomToken(48);
  const state = client ? signOAuthState({ p: projectId, u: user.id, n: nonce, exp: Date.now() + OAUTH_STATE_TTL_MS }) : null;
  if (!client || !state) {
    return NextResponse.redirect(new URL(screenPath(projectId, "error"), request.nextUrl.origin));
  }

  const response = NextResponse.redirect(
    buildAuthUrl({ clientId: client.clientId, state, codeChallenge: pkceChallenge(verifier) })
  );
  response.cookies.set(GSC_OAUTH_COOKIE, packOAuthCookie(nonce, verifier), GSC_OAUTH_COOKIE_OPTIONS);
  return response;
}
