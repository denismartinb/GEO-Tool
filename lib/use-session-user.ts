"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { SESSION_CACHE_KEY, SESSION_HINT_ATTR, SESSION_PREFETCH_PROP } from "@/lib/session-hint";

export type SessionUser = { email: string; planId: string; planName: string };

/**
 * GENSCORE-HEADER-2 — who is looking at this marketing page, asked from the
 * client so the ~45 public pages stay statically prerendered (see the comment
 * in `app/api/me/route.ts` for why that matters).
 *
 * `null` means "anonymous, or not resolved yet", and callers render the
 * anonymous state for both. That optimism is the deliberate half of the trade:
 * anonymous visitors — practically all marketing traffic, and the entire
 * reason the signup CTA exists — get the right thing with no flicker, while a
 * logged-in visitor sees the anonymous state for the moment it takes to
 * answer. The alternative (render nothing until resolved) delays the CTA for
 * everyone to spare the rare case.
 *
 * pro-badge-alignment-flickering-v4brfv (2026-08-17): a *returning* logged-in
 * visitor reloading a page paid that moment-of-flicker on every single
 * reload, not just their first-ever visit, and the founder flagged it as
 * distracting rather than brief. `SESSION_CACHE_KEY` remembers the last
 * resolved identity in `sessionStorage` (cleared on logout, scoped to the
 * tab — it is `localStorage` since header-flicker-prehydration-2, below)
 * purely as an optimistic paint hint — `fetchSessionUser()` is still the
 * only source of truth and always runs, so a stale or tampered cache value
 * can only ever mispaint for one frame before the real answer corrects it,
 * never grant anything. Read in `useLayoutEffect`, not the `useState`
 * initializer: the initializer also runs during hydration and must match the
 * server-rendered (anonymous) markup exactly, or React flags a hydration
 * mismatch — the very flash this is meant to remove. A layout effect commits
 * its `setState` before the browser paints, so the cached identity replaces
 * the anonymous frame invisibly instead of after a visible flash.
 *
 * header-flicker-skeleton-prehydration (2026-08-20): that layout effect still
 * can't win the very first paint — the browser paints the server-rendered
 * (anonymous) HTML the instant it's parsed, before any JS, React included,
 * has run at all. `app/layout.tsx` closes that specific gap with a blocking
 * inline script — same trick as a dark-mode FOUC guard — that reads this same
 * cache key synchronously and sets `data-session-hint` on `<html>` before the
 * browser paints anything, which `app/globals.css` uses to show a
 * content-free skeleton instead of the anonymous CTAs. That script has no
 * React and no way to know when React has taken over, so this hook clears the
 * attribute itself, in the same layout effect that already reads the cache —
 * by the time this runs, `PublicHeader`'s own conditional render already
 * reflects the truth, so nothing here should keep hiding it. The key and
 * attribute name live in `lib/session-hint.ts`, not here — see that file for
 * why a Server Component can't import them from a `"use client"` module.
 *
 * header-flicker-prehydration-2 (2026-09-19, founder: "aún tarda mucho en
 * aparecer, se ve el parpadeo", móvil y escritorio). The two passes above
 * both attacked the same half of the problem — *painting* the right thing
 * while waiting — and left the wait itself untouched, so the fix kept not
 * feeling like one. Three changes, together:
 *
 * 1. **The cache is `localStorage` now.** `sessionStorage` is per-tab, so the
 *    hint existed only on a second navigation *within one tab*. Every way a
 *    phone actually opens a site — a link from another app, a new tab, after
 *    the browser was closed — started with an empty cache and got the full
 *    anonymous flash. Same trade as before, unchanged: an optimistic paint
 *    hint that `/api/me` overwrites on every single load, so the worst a
 *    stale value can do is mispaint for the moment the answer takes.
 * 2. **The request starts before the bundle.** `fetchSessionUser()` adopts
 *    the promise the blocking inline script in `app/layout.tsx` parked on
 *    `window` (`SESSION_PREFETCH_PROP`). Issuing it from `useEffect` meant it
 *    could not begin until the page's JS had downloaded, parsed and
 *    hydrated — seconds on the landing over 4G, which is the "tarda mucho"
 *    the founder saw. Still one request per load.
 * 3. **Seeded from the console.** `components/session-cache-sync.tsx` writes
 *    the cache from inside `/dashboard`, where the identity is already known
 *    server-side. Without it, the first public page a freshly logged-in
 *    visitor opens is always a cache miss — you log in, land in the console,
 *    click "Manuales GEO", and that first blog page flickers by
 *    construction. It also clears the cache on sign-out, so the hint never
 *    outlives the session that justified it.
 *
 * What none of this fixes, stated rather than glossed: a visitor whose
 * storage is unavailable or cleared (private browsing, a wiped device) still
 * gets the anonymous CTAs first. There is no way around that while the
 * public pages are statically prerendered, which they are on purpose — only
 * (2) shortens it, and it stays shortened.
 */

