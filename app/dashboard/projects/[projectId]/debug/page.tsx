import React from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { Delta } from "@/components/ui/delta";
import { AutoExecuteScan } from "@/components/auto-execute-scan";
import { ScanProgressPoller } from "@/components/scan-progress-poller";
import { LiveRunStatusCells } from "@/components/live-run-status-cells";
import { ScanTriggerButton } from "@/components/scan-trigger-button";
import { ScanStatePill } from "@/components/scan-state-pill";
import { isProOrAbove } from "@/lib/billing";
import { requireUser } from "@/lib/auth";
import { requireActiveProject } from "@/lib/project-workspace";
import {
  ENABLE_SYNC_SCAN_EXECUTION,
  getRunErrorDisplay,
  reconcileStuckScanRuns,
  scanRunsNeedReconciliation
} from "@/lib/scan/scan-runner";
import {
  deltaWithheldReason,
  readComparableRun,
  resolveDelta,
  type ComparableRun,
  type DeltaVerdict
} from "@/lib/scoring/score-reliability";
import { parseCoverageMap } from "@/lib/web-audit/coverage-map";
import { deriveRunAuditStatus, type RunAuditStatus } from "@/lib/web-audit/run-audit-status";
import { feedbackErrorMessages, feedbackSuccessMessages } from "@/lib/projects/feedback-messages";
import { createServiceClient } from "@/lib/supabase/service";
import { setAutoAuditHalf, setRecurringScans } from "../actions";
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

/**
 * AUDIT-IN-RUNS-1 — the Auditoría cell.
 *
 * Deliberately not a link. This table has one row per scan, but the Auditoría
 * web screen shows the LATEST audit, not a given scan's: linking Tuesday's row
 * would land the user on Thursday's audit and quietly pass it off as Tuesday's.
 * A per-scan audit view is its own phase; until then the cell informs and does
 * not pretend to navigate.
 */
