"use client";

import { useEffect, useLayoutEffect, useState } from "react";

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
 */
const SESSION_CACHE_KEY = "gs_session_user_hint";

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