/** Exported for `use-session-user.test.ts` — the hook itself needs a DOM/React
 *  render harness this repo doesn't carry (`vitest.config.ts` runs `environment:
 *  "node"` on purpose), but this cache layer is plain logic against
 *  `localStorage` and is exactly what the QA pass on
 *  pro-badge-alignment-flickering-v4brfv flagged as untested. */
export function readCachedSessionUser(): SessionUser | null {
  try {
    const raw = localStorage.getItem(SESSION_CACHE_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

export function writeCachedSessionUser(user: SessionUser | null): void {
  try {
    if (user) localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(user));
    else localStorage.removeItem(SESSION_CACHE_KEY);
  } catch {
    // Private browsing / storage disabled: the cache is only an optimistic
    // hint, never the source of truth, so losing it just brings back the
    // original per-reload flicker rather than breaking anything.
  }
}

/**
 * One request per page load, shared by every caller. GENSCORE-HEADER-3 added a
 * second consumer (the home page's promo strip) alongside the header, and two
 * independent `useEffect` fetches would have meant two `/api/me` round trips on
 * the busiest page of the site. Module scope, so a full page load — which is
 * what every auth transition does, since login/logout redirect — starts clean
 * and can never serve a stale identity.
 */
let inFlight: Promise<SessionUser | null> | null = null;

/**
 * The response body the inline script's prefetch resolves to: already parsed
 * JSON (or `null` if the request failed or answered non-2xx), never a
 * `Response` — the script does the `.json()` itself so adopting it here costs
 * nothing and cannot double-consume a body.
 */
type PrefetchedSession = Promise<{ user?: SessionUser | null } | null> | undefined;

/**
 * Hand-off point for change (2) in this file's header comment. Read once and
 * deleted: the promise answers for ONE page load, and leaving it on `window`
 * would let a later mount (after a client-side navigation, or after logout in
 * the same document) adopt an answer from before whatever happened in
 * between. A missing prefetch is not an error — the script skips non-public
 * paths, and storage/network failures leave it undefined — so this falls
 * straight back to issuing the request the way it always did.
 */
function adoptPrefetchedSession(): PrefetchedSession {
  if (typeof window === "undefined") return undefined;
  const holder = window as unknown as Record<string, unknown>;
  const promise = holder[SESSION_PREFETCH_PROP] as PrefetchedSession;
  delete holder[SESSION_PREFETCH_PROP];
  return promise;
}

function fetchSessionUser(): Promise<SessionUser | null> {
  inFlight ??= (adoptPrefetchedSession() ?? fetch("/api/me").then((res) => (res.ok ? res.json() : null)))
    .then((data) => (data?.user as SessionUser | undefined) ?? null)
    .catch(() => {
      // A marketing page must render with or without this. Failing here leaves
      // the anonymous state up, which is the pre-GENSCORE-HEADER-2 behaviour —
      // never a broken header. Cleared so a later mount can retry.
      inFlight = null;
      return null;
    });
  return inFlight;
}

export function useSessionUser(): SessionUser | null {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [resolved, setResolved] = useState(false);

  useLayoutEffect(() => {
    const cached = readCachedSessionUser();
    if (cached) setUser(cached);
    // The skeleton's whole job is to stand in for content nobody can paint
    // truthfully yet, so it is retired only once something true is on screen.
    // With a cached identity that is now, in this same pre-paint commit. With
    // the attribute set but nothing readable behind it — a corrupt or
    // half-cleared cache — clearing here would swap the skeleton for the
    // anonymous CTAs and then, a moment later, for the chip: two paints and a
    // visible flash, which is precisely what this file exists to prevent. In
    // that case the effect below clears it when the answer lands instead.
    if (cached) document.documentElement.removeAttribute(SESSION_HINT_ATTR);
  }, []);

  useEffect(() => {
    let active = true;
    fetchSessionUser().then((resolved) => {
      writeCachedSessionUser(resolved);
      if (active) {
        setUser(resolved);
        setResolved(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  /**
   * The other half of the "retire the skeleton only for something true"
   * rule above. Deliberately a LAYOUT effect keyed on `resolved`, not a line
   * inside the `.then` callback: there the attribute would come off
   * synchronously while `setUser`'s re-render was still only scheduled, so
   * correctness would rest on the browser not painting between a microtask
   * and its flush. Here React has already committed the real content — chip
   * or CTAs — before this runs, so there is nothing to reason about.
   *
   * `fetchSessionUser` never rejects (its own `.catch` resolves to `null`),
   * so `resolved` always arrives and the skeleton can never become permanent:
   * a failed `/api/me` shows the anonymous CTAs, the pre-GENSCORE-HEADER-2
   * behaviour, never a stuck gray bar.
   */
  useLayoutEffect(() => {
    if (resolved) document.documentElement.removeAttribute(SESSION_HINT_ATTR);
  }, [resolved]);

  return user;
}

/** Test seam: the module-level cache would otherwise leak one test's identity into the next. */
export function resetSessionUserCacheForTests(): void {
  inFlight = null;
  writeCachedSessionUser(null);
}