function RunAuditCell({ status }: { status: RunAuditStatus }) {
  if (status.kind === "none") {
    // Different pasts (never audited, gave up) that the user cannot act on
    // differently — so one honest blank, not several labels that invite
    // several questions. "Below the Pro gate" is no longer one of them: since
    // docs/adr/0035 those projects get the technical half and read "Auditada".
    return <span style={{ color: "var(--ink-4)" }}>—</span>;
  }

  if (status.kind === "in_progress") {
    return <span className="badge badge-accent">En curso</span>;
  }

  if (status.kind === "retrying") {
    // Not "En curso": the backoff reaches ten hours, so that label would
    // promise motion that is not coming today and read as a frozen table.
    return (
      <span className="badge badge-neutral" title="La auditoría falló y volverá a intentarse">
        Reintentando
      </span>
    );
  }

  const isComplete = status.kind === "audited";

  return (
    <>
      <span className={isComplete ? "badge badge-pos" : "badge badge-neutral"}>
        {isComplete ? "Auditada" : "Parcial"}
      </span>
      {status.readinessScore !== null && (
        // Labelled by `title` rather than inline text: unlabelled, "40/100"
        // sitting one column from "GEO Score" reads as a second score.
        <div
          className="tnum"
          style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2 }}
          title="Salud técnica"
        >
          {status.readinessScore}/100
        </div>
      )}
    </>
  );
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
  const { supabase, user } = await requireUser();

  /* DOMAINS-REDESIGN-1 — los flags de auditoría automática se leen AQUÍ y no en
     `requireActiveProject`, que es el cargador de seis pantallas. Las columnas
     llegan en una migración y las migraciones de este repo se aplican a mano:
     mientras no esté aplicada, pedirlas en el select compartido hace que
     PostgREST devuelva error y que las seis den 404. Pasó, y lo cazó el piloto
     en el preview de la PR de la 0030.

     Aquí, con su propia consulta, un error sólo significa "todavía no están las
     columnas". Ninguna otra pantalla se entera. */
  const { data: auditFlagRow, error: auditFlagError } = await supabase
    .from("projects")
    .select("auto_technical_audit_enabled, auto_coverage_audit_enabled")
    .eq("id", projectId)
    .maybeSingle();

  /* Tres estados, no dos. La primera versión pintaba el interruptor encendido
     cuando la consulta fallaba, y al pulsarlo el UPDATE moría con «vuelve a
     intentarlo» — un consejo imposible de seguir, porque reintentar no crea una
     columna. Lo reportó el fundador desde su móvil (2026-08-05).

     Un control que parece operable y no puede funcionar es peor que un control
     ausente: gasta un intento del operador y le miente sobre por qué falló. Si
     la lectura falla, la fila dice qué hacer — aplicar la migración — y no
     ofrece interruptor.

     WEB-AUDIT-AUTO-SPLIT-1: el estado por defecto de las dos mitades es
     APAGADO, no encendido, y eso invierte lo que hacía la 0030. Sin migración
     aplicada el backend falla cerrado (`enqueueWebAuditJob`, migración 0031),
     así que pintar «encendido» aquí describiría un producto que no existe. */
  type AuditHalfState = "on" | "off" | "unavailable";
  const autoTechnicalState: AuditHalfState = auditFlagError
    ? "unavailable"
    : auditFlagRow?.auto_technical_audit_enabled === true
    ? "on"
    : "off";
  const autoCoverageState: AuditHalfState = auditFlagError
    ? "unavailable"
    : auditFlagRow?.auto_coverage_audit_enabled === true
    ? "on"
    : "off";

  const RUNS_SELECT =
    "id, status, error_summary, total_prompts, sample_count, successful_prompts, failed_prompts, created_at, started_at, finished_at";

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

  const completedRuns = allRuns.filter((r) => r.status === "completed");
  const completedRunIds = completedRuns.map((r) => r.id);

  /* Fetch scores only for completed runs */
  const { data: scores } =
    completedRunIds.length > 0
      ? await supabase
          .from("run_scores")
          // details_json (DELTA-GUARD-1): carries the comparability
          // fingerprint resolveDelta needs — response count, composite
          // version, surviving components and engine set. Reading it here is
          // what lets this table apply the same ADR 0024 guard the Overview
          // already applies, instead of subtracting two numbers that may not
          // measure the same thing.
          .select("run_id, visibility_score, details_json")
          .eq("project_id", projectId)
          .in("run_id", completedRunIds)
      : { data: [] };

  const scoreByRunId = new Map<string, number>(
    (scores ?? []).map((s) => [s.run_id, Math.round(Number(s.visibility_score ?? 0))])
  );

  const comparableByRunId = new Map<string, ComparableRun>(
    (scores ?? []).map((s) => [s.run_id as string, readComparableRun(s.details_json)])
  );

  /* AUDIT-IN-RUNS-1 — the "Auditoría" column.
   *
   * Three bounded queries and three Maps, deliberately not one lookup per row:
   * this table lists every run a project has, so a per-row query would grow
   * with history. Same shape as scoreByRunId directly above.
   *
   * Both halves of the audit are read from what is actually PERSISTED rather
   * than from the job's status, because the job says what was attempted and
   * the user is being told what exists. The job row is consulted only to tell
   * "still working" apart from "never happened". */
  const [{ data: snapshotRows }, { data: coverageRows }, { data: auditJobRows }] =
    completedRunIds.length > 0
      ? await Promise.all([
          supabase
            .from("web_audit_snapshots")
            .select("scan_id, readiness_score")
            .eq("project_id", projectId)
            .in("scan_id", completedRunIds),
          // The coverage map does not carry scan_id as a column — the audited
          // scan lives inside the persisted JSON — so these are parsed rather
          // than filtered in SQL. Bounded to the same history depth the web
          // audit page uses for its own trend.
          supabase
            .from("generated_solutions")
            .select("sanitized_content")
            .eq("project_id", projectId)
            .eq("generation_type", "domain_coverage")
            .eq("status", "completed")
            .eq("is_sanitized", true)
            .order("created_at", { ascending: false })
            .limit(12),
          supabase
            .from("jobs")
            .select("run_id, status")
            .eq("project_id", projectId)
            .eq("job_type", "web_audit")
            .in("run_id", completedRunIds)
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];

  const readinessByScanId = new Map<string, number | null>(
    ((snapshotRows ?? []) as Array<{ scan_id: string; readiness_score: number | null }>).map((row) => [
      row.scan_id,
      row.readiness_score === null ? null : Number(row.readiness_score)
    ])
  );

  const coverageScanIds = new Set<string>(
    ((coverageRows ?? []) as Array<{ sanitized_content: string | null }>)
      .map((row) => parseCoverageMap(row.sanitized_content)?.scanId)
      .filter((scanId): scanId is string => Boolean(scanId))
  );

  const auditJobStatusByRunId = new Map<string, string>(
    ((auditJobRows ?? []) as Array<{ run_id: string; status: string }>).map((row) => [row.run_id, row.status])
  );

  // WEB-AUDIT-TECH-ALL-PLANS-1 (docs/adr/0035): the technical half runs on
  // every plan, coverage stays Pro. Without knowing which, a plan that only
  // ever gets the technical half would read "Parcial" on every run forever —
  // a permanent defect label for something that is not missing anything.
  // Raw `profiles.current_plan` via isProOrAbove, per .claude/rules/web-audit.md.
  const { data: planRow } = await supabase
    .from("profiles")
    .select("current_plan")
    .eq("id", user.id)
    .maybeSingle();
  const coverageIncludedInPlan = isProOrAbove((planRow as { current_plan?: string } | null)?.current_plan);

  /* WEB-AUDIT-AUTO-SPLIT-1: «esperada» es plan Y interruptor, no sólo plan. Una
     mitad apagada a mano no deja la auditoría «Parcial» — no falta nada, no se
     pidió. Con las columnas sin migrar (`unavailable`) se asume esperada: es lo
     que la tabla histórica venía diciendo, y marcar «Parcial» retroactivamente
     todas las filas por una migración pendiente sería peor que quedarse corto. */
  const coverageExpected = coverageIncludedInPlan && autoCoverageState !== "off";
  const technicalExpected = autoTechnicalState !== "off";

  const auditStatusByRunId = new Map<string, RunAuditStatus>(
    completedRunIds.map((runId) => [
      runId,
      deriveRunAuditStatus({
        runId,
        coverageScanIds,
        readinessByScanId,
        jobStatusByRunId: auditJobStatusByRunId,
        coverageExpected,
        technicalExpected
      })
    ])
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

  /**
   * Delta for each completed run vs its predecessor (DELTA-GUARD-1).
   *
   * This used to be a raw `curr - prev`. The Overview stopped doing that in
   * GEO-SCORE-RELIABILITY-1 (ADR 0024) because a subtraction of two persisted
   * scores says nothing on its own: it is only a real change in visibility if
   * both runs carry enough AI responses to support the claim AND measured the
   * same thing (same composite version, same surviving components, same
   * engines, same sample size). This table kept subtracting anyway, so the
   * screen the founder actually reads was publishing "+34 pt" on runs of
   * three responses — the exact false precision ADR 0024 exists to remove,
   * one screen over.
   *
   * `resolveDelta` is that ADR's single decision point, so using it here means
   * the two screens cannot drift apart in what they are willing to assert.
   */
  const scoreDeltas = new Map<string, DeltaVerdict | null>();
  for (let i = 0; i < completedRunsOldestFirst.length; i++) {
    const run = completedRunsOldestFirst[i];
    if (i === 0) {
      scoreDeltas.set(run.id, null); // first ever run — no previous
      continue;
    }

    const prevRun = completedRunsOldestFirst[i - 1];
    const curr = scoreByRunId.get(run.id) ?? null;
    const prev = scoreByRunId.get(prevRun.id) ?? null;
    const currComparable = comparableByRunId.get(run.id);
    const prevComparable = comparableByRunId.get(prevRun.id);

    if (curr === null || prev === null || !currComparable || !prevComparable) {
      scoreDeltas.set(run.id, null);
      continue;
    }

    scoreDeltas.set(run.id, resolveDelta(curr - prev, currComparable, prevComparable));
  }

  /**
   * Whether any run in view has a delta this layer refuses to publish — the
   * condition for the one-line explanation under the table. Deliberately not
   * "does any row show a dash": the very first run of a project shows one too,
   * and "no previous scan to compare against" needs no explaining.
   */
  const hasWithheldDelta = Array.from(scoreDeltas.values()).some(
    (verdict) => verdict !== null && verdict.kind !== "publish"
  );

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

  // DOMAINS-REDESIGN-1 — el driver también aquí, y no por simetría.
  //
  // Visión general es su casa principal: es donde aterriza el onboarding y
  // donde un usuario espera un escaneo. Pero el botón «Repetir escaneo» vive en
  // ESTA pantalla (Visión general sólo tiene uno en su estado vacío, para el
  // primer escaneo), así que sin driver aquí pulsarlo crearía un run pendiente
  // que nada empuja hasta que lo rescatase el cron — un botón que parece
  // funcionar y no hace nada.
  //
  // Dos montajes son seguros por construcción, no por suerte: cada lote se
  // reclama con un UPDATE atómico condicionado al estado (SCAN-CHAIN-1), que es
  // exactamente lo que ya permite que el driver de cliente y el auto-fetch de
  // `/api/scan/continue` coexistan. Dos pestañas abiertas se reparten lotes; no
  // los duplican.
  const shouldDrive =
    ENABLE_SYNC_SCAN_EXECUTION && (activeRun?.status === "pending" || activeRun?.status === "running");

  const hasMultipleCompleted = completedRuns.length >= 2;

  return (
    <div className="page">
      {shouldDrive && activeRun ? <AutoExecuteScan projectId={projectId} runId={activeRun.id} /> : null}
      {activeRun ? <ScanProgressPoller projectId={projectId} initialRunId={activeRun.id} /> : null}

      {/* Sticky header */}
      <div className="ov-sticky-header">
        <div className="ov-sticky-left">
          <div>
            <p className="kicker" style={{ marginBottom: 2 }}>Debug</p>
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

            </div>
          </div>
        </div>
        <div className="ov-sticky-right">
          <ScanStatePill
            activeRun={activeRun}
            lastScanLabel={
              lastCompletedRun
                ? new Date(lastCompletedRun.finished_at ?? lastCompletedRun.created_at)
                    .toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid" })
                : null
            }
          />
        </div>
      </div>

      {feedbackErrorMessage && (
        <p className="feedback error" style={{ marginBottom: 16 }}>{feedbackErrorMessage}</p>
      )}
      {feedbackSuccessMessage && (
        <p className="feedback success" style={{ marginBottom: 16 }}>{feedbackSuccessMessage}</p>
      )}

      {/* DOMAINS-REDESIGN-1 — this screen is not a customer surface. The band
          says so before anything else on it can be mistaken for one: it shows
          per-response cost in dollars, provider errors and switches that spend
          real money. The customer-facing banners that used to live here (first
          scan, scan-in-progress, the completed-runs summary) moved to Dominios
          and Visión general, where the person who needs them actually looks. */}
      <div className="dbg-band">
        <b>Interno</b>
        <span>No enlazada desde el menú · pantalla de operación</span>
      </div>

      {/* DOMAINS-REDESIGN-1 — Controles.
          Los dos interruptores viven juntos y se comportan igual a propósito:
          son la misma clase de decisión (gastar o no gastar llamadas de IA en
          este dominio) y leerlos como dos mecanismos distintos sería una
          diferencia inventada. Ver `setRecurringScans` / `setAutoWebAudit`. */}
      <div className="section-head">
        <div className="section-title">Controles</div>
        <div className="section-desc">Qué trabajo automático gasta IA en este dominio</div>
      </div>

      <div className="card dbg-switch">
        <div className="dbg-switch-ico" data-on={project.recurring_scans_enabled ? "true" : "false"}>
          <Icon name="runs" size={17} />
        </div>
        <div className="dbg-switch-txt">
          <b>Escaneo automático diario</b>
          <small>
            {totalCompletedRuns === 0
              ? "Necesita al menos un escaneo completado antes de poder activarse."
              : "Lanza un escaneo completo de este dominio cada madrugada."}
          </small>
        </div>
        {/* El precondicionante real lo aplica `setRecurringScans` (exige un
            escaneo completado). Deshabilitarlo aquí además evita el viaje de
            ida y vuelta que sólo devolvería un error. */}
        <form action={setRecurringScans}>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="enabled" value={project.recurring_scans_enabled ? "false" : "true"} />
          <button
            type="submit"
            className={`switch-toggle ${project.recurring_scans_enabled ? "on" : ""}`}
            role="switch"
            aria-checked={project.recurring_scans_enabled}
            aria-label="Escaneo automático diario"
            disabled={totalCompletedRuns === 0 && !project.recurring_scans_enabled}
          />
        </form>
      </div>

      {/* WEB-AUDIT-AUTO-SPLIT-1 — dos interruptores, no uno. Las dos mitades de
          la auditoría tienen coste opuesto (ADR 0035): la cobertura son
          llamadas a Gemini por prompt, la técnica no gasta LLM y alimenta un
          componente del GeoScore (ADR 0033). Con un solo control, apagar el
          gasto obligaba a perder también la nota. Contexto medido:
          docs/llm-cost-analysis-2026-08.md. */}
      <div className="card dbg-switch">
        <div className="dbg-switch-ico" data-on={autoCoverageState === "on" ? "true" : "false"}>
          <Icon name="search" size={17} />
        </div>
        <div className="dbg-switch-txt">
          <b>Cobertura por IA tras cada escaneo</b>
          <small>
            {autoCoverageState === "unavailable" ? (
              <>
                Falta aplicar la migración <code>0031_project_audit_halves.sql</code> en Supabase.
                Hasta entonces esta mitad no corre en ningún dominio.
              </>
            ) : (
              <>
                La mitad que gasta: una consulta a Gemini por cada prompt activo, tras cada escaneo.
                Sólo Pro y Agencia. Apagarlo detiene las próximas; una ya en vuelo termina.
              </>
            )}
          </small>
        </div>
        {autoCoverageState === "unavailable" ? (
          <span className="badge badge-neutral">Sin migrar</span>
        ) : (
          <form action={setAutoAuditHalf}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="half" value="coverage" />
            <input type="hidden" name="enabled" value={autoCoverageState === "on" ? "false" : "true"} />
            <button
              type="submit"
              className={`switch-toggle ${autoCoverageState === "on" ? "on" : ""}`}
              role="switch"
              aria-checked={autoCoverageState === "on"}
              aria-label="Cobertura por IA tras cada escaneo"
            />
          </form>
        )}
      </div>

      <div className="card dbg-switch">
        <div className="dbg-switch-ico" data-on={autoTechnicalState === "on" ? "true" : "false"}>
          <Icon name="check" size={17} />
        </div>
        <div className="dbg-switch-txt">
          <b>Auditoría técnica tras cada escaneo</b>
          <small>
            {autoTechnicalState === "unavailable" ? (
              <>
                Falta aplicar la migración <code>0031_project_audit_halves.sql</code> en Supabase.
                Hasta entonces esta mitad no corre en ningún dominio.
              </>
            ) : (
              <>
                No gasta IA: sólo descarga y revisa páginas del propio dominio. Su nota es un
                componente del GeoScore, así que apagarla lo congela en el valor de la última
                auditoría.
              </>
            )}
          </small>
        </div>
        {autoTechnicalState === "unavailable" ? (
          <span className="badge badge-neutral">Sin migrar</span>
        ) : (
          <form action={setAutoAuditHalf}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="half" value="technical" />
            <input type="hidden" name="enabled" value={autoTechnicalState === "on" ? "false" : "true"} />
            <button
              type="submit"
              className={`switch-toggle ${autoTechnicalState === "on" ? "on" : ""}`}
              role="switch"
              aria-checked={autoTechnicalState === "on"}
              aria-label="Auditoría técnica tras cada escaneo"
            />
          </form>
        )}
      </div>

      {/* DOMAINS-REDESIGN-1: el borrado duro del dominio (DATA-MGMT-1) vivía en
          cada tarjeta de la rejilla de Escaneos. La rejilla se fue a Dominios,
          que por diseño no lleva controles, así que el borrado se queda aquí:
          es una acción de operación, irreversible, y ésta es la pantalla de
          operación. Queda anotado en el histórico como movimiento deliberado —
          deja de estar al alcance del cliente en la consola. */}
      <div className="card dbg-switch">
        <div className="dbg-switch-ico" data-on="false">
          <Icon name="globe" size={17} />
        </div>
        <div className="dbg-switch-txt">
          <b>Eliminar este dominio</b>
          <small>Borra el dominio y todo su historial. No se puede deshacer.</small>
        </div>
        <DeleteDomainButton projectId={projectId} domainName={project.domain || project.name} isCurrentProject />
      </div>

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
                  {/* SAMPLING-1 (ADR 0030): la columna cuenta LANZAMIENTOS
                      (`total_prompts`), y un lanzamiento sólo equivale a un
                      prompt cuando el escaneo no repitió su set. Con 6 prompts
                      y 3 repeticiones esta celda dice 18/18, así que el
                      encabezado "Prompts" era literalmente falso. El desglose
                      real va bajo cada celda que lo necesita. */}
                  <th>Lanzamientos</th>
                  {/* AUDIT-IN-RUNS-1: sólo desde que la auditoría se ejecuta
                      sola tras cada escaneo existe una relación 1:1 fiable
                      entre una fila de esta tabla y una auditoría. */}
                  <th>Auditoría</th>
                  <th className="num">GEO Score</th>
                  {hasMultipleCompleted ? <th className="num">Δ Score</th> : null}
                </tr>
              </thead>
              <tbody>
                {allRuns.map((run) => {
                  const runNum = runNumberByRunId.get(run.id) ?? 1;
                  const total = Number(run.total_prompts ?? 0);
                  const ok = Number(run.successful_prompts ?? 0);
                  // Runs created before migration 0028 have no sample_count;
                  // they were all one pass over their prompt set, i.e. 1.
                  const sampleCount = Math.max(1, Number(run.sample_count ?? 1));
                  const distinctPrompts = sampleCount > 1 ? Math.round(total / sampleCount) : total;
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

                        {/* Date — also the only way into the run detail page.
                            Before this, `/runs/[runId]` was reachable from
                            exactly two links, both of which live inside EMPTY
                            states ("no citations", "no recommendations"), so a
                            project with real data could not open a scan at all.
                            A whole <tr> cannot be wrapped in an anchor without
                            invalid markup, so the date — the row's natural
                            identifier — carries the link. */}
                        <td>
                          <Link
                            href={`/dashboard/projects/${projectId}/runs/${run.id}`}
                            // `display: block` preserves the layout the plain
                            // <div> had: an inline anchor would shrink-wrap and
                            // pull the timestamp line up beside it.
                            style={{ display: "block", fontSize: 12.5, fontWeight: 650, color: "var(--ink)" }}
                          >
                            {formatDateShort(run.created_at)}
                          </Link>
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
                              {sampleCount > 1 && (
                                <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2 }}>
                                  {distinctPrompts} {distinctPrompts === 1 ? "prompt" : "prompts"} ×{" "}
                                  {sampleCount} repeticiones
                                </div>
                              )}
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

                        {/* Auditoría (AUDIT-IN-RUNS-1) */}
                        <td>
                          <RunAuditCell status={auditStatusByRunId.get(run.id) ?? { kind: "none" }} />
                        </td>

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

                        {/* Delta (only if >=2 completed runs).
                            DELTA-GUARD-1: only a "publish" verdict is a real,
                            assertable change. Everything else renders as the
                            same em dash the "no previous run" case already
                            used, with the reason in the tooltip — the founder
                            decided on 2026-08-03 (Overview) that a withheld
                            comparison renders as nothing rather than as a
                            notice, because several "sin comparación" labels on
                            one screen read as a broken product instead of a
                            careful one. A whole COLUMN of them would be
                            worse. */}
                        {hasMultipleCompleted ? (
                          <td className="num">
                            {delta?.kind === "publish" ? (
                              <Delta value={delta.value} suffix=" pt" />
                            ) : (
                              <span
                                style={{ fontSize: 11.5, color: "var(--ink-4)" }}
                                title={deltaWithheldReason(delta)}
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
          {/* One line, once, and only when there is something to explain
              (DELTA-GUARD-1). Judged from the pilot's own capture: a column
              with fifteen consecutive em dashes and the reason hidden in a
              `title` reads as "something is broken" — and a `title` is
              invisible on touch, which is where the founder actually reads
              this. Same pattern the Overview already uses: ONE line that says
              what unlocks the comparison, never a notice per row. */}
          {hasWithheldDelta ? (
            <div style={{ padding: "2px 12px 10px", fontSize: 11.5, color: "var(--ink-4)" }}>
              Los guiones de «Δ Score» son comparaciones que no podemos afirmar: el escaneo
              tenía muy pocas respuestas de IA, o midió algo distinto del anterior (otros
              motores, otra metodología). Pasa el ratón por encima para ver el motivo de cada
              uno.
            </div>
          ) : null}
        </div>
      )}

    </div>
  );
}
