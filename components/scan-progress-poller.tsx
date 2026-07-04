"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 4000;

/**
 * Keeps the Overview/Escaneos pages live while a scan campaign is in
 * progress. Since SCAN-CHAIN-1, a campaign spanning multiple batches
 * completes server-side over potentially several minutes, self-chained
 * independently of this browser tab staying open — nothing client-side
 * drives it forward anymore. This component just periodically asks the
 * server for the current page state so real progress (already derived from
 * `scan_runs` counters — see `ScanInProgress`) becomes visible without a
 * manual reload, and the page naturally reflects completion once the
 * campaign finishes and `activeRun` stops being rendered by the caller.
 */
export function ScanProgressPoller() {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [router]);

  return null;
}
