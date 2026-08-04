import React from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { Delta } from "@/components/ui/delta";
import { AutoExecuteScan } from "@/components/auto-execute-scan";
import { ScanProgressPoller } from "@/components/scan-progress-poller";
import { LiveRunStatusCells } from "@/components/live-run-status-cells";
import { ScanTriggerButton } from "@/components/scan-trigger-button";
import { requireUser } from "@/lib/auth";
import { requireActiveProject, getWorkspaceCounters } from "@/lib/project-workspace";
import {
  ENABLE_SYNC_SCAN_EXECUTION,
  getRunErrorDisplay,
  reconcileStuckScanRuns,
  scanRunsNeedReconciliation
} from "@/lib/scan/scan-runner";
import { feedbackErrorMessages, feedbackSuccessMessages } from "@/lib/projects/feedback-messages";
import { createServiceClient } from "@/lib/supabase/service";
import { setRecurringScans } from "../actions";
import { DeleteDomainButton } from "./delete-domain-button";

// Server Actions inherit the maxDuration of the page they're invoked from
// (docs/adr/0003). `autoExecutePendingScan` needs the full 60s Vercel budget:
// it runs a window of scan batches per call (up to
// AUTO_EXECUTE_TIME_BUDGET_MS ~40s). The domain-coverage audit moved to the
// Auditoría web page (WEB-AUDIT-1), which carries its own maxDuration.
export const maxDuration = 60;

/* ---- Status helpers ---- */

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

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Madrid"
  });
}

function formatDateShort(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Madrid"
  });
}

/**
 * Real wall-clock duration of a run (`finished_at - started_at`), shown so
 * the founder can see how close a scan ran to the 60s Vercel maxDuration
 * ceiling (docs/adr/0003) — especially relevant while MAX_REAL_SCAN_PROMPTS
 * is being monitored at 10 (docs/adr/0009 addendum, 2026-06-17).
 */
function formatDurationSeconds(
  startedAt: string | null | undefined,
  finishedAt: string | null | undefined
): string | null {
  if (!startedAt || !finishedAt) return null;
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return `${(ms / 1000).toFixed(1)}s`;
}

/* ---- Domain grid (Escaneos · dominios monitorizados) ---- */

const DOMAIN_FAVICON_COLORS = ["#6366f1", "#0d9488", "#d9772b", "#9333a8", "#3b6fd6", "#e54563"];

function domainFaviconColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return DOMAIN_FAVICON_COLORS[hash % DOMAIN_FAVICON_COLORS.length];
}

type DomainCardData = {
  id: string;
  name: string;
  domain: string;
  country: string;
  language: string;
  score: number | null;
  scoreDelta: number | null;
  promptCount: number;
  runCount: number;
  lastScanLabel: string;
  isScanning: boolean;
};

