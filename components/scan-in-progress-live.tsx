"use client";

import { useEffect, useState } from "react";
import { ScanInProgress, type ActiveScanRun } from "@/components/scan-in-progress";

type LiveRun = ActiveScanRun & { id: string };

const POLL_INTERVAL_MS = 3000;

/**
 * Client-polling wrapper around the presentational `ScanInProgress`, so the
 * live "X de Y prompts" counter keeps animating without the page-level
 * `router.refresh()` that `ScanProgressPoller` now only fires once, on
 * terminal transition (docs/architecture-audit-2026-07.md, PERF-3b).
 *
 * Ignores responses for a different run id (superseded by an auto-retry) —
 * the sibling `ScanProgressPoller` detects that case and refreshes the whole
 * page, which remounts this component with the new run as `initial`.
 */
export function ScanInProgressLive({ projectId, initial }: { projectId: string; initial: LiveRun }) {
  const [run, setRun] = useState<LiveRun>(initial);

  useEffect(() => {
    let cancelled = false;

    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/scan-status`, { cache: "no-store" });
        if (!res.ok || cancelled) return;

        const data: { run: LiveRun | null } = await res.json();
        if (!data.run || data.run.id !== initial.id) return;

        setRun(data.run);
        if (data.run.status !== "pending" && data.run.status !== "running") {
          clearInterval(id);
        }
      } catch {
        // Transient network error — the next tick retries.
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [projectId, initial.id]);

  return <ScanInProgress activeRun={run} />;
}
