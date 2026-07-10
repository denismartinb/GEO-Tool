"use client";

import { Suspense, useEffect, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";

/**
 * PLATFORM-COMMERCIAL-1: PostHog EU, cookieless — `persistence: "memory"`
 * means no cookie/localStorage identity is written, matching the promise
 * already made in `/cookies` ("no usamos cookies de analítica"). Opt-in via
 * NEXT_PUBLIC_POSTHOG_KEY: unset (the default until the founder creates a
 * PostHog account) means this never calls posthog.init and never loads the
 * PostHog script.
 */
function initPostHog() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key || posthog.__loaded) return;

  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
    person_profiles: "identified_only",
    persistence: "memory",
    capture_pageview: false, // manual below — App Router navigations don't reload the page
    capture_pageleave: true
  });
}

function PostHogPageview() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!posthog.__loaded) return;

    let url = window.origin + pathname;
    const search = searchParams.toString();
    if (search) url += `?${search}`;
    posthog.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams]);

  return null;
}

export function PostHogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    initPostHog();
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