function DomainCard({ d, active, currentProjectId }: { d: DomainCardData; active: boolean; currentProjectId: string }) {
  return (
    <div className={`dom-card${active ? " sel" : ""}`} style={{ padding: 0 }}>
      <Link
        href={`/dashboard/projects/${d.id}/runs`}
        className="dom-card-link"
        style={{ display: "block", padding: "16px 17px" }}
      >
        <div className="dom-top">
          <span className="dom-fav" style={{ background: domainFaviconColor(d.domain || d.name) }}>
            {d.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="dom-id">
            <div className="dom-name">{d.name}</div>
            <div className="dom-domain">{d.domain}</div>
          </div>
          {d.isScanning ? (
            <span className="scan-status">
              <span className="dot run" />
              Escaneando
            </span>
          ) : null}
        </div>
        <div className="dom-meta">
          <div className="dom-stat">
            {d.score === null ? (
              <div className="v" style={{ color: "var(--ink-4)", fontSize: 14 }}>—</div>
            ) : (
              <div className="v">
                {d.score}
                {d.scoreDelta !== null ? <Delta value={d.scoreDelta} /> : null}
              </div>
            )}
            <div className="l">Puntuación GEO</div>
          </div>
          <div className="dom-stat">
            <div className="v">{d.promptCount}</div>
            <div className="l">Prompts</div>
          </div>
          <div className="dom-stat">
            <div className="v">{d.runCount}</div>
            <div className="l">Escaneos</div>
          </div>
          <div className="spacer" />
          <div style={{ textAlign: "right" }}>
            <div className="dom-scan" style={{ justifyContent: "flex-end" }}>
              {d.country} · {d.language}
            </div>
            <div className="dom-scan" style={{ justifyContent: "flex-end", marginTop: 5 }}>
              <Icon name="info" size={12} />
              {d.lastScanLabel}
            </div>
          </div>
        </div>
      </Link>
      <DeleteDomainButton projectId={d.id} domainName={d.domain || d.name} isCurrentProject={d.id === currentProjectId} />
    </div>
  );
}

/* ---- Page ---- */

export default async function RunsPage({
  params,
  searchParams
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { projectId } = await params;
  const feedback = await searchParams;
  const project = await requireActiveProject(projectId);
  const { supabase } = await requireUser();

  const RUNS_SELECT =
    "id, status, error_summary, total_prompts, successful_prompts, failed_prompts, created_at, started_at, finished_at";

  // Reconciliation itself is decided below from the already-fetched runs
  // instead of running unconditionally on every render
  // (docs/architecture-audit-2026-07.md, finding 1.3 / PERF-3a).
  const { data: runsData } = await supabase
    .from("scan_runs")
    .select(RUNS_SELECT)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(50);

  let allRuns = runsData ?? [];
  if (scanRunsNeedReconciliation(allRuns)) {
    // Reconcile any stuck pending/running runs (or retry an exhausted
    // zero-result failure), then re-read scan_runs so the Escaneos table
    // reflects the corrected status instead of the pre-reconciliation
    // snapshot (docs/scan-lifecycle.md, "Timeout detection"). Must complete
    // before `getWorkspaceCounters()` below so the domain cards' scan status
    // is also correct.
    const { reconciledCount } = await reconcileStuckScanRuns({ projectId, service: createServiceClient() });
    if (reconciledCount > 0) {
      const { data: refreshedRuns } = await supabase
        .from("scan_runs")
        .select(RUNS_SELECT)
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(50);
      allRuns = refreshedRuns ?? [];
    }
  }

  const feedbackErrorMessage = feedback.error
    ? feedbackErrorMessages[feedback.error] ?? feedbackErrorMessages.unexpected_error
    : null;
  const feedbackSuccessMessage = feedback.success ? feedbackSuccessMessages[feedback.success] ?? null : null;

  /* Domains grid — reuses the same counters/queries as the dashboard sidebar */
  const {
    projects: workspaceProjects,
    promptCountByProject,
    completedRunCountByProject,
    latestScanStatusByProject,
    latestScanDateByProject,
    latestScoreByProject,
    scoreDeltaByProject
  } = await getWorkspaceCounters();

  const domainCards: DomainCardData[] = workspaceProjects.map((p) => {
    const status = latestScanStatusByProject[p.id];
    const isScanning = status === "pending" || status === "running" || status === "retrying";
    const lastScanDate = latestScanDateByProject[p.id] ?? null;
    return {
      id: p.id,
      name: p.name,
      domain: p.domain,
      country: p.country,
      language: p.language,
      score: latestScoreByProject[p.id] ?? null,
      scoreDelta: scoreDeltaByProject[p.id] ?? null,
      promptCount: promptCountByProject[p.id] ?? 0,
      runCount: completedRunCountByProject[p.id] ?? 0,
      lastScanLabel: isScanning ? "Escaneando…" : formatDateShort(lastScanDate),
      isScanning
    };
  });

  const completedRuns = allRuns.filter((r) => r.status === "completed");
  const completedRunIds = completedRuns.map((r) => r.id);

  /* Fetch scores only for completed runs */
  const { data: scores } =
    completedRunIds.length > 0
      ? await supabase
          .from("run_scores")
          .select("run_id, visibility_score, details_json")
          .eq("project_id", projectId)
          .in("run_id", completedRunIds)
      : { data: [] };

  // Runs whose extractions all failed are left OUT of the map entirely rather
  // than entered as 0 — the column is non-null, so 0 is what an unmeasured run
  // stores, and both the score column and the delta column read from here
  // (geo-score-v4, docs/adr/0027).
  const scoreByRunId = new Map<string, number>(
    (scores ?? [])
      .filter((s) => {
        const details =
          s.details_json && typeof s.details_json === "object"
            ? (s.details_json as { scored_results_count?: unknown })
            : {};
        return !(typeof details.scored_results_count === "number" && details.scored_results_count === 0);
      })
      .map((s) => [s.run_id, Math.round(Number(s.visibility_score ?? 0))])
  );

  /* Summary stats */
  const totalCompletedRuns = completedRuns.length;
  const totalSuccessfulPrompts = completedRuns.reduce(
    (acc, r) => acc + Number(r.successful_prompts ?? 0),
    0
  );
  const lastCompletedRun = completedRuns[0]; // runs are sorted desc already
  const latestRun = allRuns[0];

  /* Build ordered list for delta computation (oldest first for completed runs) */
  const completedRunsOldestFirst = [...completedRuns].reverse();

  /* Compute delta for each completed run vs its predecessor */
  const scoreDeltas = new Map<string, number | null>();
  for (let i = 0; i < completedRunsOldestFirst.length; i++) {
    const run = completedRunsOldestFirst[i];
    if (i === 0) {
      scoreDeltas.set(run.id, null); // first ever run — no previous
    } else {
      const prevRun = completedRunsOldestFirst[i - 1];
      const curr = scoreByRunId.get(run.id) ?? null;
      const prev = scoreByRunId.get(prevRun.id) ?? null;
      if (curr !== null && prev !== null) {
        scoreDeltas.set(run.id, curr - prev);
      } else {
        scoreDeltas.set(run.id, null);
      }
    }
  }

  /* Assign run number (1 = oldest) */
  const runNumberByRunId = new Map<string, number>();
  const runsOldestFirst = [...allRuns].reverse();
  runsOldestFirst.forEach((r, i) => {
    runNumberByRunId.set(r.id, i + 1);
  });

  /* Active run detection */
  const activeRun = allRuns.find(
    (r) => r.status === "pending" || r.status === "running" || r.status === "retrying"
  );

  // A run created without sync execution (e.g. right after onboarding) is
  // still `pending` here. Trigger its execution now that the user has landed
  // on this page, so they see real progress instead of waiting on creation.
  //
  // Mount the driver while the run is pending OR running (not just pending):
  // a multi-batch campaign (SCAN-CHAIN-1) transitions to `running` after its
  // first batch, and the client driver (AutoExecuteScan) must stay mounted to
  // keep re-driving the remaining batches — unmounting it the moment the run
  // left `pending` would strand the campaign after batch 1. AutoExecuteScan
  // guards against double-starting its own loop across re-renders.
  const shouldAutoExecute =
    ENABLE_SYNC_SCAN_EXECUTION && (activeRun?.status === "pending" || activeRun?.status === "running");

  const hasMultipleCompleted = completedRuns.length >= 2;

  /* First-scan / scan-in-progress banner state */
  const otherScanningDomains = domainCards.filter((d) => d.id !== projectId && d.isScanning);
  const isThisProjectScanning = Boolean(activeRun);
  const isFirstRunForThisProject = isThisProjectScanning && allRuns.length === 1;
  const anyScanning = isThisProjectScanning || otherScanningDomains.length > 0;
  const isFirstScanMode = isFirstRunForThisProject && otherScanningDomains.length === 0;

  const scanningNames = [
    ...(isThisProjectScanning ? [project.domain] : []),
    ...otherScanningDomains.map((d) => d.domain)
  ];

  return (
    <div className="page">
      {shouldAutoExecute && activeRun ? (
        <AutoExecuteScan projectId={projectId} runId={activeRun.id} />
      ) : null}
      {activeRun ? <ScanProgressPoller projectId={projectId} initialRunId={activeRun.id} /> : null}

      {/* Sticky header */}
      <div className="ov-sticky-header">
        <div className="ov-sticky-left">
          <div>
            <p className="kicker" style={{ marginBottom: 2 }}>Escaneos</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{ fontSize: 15, fontWeight: 750, color: "var(--ink)", letterSpacing: "-.01em" }}
              >
                {project.name}
              </span>
              <span
                className="badge badge-neutral"
                style={{ fontFamily: "var(--mono)", fontSize: 11 }}
              >
                {project.domain}
              </span>
              {activeRun ? (
                <span className="scan-status">
                  <span className="dot run" />
                  Escaneo en curso
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="ov-sticky-right">
          {lastCompletedRun && (
            <span className="badge badge-pos" style={{ fontSize: 11 }}>
              Escaneado {new Date(lastCompletedRun.finished_at ?? lastCompletedRun.created_at)
                .toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid" })}
            </span>
          )}
        </div>
      </div>

      {feedbackErrorMessage && (
        <p className="feedback error" style={{ marginBottom: 16 }}>{feedbackErrorMessage}</p>
      )}
      {feedbackSuccessMessage && (
        <p className="feedback success" style={{ marginBottom: 16 }}>{feedbackSuccessMessage}</p>
      )}

      {/* First-scan / scan-in-progress banner */}
      {anyScanning ? (
        <div className="firstscan-banner">
          <div className="fb-ico">
            <Icon name="resonance" size={18} />
            <span className="fb-spin"></span>
          </div>
          <div style={{ flex: 1 }}>
            <div className="fb-t">
              {isFirstScanMode ? "Tu primer escaneo está en curso" : "Escaneo en curso"}
            </div>
            <div className="fb-d">
              {isFirstScanMode ? (
                <>
                  Estamos analizando <b>{project.domain}</b>
                </>
              ) : (
                <>
                  {scanningNames.length}{" "}
                  {scanningNames.length === 1
                    ? "dominio se está escaneando"
                    : "dominios se están escaneando"}{" "}
                  ahora mismo: <b>{scanningNames.join(", ")}</b>.
                </>
              )}
            </div>
          </div>
          <span className="st-chip st-scanning">
            <span className="d" />
            Escaneando
          </span>
        </div>
      ) : null}

      {/* Summary banner */}
      {!(totalCompletedRuns === 0 && isThisProjectScanning) && (
        <div className="summary mt8">
          <div className="summary-ico">
            <Icon name="runs" size={20} />
          </div>
          <p className="summary-txt">
            {totalCompletedRuns === 0 ? (
              <>
                Este dominio todavía no tiene escaneos completados.{" "}
                <b>Lanza el primer escaneo</b> desde la{" "}
                <Link
                  href={`/dashboard/projects/${projectId}`}
                  style={{ color: "var(--accent)", fontWeight: 700 }}
                >
                  visión general
                </Link>
                .
              </>
            ) : (
              <>
                <b>{totalCompletedRuns} {totalCompletedRuns === 1 ? "escaneo completado" : "escaneos completados"}</b>
                {" · "}
                <b>{totalSuccessfulPrompts} {totalSuccessfulPrompts === 1 ? "prompt procesado" : "prompts procesados"}</b>
                {lastCompletedRun ? (
                  <>
                    {" · "}Último:{" "}
                    <b>{formatDateShort(lastCompletedRun.finished_at ?? lastCompletedRun.created_at)}</b>
                  </>
                ) : null}
              </>
            )}
          </p>
        </div>
      )}

      {/* Weekly automatic scan (opt-in) */}
      {totalCompletedRuns > 0 && (
        <div
          className="card"
          style={{
            marginTop: 14,
            padding: "14px 17px",
            display: "flex",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap"
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "var(--surface-sunk)",
              display: "grid",
              placeItems: "center",
              color: project.recurring_scans_enabled ? "var(--accent)" : "var(--ink-3)",
              flexShrink: 0
            }}
          >
            <Icon name="runs" size={17} />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13.5, fontWeight: 750, color: "var(--ink)" }}>
                Escaneo automático diario
              </span>
            </div>
          </div>
          {project.recurring_scans_enabled || totalCompletedRuns > 0 ? (
            <form action={setRecurringScans}>
              <input type="hidden" name="projectId" value={projectId} />
              <input
                type="hidden"
                name="enabled"
                value={project.recurring_scans_enabled ? "false" : "true"}
              />
              <button
                type="submit"
                className={`switch-toggle ${project.recurring_scans_enabled ? "on" : ""}`}
                role="switch"
                aria-checked={project.recurring_scans_enabled}
                aria-label="Escaneo automático diario"
              />
            </form>
          ) : null}
        </div>
      )}

      {/* Domains grid */}
      {domainCards.length > 0 ? (
        <>
          <div className="section-head">
            <div className="section-title">Dominios monitorizados</div>
            <div className="section-desc">
              {domainCards.length === 1
                ? "Tu dominio activo"
                : `${domainCards.length} dominios · el activo es el que estás viendo`}
            </div>
            <div className="right">
              <Link href="/dashboard/projects/new" className="btn btn-primary btn-sm">
                <Icon name="plus" size={14} />
                Añadir dominio
              </Link>
            </div>
          </div>
          <div className="dom-grid">
            {domainCards.map((d) => (
              <DomainCard key={d.id} d={d} active={d.id === projectId} currentProjectId={projectId} />
            ))}
          </div>
        </>
      ) : null}

      {/* Section header */}
      <div className="section-head">
        <div className="section-title">Historial de escaneos</div>
        <div className="section-desc">
          {allRuns.length > 0
            ? `${allRuns.length} ${allRuns.length === 1 ? "escaneo" : "escaneos"} en total`
            : "Sin escaneos todavía"}
        </div>
        <div className="right">
          <ScanTriggerButton projectId={projectId} disabled={Boolean(activeRun)} label="Repetir escaneo" />
        </div>
      </div>

      {/* Empty state */}
      {allRuns.length === 0 ? (
        <div className="card" style={{ padding: "48px 40px", textAlign: "center" }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "999px",
              background: "var(--surface-sunk)",
              display: "grid",
              placeItems: "center",
              color: "var(--ink-3)",
              margin: "0 auto 16px"
            }}
          >
            <Icon name="runs" size={22} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 750, color: "var(--ink)", marginBottom: 8 }}>
            Todavía no hay escaneos
          </div>
          <div
            style={{ fontSize: 13.5, color: "var(--ink-3)", maxWidth: 380, margin: "0 auto 20px", lineHeight: 1.6 }}
          >
            El dominio ya está configurado. Revisa los prompts y competidores, y lanza el primer
            escaneo desde la visión general.
          </div>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link
              href={`/dashboard/projects/${projectId}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 13,
                fontWeight: 650,
                color: "var(--accent)"
              }}
            >
              <Icon name="play" size={13} />
              Lanzar escaneo
            </Link>
            <Link
              href={`/dashboard/projects/${projectId}/prompts`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 13,
                fontWeight: 650,
                color: "var(--ink-2)"
              }}
            >
              <Icon name="prompts" size={13} />
              Revisar prompts
            </Link>
            <Link
              href={`/dashboard/projects/${projectId}/competitors`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 13,
                fontWeight: 650,
                color: "var(--ink-2)"
              }}
            >
              <Icon name="competitors" size={13} />
              Revisar competidores
            </Link>
          </div>
        </div>
      ) : (
        /* Run history table */
        <div className="card">
          <div style={{ padding: "6px 6px 4px", overflowX: "auto" }}>
            <table className="run-tbl">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Prompts</th>
                  <th className="num">GEO Score</th>
                  {hasMultipleCompleted ? <th className="num">Δ Score</th> : null}
                </tr>
              </thead>
              <tbody>
                {allRuns.map((run) => {
                  const runNum = runNumberByRunId.get(run.id) ?? 1;
                  const total = Number(run.total_prompts ?? 0);
                  const ok = Number(run.successful_prompts ?? 0);
                  const okPct = total > 0 ? (ok / total) * 100 : 0;
                  const hasFailed = run.status === "failed" || Number(run.failed_prompts ?? 0) > 0;
                  const barColor =
                    run.status === "failed"
                      ? "var(--warn)"
                      : run.status === "completed"
                      ? "var(--pos)"
                      : "var(--accent)";

                  const geoScore =
                    run.status === "completed" ? (scoreByRunId.get(run.id) ?? null) : null;
                  const delta = hasMultipleCompleted ? (scoreDeltas.get(run.id) ?? null) : null;
                  const errorDisplay =
                    run.status === "failed" ? getRunErrorDisplay(run.error_summary) : null;
                  const durationLabel = formatDurationSeconds(run.started_at, run.finished_at);

                  return (
                    <React.Fragment key={run.id}>
                      <tr>
                        {/* # */}
                        <td
                          className="num"
                          style={{ color: "var(--ink-4)", fontWeight: 700, fontSize: 12 }}
                        >
                          {runNum}
                        </td>

                        {/* Date */}
                        <td>
                          <div
                            style={{ fontSize: 12.5, fontWeight: 650, color: "var(--ink)" }}
                          >
                            {formatDateShort(run.created_at)}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 1 }}>
                            {run.finished_at
                              ? `Fin: ${formatDate(run.finished_at)}`
                              : run.started_at
                              ? `Inicio: ${formatDate(run.started_at)}`
                              : "Pendiente de inicio"}
                            {durationLabel ? ` · Duración: ${durationLabel}` : null}
                          </div>
                        </td>

                        {run.status === "pending" || run.status === "running" ? (
                          /* Live cells (PERF-3b): poll independently instead of relying on
                             the page-level router.refresh() the sibling ScanProgressPoller
                             now only fires once, on terminal transition. */
                          <LiveRunStatusCells
                            projectId={projectId}
                            initial={{
                              id: run.id,
                              status: run.status,
                              total_prompts: run.total_prompts,
                              successful_prompts: run.successful_prompts,
                              failed_prompts: run.failed_prompts
                            }}
                          />
                        ) : (
                          <>
                            {/* Status badge */}
                            <td>
                              <span className={getStatusBadgeClass(run.status)}>
                                {statusLabels[run.status] ?? run.status}
                              </span>
                            </td>

                            {/* Prompts progress bar */}
                            <td>
                              <div className="run-bar-wrap">
                                <div className="run-bar">
                                  <div
                                    className="run-bar-fill"
                                    style={{ width: `${Math.min(100, okPct)}%`, background: barColor }}
                                  />
                                </div>
                                <span
                                  className="tnum"
                                  style={{ fontSize: 12, fontWeight: 650, color: "var(--ink-2)", whiteSpace: "nowrap" }}
                                >
                                  {ok}/{total}
                                </span>
                              </div>
                              {hasFailed && Number(run.failed_prompts ?? 0) > 0 && (
                                <div
                                  style={{ fontSize: 11, color: "var(--neg-ink)", marginTop: 2, fontWeight: 650 }}
                                >
                                  {run.failed_prompts} {Number(run.failed_prompts) === 1 ? "fallo" : "fallos"}
                                </div>
                              )}
                            </td>
                          </>
                        )}

                        {/* GEO Score */}
                        <td className="num">
                          {geoScore !== null ? (
                            <b className="tnum" style={{ fontSize: 14, color: "var(--ink)" }}>
                              {geoScore}
                            </b>
                          ) : (
                            <span style={{ color: "var(--ink-4)" }}>—</span>
                          )}
                        </td>

                        {/* Delta (only if >=2 completed runs) */}
                        {hasMultipleCompleted ? (
                          <td className="num">
                            {delta !== null ? (
                              <Delta value={delta} suffix=" pt" />
                            ) : (
                              <span
                                style={{ fontSize: 11.5, color: "var(--ink-4)" }}
                                title="Sin histórico previo"
                              >
                                —
                              </span>
                            )}
                          </td>
                        ) : null}
                      </tr>

                      {/* Error / notice detail sub-row. Raw `error_summary` values
                          (e.g. internal timeout reasons) are never rendered
                          directly — getRunErrorDisplay maps them to a
                          user-facing message and a "notice" (neutral, e.g.
                          "auto-retrying") vs "error" (genuine terminal
                          failure) treatment. See PR #78. */}
                      {errorDisplay ? (
                        <tr key={`${run.id}-err`} className="run-error-row">
                          <td colSpan={hasMultipleCompleted ? 6 : 5}>
                            <div className={errorDisplay.kind === "notice" ? "run-notice-pill" : "run-error-pill"}>
                              <Icon name={errorDisplay.kind === "notice" ? "refresh" : "info"} size={14} />
                              <span>
                                {errorDisplay.kind === "error" ? <b>Error: </b> : null}
                                {errorDisplay.message}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer links */}
      <div
        style={{
          display: "flex",
          gap: 20,
          marginTop: 28,
          paddingTop: 18,
          borderTop: "1px solid var(--line-soft)",
          flexWrap: "wrap"
        }}
      >
        <Link
          href={`/dashboard/projects/${projectId}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 13,
            color: "var(--ink-3)",
            fontWeight: 600
          }}
        >
          <Icon name="overview" size={13} />
          Visión general
        </Link>
        <Link
          href={`/dashboard/projects/${projectId}/competitors`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 13,
            color: "var(--ink-3)",
            fontWeight: 600
          }}
        >
          <Icon name="competitors" size={13} />
          Competidores
        </Link>
        <Link
          href={`/dashboard/projects/${projectId}/prompts`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 13,
            color: "var(--ink-3)",
            fontWeight: 600
          }}
        >
          <Icon name="prompts" size={13} />
          Prompts
        </Link>
        <Link
          href={`/dashboard/projects/${projectId}/web-audit`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 13,
            color: "var(--ink-3)",
            fontWeight: 600
          }}
        >
          <Icon name="search" size={13} />
          Auditoría web
        </Link>
        <Link
          href="/dashboard/projects/new"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 13,
            color: "var(--ink-3)",
            fontWeight: 600
          }}
        >
          <Icon name="globe" size={13} />
          Añadir dominio
        </Link>
      </div>
    </div>
  );
}
