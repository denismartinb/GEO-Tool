"use client";

import { useEffect, useState } from "react";

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
};

const POLL_INTERVAL_MS = 3000;

/**
 * Replaces the status-badge and prompts-progress cells for the one Escaneos
 * row that is still pending/running, polling the lightweight status endpoint
 * independently instead of relying on the page-level `router.refresh()` —
 * which the sibling `ScanProgressPoller` now only triggers once, on terminal
 * transition (docs/architecture-audit-2026-07.md, PERF-3b). Completed/failed
 * rows never mount this; their data is static and server-rendered as before.
 *
 * Mirrors `statusLabels`/`getStatusBadgeClass` from the Escaneos page rather
 * than importing them — that page module pulls in server-only code, which a
 * client component cannot import.
 */
export function LiveRunStatusCells({ projectId, initial }: { projectId: string; initial: LiveRun }) {
  const [run, setRun] = useState<LiveRun>(initial);

  useEffect(() => {
    let cancelled = false;

    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/scan-status`, { cache: "no-store" });
        if (!res.ok || cancelled) return;

        const data: { run: LiveRun | null } = await res.json();
        if (!data.run || data.run.id !== initial.id) return; // superseded — the page-level refresh handles it

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

  const total = Number(run.total_prompts ?? 0);
  const ok = Number(run.successful_prompts ?? 0);
  const okPct = total > 0 ? (ok / total) * 100 : 0;
  const hasFailed = run.status === "failed" || Number(run.failed_prompts ?? 0) > 0;
  const barColor = run.status === "failed" ? "var(--warn)" : run.status === "completed" ? "var(--pos)" : "var(--accent)";

  return (
    <>
      <td>
        <span className={getStatusBadgeClass(run.status)}>{statusLabels[run.status] ?? run.status}</span>
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
