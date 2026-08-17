"use client";

import { Suspense, useEffect, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { PostHog } from "posthog-js";

/**
 * PLATFORM-COMMERCIAL-1: PostHog EU, cookieless — `persistence: "memory"`
 * means no cookie/localStorage identity is written, matching the promise
 * already made in `/cookies` ("no usamos cookies de analítica"). Opt-in via
 * NEXT_PUBLIC_POSTHOG_KEY.
 *
 * PRELAUNCH-HARDENING-1 Fase V (V3): `posthog-js` is imported **dynamically**.
 * It used to be a static top-level import in a component mounted by the root
 * layout, which put the whole SDK (~225 KB of `dist/array.js`) into the shared
 * client chunk of every page — including `/`, `/blog/**`, `/docs/**` and
 * `/pricing`, the surfaces GROWTH-2 exists to rank. Analytics has no business
 * competing with first paint on a marketing page: nothing here needs to run
 * before the page is interactive, and the pageview capture already happened in
 * an effect.
 *
 * Deliberately NOT done to Sentry (`instrumentation-client.ts`), even though
 * it has the same shape: Sentry's entire job is catching errors, *including
 * the early ones*, and this repo has already lost production errors twice to
 * exactly this kind of cleverness — the fire-and-forget `onRequestError`
 * (PR #183) and the `error.tsx` boundary with no `captureException`
 * (PR #223). Trading error visibility for kilobytes is a bad deal.
 */
let posthogPromise: Promise<PostHog | null> | null = null;

function loadPostHog(): Promise<PostHog | null> {
  if (posthogPromise) return posthogPromise;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) {
    // Unset (local dev, and every environment before the founder created the
    // account) — resolve once to null so callers can stay uniform and the
    // dynamic import is never even requested.
    posthogPromise = Promise.resolve(null);
    return posthogPromise;
  }

  posthogPromise = import("posthog-js")
    .then(({ default: posthog }) => {
      if (!posthog.__loaded) {
        posthog.init(key, {
          api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
          person_profiles: "identified_only",
          persistence: "memory",
          capture_pageview: false, // manual below — App Router navigations don't reload the page
          capture_pageleave: true
        });
      }
      return posthog;
    })
    .catch(() => {
      // A blocked or failed chunk request must not take the page down with it.
      // Analytics is the most optional thing on any of these screens.
      return null;
    });

  return posthogPromise;
}

function PostHogPageview() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    let cancelled = false;

    // Capturing the URL synchronously matters: by the time the dynamic import
    // resolves the user may already have navigated, and the previous code's
    // `window.origin` read would then describe the wrong page.
    let url = window.origin + pathname;
    const search = searchParams.toString();
    if (search) url += `?${search}`;

    void loadPostHog().then((posthog) => {
      if (!posthog || cancelled) return;
      posthog.capture("$pageview", { $current_url: url });
    });

    return () => {
      cancelled = true;
    };
  }, [pathname, searchParams]);

  return null;
}

export function PostHogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void loadPostHog();
  }, []);

  return (
    <>
      <Suspense fallback={null}>
        <PostHogPageview />
      </Suspense>
      {children}
    </>
  );
}
