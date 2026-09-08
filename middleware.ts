import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  ACTIVE_PROJECT_COOKIE,
  getProjectIdFromDomainsQuery,
  getProjectIdFromPathname
} from "@/lib/active-project-cookie";

/**
 * Refreshes the Supabase auth session cookie on every request.
 *
 * Without this, `lib/supabase/server.ts` cannot persist refreshed tokens
 * (its `setAll` is a no-op in Server Components), so sessions can go stale
 * across tabs / SSR navigations. This middleware is the documented
 * counterpart referenced by that file's comment.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          response = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Refresh the session if expired. Required for Server Components, which
  // cannot set cookies themselves. `getClaims()` verifies the JWT locally via
  // WebCrypto when the project uses asymmetric signing keys (confirmed for
  // this project), avoiding the network round trip to the Auth server that
  // `getUser()` always makes — and it falls back to that same live check
  // automatically if local verification isn't available, so this is never
  // weaker than before (docs/architecture-audit-2026-07.md, PERF-4b).
  //
  // This middleware does not gate access — its result is discarded, it only
  // triggers the session-refresh side effect above. The actual authorization
  // checkpoints (`requireUser()` in lib/auth.ts, and the API routes) still
  // call `getUser()` directly and must keep doing so; do not change those.
  await supabase.auth.getClaims();

  // DEBUG-ACTIVE-PROJECT-1 — remember which project the console is currently
  // pointed at, so `/debug` can resolve "the domain selected right now"
  // instead of falling back to "the most recently created project" (see
  // lib/active-project-cookie.ts). Ownership is re-checked with RLS wherever
  // this cookie is read, so a stale or tampered value can only ever miss and
  // fall back — it is never trusted as authorization.
  //
  // DOMAINS-LIVE-SELECT-1 — the second source: `/dashboard/domains?active=`
  // changes which domain is selected without ever matching the pathname
  // regex above, so it needs its own branch to still update the cookie.
  const activeProjectId =
    getProjectIdFromPathname(request.nextUrl.pathname) ??
    getProjectIdFromDomainsQuery(request.nextUrl.pathname, request.nextUrl.searchParams);
  if (activeProjectId) {
    response.cookies.set(ACTIVE_PROJECT_COOKIE, activeProjectId, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30
    });
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - common static asset extensions
     * - VERCEL-COST-1 Fase 3-b (2026-08-31): a subset of the pure
     *   public-marketing surface — comparativas, docs, glosario, gratis + its
     *   API, geo, cookies, privacidad, terminos, que-es-genscore, feed.xml,
     *   llms.txt, robots.txt, sitemap.xml. None of these read the auth
     *   cookie server-side — verified no `supabase`/`getUser`/`getClaims`
     *   usage under any of these route trees — and the public header already
     *   resolves session via its own `fetch('/api/me')` call
     *   (`lib/use-session-user.ts`), a separate request that still passes
     *   through this middleware regardless of whether the page route does.
     *   Every request to this Edge Function is a billed Observability event
     *   regardless of what the handler does.
     *
     *   Deliberately does NOT include `/`, `/blog` or `/pricing`:
     *   `middleware.test.ts` (PRELAUNCH-HARDENING-1 Fase Q4) asserts those
     *   three stay covered, and that invariant isn't revisited here — this
     *   phase only takes the routes the existing test doesn't protect.
     *   Adding a new top-level route to this list needs the same check
     *   first: no Supabase auth read, no ACTIVE_PROJECT_COOKIE dependency
     *   (getProjectIdFromPathname/getProjectIdFromDomainsQuery only ever
     *   match /dashboard/** paths, so they are unaffected either way), and
     *   not one of the three names middleware.test.ts requires covered.
     *
     *   Each literal is bounded to a full path segment — `(?:/|$)` after the
     *   group, `$` after each fixed filename — on purpose: `qa` caught that
     *   a bare prefix (e.g. `geo`) would also silently swallow a future
     *   `/geoscore` or `/docsxyz` route that actually needs the session
     *   refresh. No such route exists today, but this repo has a documented
     *   history of exactly this class of silent matcher mistake.
     */
    "/((?!_next/static|_next/image|favicon\\.ico|(?:api/gratis|comparativas|docs|glosario|gratis|geo|cookies|privacidad|terminos|que-es-genscore)(?:/|$)|feed\\.xml$|llms\\.txt$|robots\\.txt$|sitemap\\.xml$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
