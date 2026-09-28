import "server-only";

import { SYSTEM_PLAN_COLUMNS, resolvePlan, resolveSystemPlanId } from "@/lib/billing";
import { isOpsAlertConfigured, sendWatchdogAlertEmail } from "@/lib/email/transactional";
import {
  RETRY_EXHAUSTED_ERROR_SUMMARIES,
  SCAN_NO_RESULTS_ERROR_SUMMARY,
  SCAN_PENDING_TIMEOUT_SECONDS,
  SCAN_RUNNING_TIMEOUT_SECONDS,
  TIMEOUT_ERROR_SUMMARIES,
  WATCHDOG_ALERT_LOG_MESSAGE
} from "@/lib/scan/constants";
import { RECURRING_CRON_UTC_HOUR, resolveEligibilityCutoffIso } from "@/lib/scan/cron";
import { reconcileStuckScanRuns } from "@/lib/scan/reconciliation";
import { analyzeRunHealth, checkAndSendScanHealthAlert, type ScanHealthFinding } from "@/lib/scan/scan-health-alert";
import type { createServiceClient } from "@/lib/supabase/service";

/**
 * ALERTS-ALWAYS-1 (`docs/brand/design-decisions-log.md` §227).
 *
 * Every alert that existed before this fired from inside a run that FINISHED:
 * `checkAndSendScanHealthAlert` at finalize, or at reconciliation only once
 * the auto-retry was spent. A run whose self-continuation chain died never
 * finishes, and reconciliation itself only ran when someone opened one of the
 * project's screens or the daily sweep came round — so alberdiderma.es failed
 * six days running (22–28 Sept 2026) with OpenAI out of quota, and nobody was
 * told. The quota alert could not fire because the quota was what stopped the
 * run from finishing; the retry-exhausted alert could not fire because each
 * failure was detected ~24h after it was created, which put the previous one
 * just outside the 24h retry-cap lookback every single day.
 *
 * The watchdog is the thing that looks without being asked. Every 15 minutes
 * (`/api/cron/scan-watchdog`), across EVERY project:
 *
 *  1. reconciles runs that stopped advancing (the existing
 *     `reconcileStuckScanRuns`, which marks them failed and auto-retries);
 *  2. checks runs still in flight for `quota`/`config` extraction errors — the
 *     two findings that never heal on their own — instead of waiting for a
 *     finalize those very errors can prevent;
 *  3. emails the operator about every run that ended `failed` since the last
 *     alert, whether or not a retry was started;
 *  4. emails the operator about every recurring project that has gone a full
 *     cycle without a completed scan — the "this customer stopped getting
 *     data" signal, whatever the cause, including causes nobody has thought
 *     of yet.
 *
 * Dedupe lives in `job_logs` (same store as `checkAndSendScanHealthAlert`,
 * no migration), keyed per run for failures and per project + cycle for
 * stale data, so a missed firing delays an alert instead of losing it.
 */

/** How far back a failed run is still worth alerting about if no alert went out yet. */
export const WATCHDOG_FAILED_RUN_LOOKBACK_HOURS = 24;

/**
 * ALERTS-SCOPE-1: a failed run is only reported if it was CREATED within this
 * window. Anything older that is only now marked failed has been stuck for
 * days with nobody waiting on it.
 */
export const WATCHDOG_FAILED_RUN_MAX_RUN_AGE_HOURS = 48;

/**
 * ALERTS-SCOPE-1 (log §229): whether a failed run is someone's problem.
 *
 * - A person launched it (`triggered_by_user_id` set): always — whatever the
 *   plan. A Free user's one scan failing is a prospect who sees nothing.
 * - The system launched it (daily sweep, auto-retry): only while the account
 *   is on a plan that includes scans. The system should not be scanning a
 *   Free or expired-trial account at all; if it did, that is a bug to fix in
 *   plan resolution, not an alert to send every day.
 */
export function shouldAlertFailedRun(input: { triggeredByUserId: string | null; ownerPlanId: string }): boolean {
  if (input.triggeredByUserId) return true;
  return input.ownerPlanId !== "free";
}

/**
 * How long after the daily sweep fires a recurring project may still lack
 * its completed scan before it counts as "without data". The sweep chains
 * across invocations and a scan spans several, so a project can legitimately
 * finish well after 06:00 UTC; 3h covers that without letting a dead project
 * go unreported past mid-morning in Spain.
 */
