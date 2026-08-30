"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 4000;

type ScanStatusRun = { id: string; status: string } | null;

/**
 * Watches the project's latest scan run while one is active, so the page
 * naturally reflects completion without the user manually reloading.
 *
 * VERCEL-COST-1 (2026-08-30) narrowed this to a single mount point: Overview's
 * `hasData` branch (a rescan on a project that already has a completed run/
 * score). Every other branch now owns its own terminal-refresh directly —
 * `ScanInProgressLive` in Overview's empty-state branch, `LiveRunStatusCells`
 * on Debug/Escaneos — so this no longer runs alongside either of them. It
 * used to be mounted unconditionally whenever `activeRun` existed, which is
 * exactly what let it cover the `hasData` branch; removing it outright (the
 * original VERCEL-COST-1 change) silently dropped that branch's only
 * terminal-transition detector, since neither of the other two live-display
 * components mounts there — caught by `qa` before Human Gate, not by
 * `pnpm test` (no test file covers either live-display component) or the
 * default pilot journeys (none force a rescan on a project with prior data).
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
