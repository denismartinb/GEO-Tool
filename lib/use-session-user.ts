"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { SESSION_CACHE_KEY, SESSION_HINT_ATTR } from "@/lib/session-hint";

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
 * tab) purely as an optimistic paint hint — `fetchSessionUser()` is still the
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
 * SESSION-HINT-COOKIE-1 (2026-08-25): the inline script now sets this same
 * attribute from a second, independent hint too — a Supabase auth cookie's
 * mere presence, checked when `sessionStorage` has nothing cached yet (a
 * brand-new tab). This hook doesn't need to know which hint fired: either way
 * the attribute is cleared here, on the same layout effect, once the real
 * render has already decided what to show.
 */

/** Exported for `use-session-user.test.ts` — the hook itself needs a DOM/React
 *  render harness this repo doesn't carry (`vitest.config.ts` runs `environment:
 *  "node"` on purpose), but this cache layer is plain logic against
 *  `sessionStorage` and is exactly what the QA pass on
 *  pro-badge-alignment-flickering-v4brfv flagged as untested. */
export function readCachedSessionUser(): SessionUser | null {
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

export function writeCachedSessionUser(user: SessionUser | null): void {
  try {
    if (user) sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(user));
    else sessionStorage.removeItem(SESSION_CACHE_KEY);
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

function fetchSessionUser(): Promise<SessionUser | null> {
  inFlight ??= fetch("/api/me")
    .then((res) => (res.ok ? res.json() : null))
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

  useLayoutEffect(() => {
    const cached = readCachedSessionUser();
    if (cached) setUser(cached);
    document.documentElement.removeAttribute(SESSION_HINT_ATTR);
  }, []);

  useEffect(() => {
    let active = true;
    fetchSessionUser().then((resolved) => {
      writeCachedSessionUser(resolved);
      if (active) setUser(resolved);
    });
    return () => {
      active = false;
    };
  }, []);

  return user;
}

/** Test seam: the module-level cache would otherwise leak one test's identity into the next. */
export function resetSessionUserCacheForTests(): void {
  inFlight = null;
  writeCachedSessionUser(null);
}