export const WATCHDOG_STALE_DATA_GRACE_HOURS = 3;

/**
 * Reconciliation is sequential per project and can dispatch auto-retries.
 * Stop starting new ones past this point so the rest of the pass — the part
 * that emails — always fits inside the route's 60s `maxDuration`.
 */
const WATCHDOG_RECONCILE_BUDGET_MS = 30_000;

/**
 * Ceiling for the per-run / per-project read loops after reconciliation. A
 * provider-wide outage is exactly when many runs are active and many projects
 * go stale at once — the case this module exists for — so those loops stop
 * starting new items past this point and leave the rest to the next pass,
 * which keeps the send step inside the route's 60s `maxDuration`.
 */
const WATCHDOG_READ_BUDGET_MS = 45_000;

function readBudgetSpent(startedAt: number, what: string, remaining: number): boolean {
  if (Date.now() - startedAt <= WATCHDOG_READ_BUDGET_MS) return false;
  console.warn(`[geo:scan:watchdog] read budget spent during ${what}; the rest waits for the next pass`, { remaining });
  return true;
}

const HOUR_MS = 60 * 60 * 1000;

/** The route's schedule (`vercel.json`). Only used to bound alerts that have no dedupe anchor. */
export const WATCHDOG_INTERVAL_MINUTES = 15;

type Service = ReturnType<typeof createServiceClient>;

export type WatchdogFailedRun = {
  runId: string;
  projectId: string;
  domain: string;
  ownerEmail: string | null;
  reason: string;
  successfulPrompts: number;
  totalPrompts: number;
  finishedAt: string | null;
  /** Any later run exists for the project: an auto-retry, the next day's sweep, or a manual scan. */
  retryStarted: boolean;
  engineIssues: string[];
};

export type WatchdogStaleProject = {
  projectId: string;
  domain: string;
  ownerEmail: string | null;
  planId: string;
  lastCompletedAt: string | null;
  cutoffIso: string;
};

/**
 * Whether a recurring project has gone a whole cycle without a completed scan.
 *
 * Anchored to the sweep's own firing schedule, like its eligibility
 * (`resolveEligibilityCutoffIso`, log §192): the question is "did the firing
 * that should have produced this project's latest scan produce one?", asked
 * `WATCHDOG_STALE_DATA_GRACE_HOURS` after it. For a daily plan checked at
 * 10:00 UTC that is "a completed scan created since 06:00 today"; checked at
 * 08:00 UTC it is still "since 06:00 yesterday", because today's has not had
 * its grace yet. For Starter's weekly cadence the cutoff sits 6 days earlier,
 * exactly as the sweep's does.
 */
export function evaluateRecurringFreshness(input: {
  planId: string;
  lastCompletedAt: string | null;
  now: number;
}): { stale: boolean; cutoffIso: string } {
  const cutoffIso = resolveEligibilityCutoffIso({
    planId: input.planId,
    now: input.now - WATCHDOG_STALE_DATA_GRACE_HOURS * HOUR_MS
  });
  const stale = !input.lastCompletedAt || input.lastCompletedAt < cutoffIso;
  return { stale, cutoffIso };
}

/** Operator-facing reading of a stored `error_summary`. Never shown to a customer. */
export function describeFailedRunReason(errorSummary: string | null | undefined): string {
  if (!errorSummary) return "Fallido sin motivo registrado.";
  if (RETRY_EXHAUSTED_ERROR_SUMMARIES.has(errorSummary)) {
    return "Se quedó sin avanzar y ya había consumido su reintento automático.";
  }
  if (TIMEOUT_ERROR_SUMMARIES.has(errorSummary)) {
    return "Se quedó sin avanzar (la cadena de ejecución se cortó).";
  }
  if (errorSummary === SCAN_NO_RESULTS_ERROR_SUMMARY) {
    return "Ningún prompt obtuvo respuesta de ningún motor.";
  }
  return errorSummary;
}

const FINDING_LABEL: Record<ScanHealthFinding["reason"], string> = {
  quota: "sin cuota",
  config: "mal configurado",
  engine_down: "respondió pero no se pudo extraer nada",
  engine_no_response: "no contestó a nada",
  run_failed: "run fallido"
};

/** Engine-level causes found in a failed run's rows, as one-line strings for the email. */
export function summarizeEngineIssues(findings: readonly ScanHealthFinding[]): string[] {
  return findings
    .filter((finding) => finding.reason !== "run_failed")
    .map((finding) => `${finding.engine}: ${FINDING_LABEL[finding.reason]} (${finding.affectedRows}/${finding.totalRows})`);
}

