"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const statusLabels: Record<string, string> = {
  pending: "Pendiente",
  running: "En curso",
  retrying: "Reintentando",
  completed: "Completado",
  failed: "Fallido",
  cancelled: "Cancelado"
};

function getStatusBadgeClass(status: string): string {
  if (status === "completed") return "badge badge-pos";
  if (status === "failed") return "badge badge-neg";
  if (status === "cancelled") return "badge badge-neutral";
  if (status === "running" || status === "retrying") return "badge badge-accent";
  return "badge badge-neutral";
}

type LiveRun = {
  id: string;
  status: string;
  total_prompts: number | null;
  successful_prompts: number | null;
  failed_prompts: number | null;
  /** Analysis-stage counters (EXTRACTION-RELIABILITY-1 Fase C), served by the same poll endpoint. */
  responses_total?: number | null;
  responses_processed?: number | null;
};

/**
 * True when every launch is done but the run is still working — i.e. it is in
 * the extraction stage (Fase C, docs/adr/0029).
 *
 * The "Lanzamientos" counter is NOT wrong during this window: 6 of 6 launches
 * really have finished. What was missing is that the status said only "En
 * curso", so a row reading "En curso · 6/6" gave no hint of what was left,
 * which is the same "looks stuck" problem the full-screen progress had. This
 * column stays about launches — a table cell is the wrong place to switch a
 * counter's unit halfway — and the badge carries the stage instead.
 */
export function isAnalyzing(run: Pick<LiveRun, "status" | "total_prompts" | "successful_prompts" | "failed_prompts">): boolean {
  const total = Number(run.total_prompts ?? 0);
  if (total <= 0) return false;
  if (run.status !== "running" && run.status !== "pending") return false;
  const done = Number(run.successful_prompts ?? 0) + Number(run.failed_prompts ?? 0);
  return done >= total;
}

const POLL_INTERVAL_MS = 3000;

/**
 * Replaces the status-badge and prompts-progress cells for the one Escaneos
 * row that is still pending/running, polling the lightweight status endpoint
 * independently. Completed/failed rows never mount this; their data is
 * static and server-rendered as before.
 *
 * VERCEL-COST-1 (2026-08-30): also owns the terminal/superseded-transition
 * `router.refresh()` that a separate sibling, `ScanProgressPoller`, used to
 * fire on the same page — two independent intervals hitting the same
 * endpoint for no reason (each Edge/Function invocation is a billed
 * Observability event). Mirrors the single-poller pattern
 * `ScanMissionRocket` already uses for the first-scan takeover.
 *
 * Mirrors `statusLabels`/`getStatusBadgeClass` from the Escaneos page rather
 * than importing them — that page module pulls in server-only code, which a
 * client component cannot import.
 */
export function LiveRunStatusCells({ projectId, initial }: { projectId: string; initial: LiveRun }) {
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

  const analyzing = isAnalyzing(run);
  const total = Number(run.total_prompts ?? 0);
  const ok = Number(run.successful_prompts ?? 0);
  const okPct = total > 0 ? (ok / total) * 100 : 0;
  const hasFailed = run.status === "failed" || Number(run.failed_prompts ?? 0) > 0;
  const barColor = run.status === "failed" ? "var(--warn)" : run.status === "completed" ? "var(--pos)" : "var(--accent)";

  return (
    <>
      <td>
        <span className={getStatusBadgeClass(run.status)}>
          {analyzing ? "Analizando" : (statusLabels[run.status] ?? run.status)}
        </span>
      </td>
      <td>
        <div className="run-bar-wrap">
          <div className="run-bar">
            <div className="run-bar-fill" style={{ width: `${Math.min(100, okPct)}%`, background: barColor }} />
          </div>
          <span className="tnum" style={{ fontSize: 12, fontWeight: 650, color: "var(--ink-2)", whiteSpace: "nowrap" }}>
            {ok}/{total}
          </span>
        </div>
        {hasFailed && Number(run.failed_prompts ?? 0) > 0 && (
          <div style={{ fontSize: 11, color: "var(--neg-ink)", marginTop: 2, fontWeight: 650 }}>
            {run.failed_prompts} {Number(run.failed_prompts) === 1 ? "fallo" : "fallos"}
          </div>
        )}
      </td>
    </>
  );
}
