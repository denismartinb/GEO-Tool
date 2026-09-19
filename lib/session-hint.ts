/**
 * header-flicker-skeleton-prehydration (2026-08-20): the storage key
 * and `<html>` attribute name shared by the blocking inline script in
 * `app/layout.tsx` (a Server Component) and the client-side cache in
 * `lib/use-session-user.ts`. Deliberately its own plain module, without
 * `"use client"`: importing a named constant from a client-boundary module
 * into a Server Component doesn't give you the value back — Next.js replaces
 * a "use client" module's exports with opaque client references so they can
 * be handed to JSX, and `app/layout.tsx` needs the literal string to build
 * the script text, not a reference. Confirmed empirically — build once had
 * this constant re-exported from `lib/use-session-user.ts` and the built HTML
 * shipped `<storage>.getItem(undefined)`, silently disabling the whole
 * feature. A file with no `"use client"` at the top has no such boundary.
 */
export const SESSION_CACHE_KEY = "gs_session_user_hint";
export const SESSION_HINT_ATTR = "data-session-hint";

/**
 * header-flicker-prehydration-2 (2026-09-19, founder-reported: "aún tarda
 * mucho en aparecer, se ve el parpadeo", móvil y escritorio).
 *
 * The identity cache moved from `sessionStorage` to `localStorage` in that
 * same pass, so the constant above now names a `localStorage` key. Both
 * readers go through `lib/use-session-user.ts`; nothing else may touch it
 * directly. Why the move: `sessionStorage` is scoped to ONE tab, so the hint
 * — and with it the whole no-flicker path — was missing on exactly the
 * journeys the founder actually takes on a phone (opening the site from a
 * link, from a new tab, or after the browser was closed). It is still only a
 * paint hint, never authority: `/api/me` runs on every load and is the only
 * thing that can grant or revoke anything.
 *
 * `SESSION_PREFETCH_PROP` is the second half of that pass. The hint could
 * only ever cover a RETURNING visitor; the wait itself (`/api/me` not even
 * being requested until React had downloaded, parsed and hydrated the page's
 * JS — seconds on a phone over 4G, on the landing's bundle) was what made it
 * "tarda mucho". The blocking inline script in `app/layout.tsx` now starts
 * that request itself, before any bundle exists, and parks the promise on
 * `window` under this name; `fetchSessionUser()` adopts it instead of issuing
 * its own. One request either way — just started at first byte instead of
 * after hydration.
 */
export const SESSION_PREFETCH_PROP = "__gsSessionPrefetch";

/**
 * Paths where the prefetch above is pure waste and must not fire: nothing
 * under them renders `PublicHeader` or mounts `useSessionUser`, so the
 * response would be thrown away. Kept as a source-of-truth regex string
 * because the inline script is built as text (see `app/layout.tsx`) and
 * cannot import a `RegExp` object at runtime.
 */
export const NON_PUBLIC_PATH_PATTERN = "^/(dashboard|admin|mfa|login|signup|api)(/|$)";