function isWithinLastInterval(iso: string | null, now: number): boolean {
  if (!iso) return false;
  return Date.parse(iso) > now - WATCHDOG_INTERVAL_MINUTES * 60 * 1000;
}

function isFirstPassAfterGrace(now: number): boolean {
  const at = new Date(now);
  return (
    at.getUTCHours() === RECURRING_CRON_UTC_HOUR + WATCHDOG_STALE_DATA_GRACE_HOURS &&
    at.getUTCMinutes() < WATCHDOG_INTERVAL_MINUTES
  );
}

/**
 * Picks one job id per run to anchor a `job_logs` row to. `job_logs` has a
 * real FK to `(job_id, run_id, project_id)`, so a marker cannot be written
 * without one; any job of the run will do.
 */
async function loadAnchorJobIds(service: Service, runIds: readonly string[]): Promise<Map<string, string>> {
  const anchors = new Map<string, string>();
  if (runIds.length === 0) return anchors;

  const { data } = await service.from("jobs").select("id, run_id, job_type").in("run_id", runIds as string[]);
  for (const row of (data ?? []) as Array<{ id: string; run_id: string; job_type: string }>) {
    // Prefer the finalize job so the marker sits next to the scan-health ones.
    if (!anchors.has(row.run_id) || row.job_type === "scan_finalize") anchors.set(row.run_id, row.id);
  }
  return anchors;
}

async function reconcileStalledRuns(service: Service, startedAt: number): Promise<number> {
  const now = Date.now();
  const runningCutoffIso = new Date(now - SCAN_RUNNING_TIMEOUT_SECONDS * 1000).toISOString();
  const pendingCutoffIso = new Date(now - SCAN_PENDING_TIMEOUT_SECONDS * 1000).toISOString();

  const [{ data: staleRunning }, { data: stalePending }] = await Promise.all([
    service.from("scan_runs").select("project_id").eq("status", "running").lt("updated_at", runningCutoffIso),
    service.from("scan_runs").select("project_id").eq("status", "pending").lt("created_at", pendingCutoffIso)
  ]);

  const projectIds = Array.from(
    new Set([...(staleRunning ?? []), ...(stalePending ?? [])].map((row) => row.project_id as string))
  );

  let reconciled = 0;
  for (const projectId of projectIds) {
    if (Date.now() - startedAt > WATCHDOG_RECONCILE_BUDGET_MS) {
      console.warn("[geo:scan:watchdog] reconcile budget spent; remaining projects wait for the next pass", {
        remaining: projectIds.length - reconciled
      });
      break;
    }
    try {
      await reconcileStuckScanRuns({ projectId, service });
    } catch (error) {
      console.error("[geo:scan:watchdog] reconcile failed", {
        projectId,
        message: error instanceof Error ? error.message : String(error)
      });
    }
    reconciled += 1;
  }
  return reconciled;
}

/**
 * `quota` and `config` alert on a single row and never heal on their own
 * (`analyzeRunHealth`). Checking them only at finalize meant the one incident
 * that stops runs from finalizing could never be reported. The other reasons
 * are NOT checked here: on a run still in flight, "no rows extracted yet" is
 * progress, not a dead engine.
 */
async function checkActiveRunsForProviderTrouble(service: Service, startedAt: number): Promise<void> {
  const { data: activeRuns } = await service
    .from("scan_runs")
    .select("id, project_id")
    .in("status", ["pending", "running"]);

  const runs = (activeRuns ?? []) as Array<{ id: string; project_id: string }>;
  if (runs.length === 0) return;

  const anchors = await loadAnchorJobIds(
    service,
    runs.map((run) => run.id)
  );

  for (const [index, run] of runs.entries()) {
    if (readBudgetSpent(startedAt, "provider-trouble check", runs.length - index)) break;
    await checkAndSendScanHealthAlert({
      service,
      projectId: run.project_id,
      runId: run.id,
      finalizeJobId: anchors.get(run.id) ?? null,
      onlyReasons: ["quota", "config"]
    });
  }
}

