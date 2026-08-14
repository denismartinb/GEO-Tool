"use client";

import { useEffect, useState } from "react";

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
 */

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

  useEffect(() => {
    let active = true;
    fetchSessionUser().then((resolved) => {
      if (active && resolved) setUser(resolved);
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
}
