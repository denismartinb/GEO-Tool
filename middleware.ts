import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