async function loadOwners(service: Service, projectIds: readonly string[]) {
  const projectById = new Map<string, { domain: string; ownerUserId: string }>();
  const ownerById = new Map<string, { email: string | null; planId: string }>();
  if (projectIds.length === 0) return { projectById, ownerById };

  const { data: projects } = await service
    .from("projects")
    .select("id, domain, owner_user_id")
    .in("id", projectIds as string[]);
  for (const row of projects ?? []) {
    projectById.set(row.id as string, { domain: row.domain as string, ownerUserId: row.owner_user_id as string });
  }

  const ownerIds = Array.from(new Set(Array.from(projectById.values()).map((p) => p.ownerUserId)));
  if (ownerIds.length) {
    const { data: profiles } = await service.from("profiles").select(`id, ${SYSTEM_PLAN_COLUMNS}`).in("id", ownerIds);
    for (const row of profiles ?? []) {
      ownerById.set(row.id as string, {
        email: (row.email as string | null) ?? null,
        planId: resolvePlan(resolveSystemPlanId(row as Parameters<typeof resolveSystemPlanId>[0]) as string | undefined).id
      });
    }
  }

  return { projectById, ownerById };
}

async function collectUnalertedFailedRuns(
  service: Service,
  now: number,
  startedAt: number
): Promise<{ failedRuns: WatchdogFailedRun[]; anchors: Map<string, string> }> {
  const sinceIso = new Date(now - WATCHDOG_FAILED_RUN_LOOKBACK_HOURS * HOUR_MS).toISOString();

  const { data: failed } = await service
    .from("scan_runs")
    .select("id, project_id, created_at, finished_at, error_summary, successful_prompts, total_prompts, triggered_by_user_id")
    .eq("status", "failed")
    .gte("finished_at", sinceIso);

  // ALERTS-SCOPE-1: a run created long ago and only now marked failed is a
  // "zombie" — stuck for weeks with nobody looking. The first watchdog pass
  // found eight of them at once (kickingeleven.com, remaxplus.es…), on
  // accounts whose trials had ended and whose recurring scans were off:
  // alerting about those is noise about something nobody expects.
  const maxRunAgeCutoffIso = new Date(now - WATCHDOG_FAILED_RUN_MAX_RUN_AGE_HOURS * HOUR_MS).toISOString();
  const failedRows = ((failed ?? []) as Array<{
    id: string;
    project_id: string;
    created_at: string;
    finished_at: string | null;
    error_summary: string | null;
    successful_prompts: number | null;
    total_prompts: number | null;
    triggered_by_user_id: string | null;
  }>).filter((row) => row.created_at >= maxRunAgeCutoffIso);
  if (failedRows.length === 0) return { failedRuns: [], anchors: new Map() };

  const runIds = failedRows.map((row) => row.id);
  const { data: markers } = await service
    .from("job_logs")
    .select("run_id")
    .eq("message", WATCHDOG_ALERT_LOG_MESSAGE)
    .eq("context_json->>kind", "failed_run")
    .in("run_id", runIds);
  const alreadyAlerted = new Set((markers ?? []).map((row) => row.run_id as string));

  const unmarked = failedRows.filter((row) => !alreadyAlerted.has(row.id));
  if (unmarked.length === 0) return { failedRuns: [], anchors: new Map() };

  const anchors = await loadAnchorJobIds(
    service,
    unmarked.map((row) => row.id)
  );
  // A run with no job cannot carry a marker, so it could not be deduped and
  // would be re-sent every pass for a day. Those are alerted once, by the
  // pass whose interval their failure fell into.
  const pending = unmarked.filter((row) => anchors.has(row.id) || isWithinLastInterval(row.finished_at, now));
  if (pending.length === 0) return { failedRuns: [], anchors: new Map() };

  const projectIds = Array.from(new Set(pending.map((row) => row.project_id)));
  const [{ projectById, ownerById }, { data: laterRuns }] = await Promise.all([
    loadOwners(service, projectIds),
    service
      .from("scan_runs")
      .select("project_id, created_at")
      .in("project_id", projectIds)
      .gte("created_at", pending.reduce((min, row) => (row.created_at < min ? row.created_at : min), pending[0].created_at))
  ]);

  const failedRuns: WatchdogFailedRun[] = [];
  for (const row of pending) {
    const project = projectById.get(row.project_id);
    const owner = project ? ownerById.get(project.ownerUserId) : undefined;

    if (!shouldAlertFailedRun({ triggeredByUserId: row.triggered_by_user_id, ownerPlanId: owner?.planId ?? "pro" })) {
      continue;
    }

    // Past the read budget the run is still reported — only its per-engine
    // detail is skipped. Dropping the run itself would trade a missing line
    // in an email for a missing alert.
    const { data: rows } =
      Date.now() - startedAt > WATCHDOG_READ_BUDGET_MS
        ? { data: [] }
        : await service
            .from("scan_prompt_results")
            .select("provider, status, raw_response_text, extraction_version, extraction_error")
            .eq("project_id", row.project_id)
            .eq("run_id", row.id);

    failedRuns.push({
      runId: row.id,
      projectId: row.project_id,
      domain: project?.domain ?? row.project_id,
      ownerEmail: owner?.email ?? null,
      reason: describeFailedRunReason(row.error_summary),
      successfulPrompts: Number(row.successful_prompts ?? 0),
      totalPrompts: Number(row.total_prompts ?? 0),
      finishedAt: row.finished_at,
      retryStarted: (laterRuns ?? []).some(
        (later) => later.project_id === row.project_id && (later.created_at as string) > row.created_at
      ),
      engineIssues: summarizeEngineIssues(analyzeRunHealth((rows ?? []) as Parameters<typeof analyzeRunHealth>[0]))
    });
  }

  return { failedRuns, anchors };
}

