"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { tabPrefetchTargets } from "@/lib/ins/tab-prefetch";

/**
 * APP-TABS-INSTANT-1 (log §390). Only inside the Android app: once the console
 * is idle, fully prefetch the first screen of every tab in `INS_TABS` for the open
 * project, so tapping a tab paints at once instead of loading like a web page.
 * The data comes from the server with the user's own session and lives only in
 * the in-memory router cache (never in the service worker), for as long as
 * `staleTimes` allows. Renders nothing.
 */
export function AppTabPrefetch() {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    const targets = tabPrefetchTargets(pathname);
    if (targets.length === 0) return;
    const run = () => {
      for (const href of targets) router.prefetch(href, { kind: "full" } as unknown as Parameters<typeof router.prefetch>[1]);
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(run);
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(run, 800);
    return () => window.clearTimeout(t);
  }, [pathname, router]);
  return null;
}
