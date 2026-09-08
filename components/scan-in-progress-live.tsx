"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScanInProgress, type ActiveScanRun } from "@/components/scan-in-progress";

type LiveRun = ActiveScanRun & { id: string };

const POLL_INTERVAL_MS = 3000;

/**
 * Client-polling wrapper around the presentational `ScanInProgress`, so the
 * live "X de Y prompts" counter keeps animating.
 *
 * VERCEL-COST-1 (2026-08-30): also owns the terminal/superseded-transition
 * `router.refresh()` that a separate sibling, `ScanProgressPoller`, used to
 * fire on the same page — two independent intervals hitting the same
 * endpoint for no reason (each Edge/Function invocation is a billed
 * Observability event). Mirrors the single-poller pattern
 * `ScanMissionRocket` already uses for the first-scan takeover.
 */
export function ScanInProgressLive({ projectId, initial }: { projectId: string; initial: LiveRun }) {
  const router = useRouter();
  const [run, setRun] = useState<LiveRun>(initial);

  useEffect(() => {
    let cancelled = false;

    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/scan-status`, { cache: "no-store" });
        if (!res.ok || cancelled) return;

        const data: { run: LiveRun | null } = await res.json();
        const live = data.run;
        const isTerminal = !live || (live.status !== "pending" && live.status !== "running");
        const isSuperseded = Boolean(live) && live!.id !== initial.id;

        if (isTerminal || isSuperseded) {
          clearInterval(id);
          if (!cancelled) router.refresh();
          return;
        }

        if (live) setRun(live);
      } catch {
        // Transient network error — the next tick retries.
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [projectId, initial.id, router]);

  return <ScanInProgress activeRun={run} />;
}