async function collectUnalertedStaleProjects(
  service: Service,
  now: number,
  startedAt: number
): Promise<{ staleProjects: WatchdogStaleProject[]; anchors: Map<string, string> }> {
  const { data: projects } = await service
    .from("projects")
    .select("id, domain, owner_user_id")
    .eq("recurring_scans_enabled", true)
    .eq("is_archived", false);

  const projectRows = (projects ?? []) as Array<{ id: string; domain: string; owner_user_id: string }>;
  if (projectRows.length === 0) return { staleProjects: [], anchors: new Map() };

  const ownerIds = Array.from(new Set(projectRows.map((row) => row.owner_user_id)));
  const { data: profiles } = await service.from("profiles").select(`id, ${SYSTEM_PLAN_COLUMNS}`).in("id", ownerIds);
  const ownerById = new Map(
    (profiles ?? []).map((row) => [
      row.id as string,
      {
        email: (row.email as string | null) ?? null,
        // ALERTS-SCOPE-1: effective plan — an expired trial is Free here too.
        planId: resolvePlan(resolveSystemPlanId(row as Parameters<typeof resolveSystemPlanId>[0]) as string | undefined).id
      }
    ])
  );

  const candidates: Array<WatchdogStaleProject & { latestRunId: string | null }> = [];

  for (const [index, project] of projectRows.entries()) {
    if (readBudgetSpent(startedAt, "stale-data check", projectRows.length - index)) break;
    const owner = ownerById.get(project.owner_user_id);
    // Same plan read and same Free exclusion as the sweep itself (cron.ts):
    // a project the sweep deliberately never scans is not "without data".
    const planId = owner?.planId ?? "pro";
    if (planId === "free") continue;

    const { data: recentRuns } = await service
      .from("scan_runs")
      .select("id, status, created_at")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false })
      .limit(20);

    const runs = (recentRuns ?? []) as Array<{ id: string; status: string; created_at: string }>;
    // A scan in flight right now has its own failure alert if it dies; saying
    // "no data" about it while it is still working would be a false alarm.
    if (runs.some((run) => run.status === "pending" || run.status === "running")) continue;

    const lastCompleted = runs.find((run) => run.status === "completed");
    const { stale, cutoffIso } = evaluateRecurringFreshness({
      planId,
      lastCompletedAt: lastCompleted?.created_at ?? null,
      now
    });
    if (!stale) continue;

    candidates.push({
      projectId: project.id,
      domain: project.domain,
      ownerEmail: owner?.email ?? null,
      planId,
      lastCompletedAt: lastCompleted?.created_at ?? null,
      cutoffIso,
      latestRunId: runs[0]?.id ?? null
    });
  }

  if (candidates.length === 0) return { staleProjects: [], anchors: new Map() };

  const { data: markers } = await service
    .from("job_logs")
    .select("project_id, context_json")
    .eq("message", WATCHDOG_ALERT_LOG_MESSAGE)
    .eq("context_json->>kind", "stale_data")
    .in(
      "project_id",
      candidates.map((c) => c.projectId)
    );
  const alertedKeys = new Set(
    (markers ?? []).map(
      (row) => `${row.project_id as string}|${((row.context_json ?? {}) as { cutoff?: string }).cutoff ?? ""}`
    )
  );

  const unmarked = candidates.filter((c) => !alertedKeys.has(`${c.projectId}|${c.cutoffIso}`));
  const runAnchors = await loadAnchorJobIds(
    service,
    unmarked.map((c) => c.latestRunId).filter((id): id is string => Boolean(id))
  );
  // Same reasoning as failed runs: a project without any job to anchor a
  // marker to is reported once a day, by the first pass after the grace.
  const pending = unmarked.filter(
    (c) => (c.latestRunId && runAnchors.has(c.latestRunId)) || isFirstPassAfterGrace(now)
  );

  // Re-keyed by project: the marker for "project X is stale this cycle" hangs
  // off a job of its latest run, the only FK-valid anchor a project has.
  const anchors = new Map<string, string>();
  for (const candidate of pending) {
    const jobId = candidate.latestRunId ? runAnchors.get(candidate.latestRunId) : undefined;
    if (jobId && candidate.latestRunId) anchors.set(candidate.projectId, `${jobId}|${candidate.latestRunId}`);
  }

  return {
    staleProjects: pending.map(({ latestRunId: _latestRunId, ...rest }) => rest),
    anchors
  };
}

