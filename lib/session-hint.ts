/**
 * header-flicker-skeleton-prehydration (2026-08-20): the `sessionStorage` key
 * and `<html>` attribute name shared by the blocking inline script in
 * `app/layout.tsx` (a Server Component) and the client-side cache in
 * `lib/use-session-user.ts`. Deliberately its own plain module, without
 * `"use client"`: importing a named constant from a client-boundary module
 * into a Server Component doesn't give you the value back — Next.js replaces
 * a "use client" module's exports with opaque client references so they can
 * be handed to JSX, and `app/layout.tsx` needs the literal string to build
 * the script text, not a reference. Confirmed empirically — build once had
 * this constant re-exported from `lib/use-session-user.ts` and the built HTML
 * shipped `sessionStorage.getItem(undefined)`, silently disabling the whole
 * feature. A file with no `"use client"` at the top has no such boundary.
 */
export const SESSION_CACHE_KEY = "gs_session_user_hint";
export const SESSION_HINT_ATTR = "data-session-hint";

/**
 * SESSION-HINT-COOKIE-1 (2026-08-25): a brand-new browser tab has nothing in
 * `sessionStorage` yet — §118's own "pendiente" note — so a logged-in visitor
 * still sees the original "Iniciar sesión" flicker on their very first page
 * of the tab. Supabase's own auth cookie already exists at that point (set at
 * login, not `httpOnly`), so its mere PRESENCE is a second, independent hint:
 * same convention `tests/pilot/support/journey.ts`'s `describeAuthState`
 * already uses to spot an auth cookie ("Nombres, nunca valores" — never read
 * the value, just whether a cookie shaped like one exists).
 *
 * A plain string, not a `RegExp` literal: `app/layout.tsx`'s inline script
 * has to embed this same pattern as literal JS text (`new RegExp(...)`), and
 * a `RegExp` object has no portable way to cross into a `<script>` tag — its
 * `.source` string does, and a plain string constant is exactly that without
 * the indirection.
 */
export const SUPABASE_AUTH_COOKIE_NAME_PATTERN = "^sb-|supabase";

/**
 * Does `cookieString` (the `document.cookie` shape, `"a=1; b=2"`) contain a
 * cookie whose NAME looks like a Supabase auth cookie? Presence only, never
 * the value — this is an optimistic paint hint, not a session check.
 * `fetchSessionUser()` (`lib/use-session-user.ts`) stays the only source of
 * truth, so a false positive here can only mispaint the skeleton for one
 * frame before the real `/api/me` answer corrects it, never grant anything.
 */
export function hasSupabaseAuthCookie(cookieString: string): boolean {
  const pattern = new RegExp(SUPABASE_AUTH_COOKIE_NAME_PATTERN, "i");
  return cookieString
    .split(";")
    .some((pair) => pattern.test(pair.split("=")[0]?.trim() ?? ""));
}
