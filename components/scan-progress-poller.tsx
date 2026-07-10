"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 4000;

type ScanStatusRun = { id: string; status: string } | null;

/**
 * Watches the project's latest scan run while one is active, so the
 * Overview/Escaneos pages naturally reflect completion without the user
 * manually reloading. Previously this polled by calling `router.refresh()`
 * on a fixed timer, which re-rendered the whole layout + page — including
 * the unbounded `getWorkspaceCounters` query — every 4s for as long as a
 * scan campaign ran (docs/architecture-audit-2026-07.md, finding 1.5).
 *
 * Now it polls the lightweight `/api/projects/[projectId]/scan-status`
 * endpoint instead, and only triggers a real `router.refresh()` once: when
 * the run transitions to a terminal status (completed/failed/cancelled), or
 * is superseded by a different run id (e.g. SCAN-ROBUST-1's auto-retry
 * creating a fresh pending run). Live progress numbers while the scan is
 * still in flight are rendered separately by `ScanInProgressLive` /
 * `LiveRunStatusCells`, which poll the same endpoint independently — this
 * component itself renders nothing.
 */
export function ScanProgressPoller({ projectId, initialRunId }: { projectId: string; initialRunId: string }) {
  const router = useRouter();
  const lastKnownRunId = useRef(initialRunId);

  useEffect(() => {
    let cancelled = false;

    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/scan-status`, { cache: "no-store" });
        if (!res.ok || cancelled) return;

        const data: { run: ScanStatusRun } = await res.json();
        const run = data.run;
        const isTerminal = !run || ["completed", "failed", "cancelled"].includes(run.status);
        const isSuperseded = Boolean(run) && run!.id !== lastKnownRunId.current;

        if (isTerminal || isSuperseded) {
          clearInterval(id);
          if (!cancelled) router.refresh();
        }
      } catch {
        // Transient network error — the next tick retries.
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [projectId, router]);

  return null;
}