export async function runScanWatchdog({ service }: { service: Service }): Promise<{
  reconciledProjects: number;
  failedRunsAlerted: number;
  staleProjectsAlerted: number;
  delivered: boolean;
}> {
  const startedAt = Date.now();

  const reconciledProjects = await reconcileStalledRuns(service, startedAt);

  try {
    await checkActiveRunsForProviderTrouble(service, startedAt);
  } catch (error) {
    console.error("[geo:scan:watchdog] provider-trouble check failed", {
      message: error instanceof Error ? error.message : String(error)
    });
  }

  const now = Date.now();
  const [{ failedRuns, anchors: failedAnchors }, { staleProjects, anchors: staleAnchors }] = await Promise.all([
    collectUnalertedFailedRuns(service, now, startedAt),
    collectUnalertedStaleProjects(service, now, startedAt)
  ]);

  const summary = {
    reconciledProjects,
    failedRunsAlerted: failedRuns.length,
    staleProjectsAlerted: staleProjects.length,
    delivered: false
  };

  if (failedRuns.length === 0 && staleProjects.length === 0) return summary;

  // Same rule as every other operator alert: an undeliverable channel is
  // logged loudly with the findings in it, and NO dedupe marker is written,
  // so the alert goes out on the first pass after the channel is fixed.
  if (!isOpsAlertConfigured()) {
    console.error(
      "[geo:scan:watchdog] findings but the alert channel is not deliverable (needs OPS_ALERT_EMAIL and RESEND_API_KEY) — alert not delivered",
      {
        failedRuns: failedRuns.map((run) => `${run.domain}:${run.runId}`),
        staleProjects: staleProjects.map((project) => project.domain)
      }
    );
    return summary;
  }

  try {
    await sendWatchdogAlertEmail({ failedRuns, staleProjects, detectedAt: new Date(now) });
  } catch (error) {
    console.error("[geo:scan:watchdog] alert send threw; will retry next pass", {
      message: error instanceof Error ? error.message : String(error)
    });
    return summary;
  }

  // Markers only AFTER the send: a failed send must not silence the next pass.
  const markerRows = [
    ...failedRuns.flatMap((run) => {
      const jobId = failedAnchors.get(run.runId);
      return jobId
        ? [
            {
              job_id: jobId,
              project_id: run.projectId,
              run_id: run.runId,
              level: "warn",
              message: WATCHDOG_ALERT_LOG_MESSAGE,
              context_json: { kind: "failed_run" }
            }
          ]
        : [];
    }),
    ...staleProjects.flatMap((project) => {
      const anchor = staleAnchors.get(project.projectId);
      if (!anchor) return [];
      const [jobId, runId] = anchor.split("|");
      return [
        {
          job_id: jobId,
          project_id: project.projectId,
          run_id: runId,
          level: "warn",
          message: WATCHDOG_ALERT_LOG_MESSAGE,
          context_json: { kind: "stale_data", cutoff: project.cutoffIso }
        }
      ];
    })
  ];

  if (markerRows.length) {
    const { error } = await service.from("job_logs").insert(markerRows);
    if (error) {
      console.error("[geo:scan:watchdog] could not record alert markers; next pass may repeat them", {
        message: error.message
      });
    }
  }

  return { ...summary, delivered: true };
}
