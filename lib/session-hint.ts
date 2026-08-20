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
