import "server-only";

import { extractGeminiStructuredData, generateGeminiVisibilityAnswer, GeminiConfigError } from "@/lib/llm/gemini";
import { generateRecommendationsForRun } from "@/lib/recommendations/recommendation-engine";
import { computeRunScoresFromResults, SCORING_VERSION } from "@/lib/scoring/run-scoring";
import { createServiceClient } from "@/lib/supabase/service";
import type { requireUser } from "@/lib/auth";

export const MAX_REAL_SCAN_PROMPTS = 10;
const MAX_EXTRACTION_RESULTS = 10;
const EXTRACTION_VERSION = "gemini-extraction-v1";
export const ENABLE_SYNC_SCAN_EXECUTION = process.env.ENABLE_SYNC_SCAN_EXECUTION === "true";

/**
 * Timeout thresholds for the scan lifecycle reconciliation pass, per
 * docs/scan-lifecycle.md ("Timeout detection") and
 * docs/adr/0003-sync-scan-execution-and-maxduration.md. A `running` row older
 * than this is presumed to have been killed by the Vercel function timeout
 * without updating its status; a `pending` row older than this never got
 * picked up and is considered stale.
 */
export const SCAN_RUNNING_TIMEOUT_SECONDS = 90;
export const SCAN_PENDING_TIMEOUT_SECONDS = 300;

/**
 * Internal-only `error_summary` values stored on `scan_runs` rows when the
 * reconciliation pass (`reconcileStuckScanRuns`) detects a stuck `running` or
 * `pending` row. These values are never shown verbatim to the user — see
 * `getDisplayErrorSummary` for the user-facing mapping — but are kept
 * descriptive in the DB for diagnostics (sanitized: no raw provider errors,
 * no secrets).
 *
 * The `_retry_exhausted` variants are used when the auto-retry cap
 * (`SCAN_TIMEOUT_AUTO_RETRY_CAP`) has already been reached for this project,
 * so this occurrence will NOT trigger another auto-retry.
 */
export const SCAN_TIMEOUT_ERROR_SUMMARY = "scan_timeout";
export const SCAN_PENDING_TIMEOUT_ERROR_SUMMARY = "scan_pending_timeout";
export const SCAN_TIMEOUT_RETRY_EXHAUSTED_ERROR_SUMMARY = "scan_timeout_retry_exhausted";
export const SCAN_PENDING_TIMEOUT_RETRY_EXHAUSTED_ERROR_SUMMARY = "scan_pending_timeout_retry_exhausted";

/**
 * The set of internal `error_summary` values that mean "this run failed
 * because the reconciliation pass detected it was stuck (timed out)", used
 * both to count prior timeout-failures for the auto-retry cap and to decide
 * how to render the run in the UI (`getDisplayErrorSummary`).
 */
const TIMEOUT_ERROR_SUMMARIES = new Set<string>([
  SCAN_TIMEOUT_ERROR_SUMMARY,
  SCAN_PENDING_TIMEOUT_ERROR_SUMMARY,
  SCAN_TIMEOUT_RETRY_EXHAUSTED_ERROR_SUMMARY,
  SCAN_PENDING_TIMEOUT_RETRY_EXHAUSTED_ERROR_SUMMARY
]);

const RETRY_EXHAUSTED_ERROR_SUMMARIES = new Set<string>([
  SCAN_TIMEOUT_RETRY_EXHAUSTED_ERROR_SUMMARY,
  SCAN_PENDING_TIMEOUT_RETRY_EXHAUSTED_ERROR_SUMMARY
]);

/**
 * Auto-retry cap for timeout-caused failures (docs/scan-lifecycle.md,
 * "Timeout detection"; reliability ADR — see PR #78).
 *
 * Rationale: a single timeout could be transient (e.g. a slow Gemini call
 * that happened to land near the maxDuration boundary), so the FIRST time a
 * project's scan times out, `reconcileStuckScanRuns` automatically launches a
 * fresh `pending` run for that project — the user doesn't have to click
 * "Lanzar escaneo" again.
 *
 * If a project's scans STRUCTURALLY cannot finish within
 * SCAN_RUNNING_TIMEOUT_SECONDS (too many prompts, persistent Gemini latency,
 * etc.), every retry would also time out, so auto-retrying forever would
 * burn Gemini quota in an infinite loop. The cap stops this: once a project
 * has `SCAN_TIMEOUT_AUTO_RETRY_CAP` timeout-failed runs within the lookback
 * window, the next timeout is recorded as terminal `failed`
 * (`*_retry_exhausted`) with NO further auto-retry, and the user must launch
 * manually (which surfaces a calmer "couldn't complete" message, not the raw
 * timeout wording).
 *
 * Cap = 1 (one free auto-retry per lookback window). Enforced in
 * `reconcileStuckScanRuns` by counting prior `failed` rows for the same
 * `project_id` whose `error_summary` is in TIMEOUT_ERROR_SUMMARIES and whose
 * `created_at` falls within SCAN_TIMEOUT_RETRY_LOOKBACK_HOURS.
 */
export const SCAN_TIMEOUT_AUTO_RETRY_CAP = 1;

/**
 * Lookback window for counting prior timeout-failures when enforcing
 * SCAN_TIMEOUT_AUTO_RETRY_CAP. 24h is long enough to catch a same-day retry
 * storm but short enough that a project which had a one-off timeout
 * yesterday gets a fresh auto-retry budget today.
 */
export const SCAN_TIMEOUT_RETRY_LOOKBACK_HOURS = 24;

const RECONCILE_LOG_PREFIX = "[geo:scan:reconcile]";

export type ProjectActionErrorCode =
  | "active_run_exists"
  | "project_archived"
  | "project_not_found"
  | "prompts_required"
  | "scan_failed"
  | "scan_unavailable"
  | "too_many_prompts"
  | "unauthorized"
  | "unexpected_error";

export class ProjectActionError extends Error {
  constructor(public readonly code: ProjectActionErrorCode) {
    super(code);
    this.name = "ProjectActionError";
  }
}

export function getActionErrorCode(error: unknown): ProjectActionErrorCode {
  if (error instanceof ProjectActionError) return error.code;
  return "unexpected_error";
}

export function getSanitizedScanError(error: unknown) {
  if (error instanceof ProjectActionError) {
    switch (error.code) {
      case "project_not_found":
        return "No se ha encontrado el proyecto o el escaneo solicitado.";
      case "project_archived":
        return "El proyecto está archivado y no puede ejecutarse.";
      case "too_many_prompts":
        return "El escaneo pendiente supera el límite de prompts permitido.";
      default:
        return "No se pudo completar la ejecución del escaneo.";
    }
  }

  return "No se pudo completar la ejecución del escaneo.";
}

/**
 * Maps a stored `scan_runs.error_summary` value to what the user actually
 * sees on the Escaneos / Overview pages.
 *
 * The raw timeout reasons (`scan_timeout`, `scan_pending_timeout`, and their
 * `_retry_exhausted` variants) are internal diagnostic strings written by
 * `reconcileStuckScanRuns` and must never be shown verbatim — per the
 * founder's review, the technical "no respondió a tiempo" wording is too
 * alarming for end users.
 *
 * - First-time timeout (auto-retry just triggered, cap not reached): return
 *   a neutral, non-alarming message — a new scan is already starting.
 * - Retry-exhausted timeout (cap reached, no further auto-retry): return a
 *   calmer "couldn't complete" message that still doesn't expose internal
 *   terms, and points the user at manual relaunch.
 * - Any other `error_summary` (non-timeout failures) is already a sanitized,
 *   user-facing string from `getSanitizedScanError` or a job-level message —
 *   returned as-is.
 * - `null`/`undefined` is returned as `null` so callers can decide whether to
 *   render an error row at all.
 */
export function getDisplayErrorSummary(errorSummary: string | null | undefined): string | null {
  if (!errorSummary) return null;

  if (RETRY_EXHAUSTED_ERROR_SUMMARIES.has(errorSummary)) {
    return "No hemos podido completar este escaneo. Puedes lanzar uno nuevo.";
  }

  if (TIMEOUT_ERROR_SUMMARIES.has(errorSummary)) {
    return "Reintentando tu escaneo automáticamente…";
  }

  return errorSummary;
}

export type RunErrorDisplayKind = "notice" | "error";

export type RunErrorDisplay = {
  message: string;
  /**
   * "notice" — a neutral, non-alarming message (e.g. a timeout that is being
   * auto-retried). Callers should render this with a calmer visual treatment
   * (no warning colors/icon).
   * "error" — a genuine terminal failure (retry-exhausted timeout, or any
   * other non-timeout failure). Callers should render this with the existing
   * error styling.
   */
  kind: RunErrorDisplayKind;
};

/**
 * Like `getDisplayErrorSummary`, but also classifies the message so the UI
 * can pick a non-alarming visual treatment for a timeout that is currently
 * being auto-retried (PR #78), vs. a genuine terminal error.
 *
 * Returns `null` when there is nothing to render (no `error_summary`).
 */
export function getRunErrorDisplay(errorSummary: string | null | undefined): RunErrorDisplay | null {
  if (!errorSummary) return null;

  if (TIMEOUT_ERROR_SUMMARIES.has(errorSummary) && !RETRY_EXHAUSTED_ERROR_SUMMARIES.has(errorSummary)) {
    return { message: getDisplayErrorSummary(errorSummary) as string, kind: "notice" };
  }

  return { message: getDisplayErrorSummary(errorSummary) as string, kind: "error" };
}

export type AuthenticatedContext = Awaited<ReturnType<typeof requireUser>>;

type JobRow = {
  id: string;
  job_type: "scan_start" | "scan_prompt" | "scan_finalize";
  status: "pending" | "running" | "retrying" | "completed" | "failed" | "cancelled";
  attempt_count: number;
  max_attempts: number;
  payload_json: Record<string, unknown>;
};

type ScanPromptResultRow = {
  id: string;
  raw_response_text: string | null;
  prompt_text_snapshot: string;
  brand_snapshot: string;
  competitors_snapshot: Array<{ name?: string }> | null;
  provider: string;
  status: string;
  extraction_version: string;
};

async function logJob(
  service: ReturnType<typeof createServiceClient>,
  row: {
    jobId: string;
    projectId: string;
    runId: string;
    level: "debug" | "info" | "warn" | "error";
    message: string;
    context?: Record<string, unknown>;
  }
) {
  await service.from("job_logs").insert({
    job_id: row.jobId,
    project_id: row.projectId,
    run_id: row.runId,
    level: row.level,
    message: row.message,
    context_json: row.context ?? {}
  });
}

async function runStructuredExtractionForRun(input: {
  service: ReturnType<typeof createServiceClient>;
  projectId: string;
  runId: string;
}) {
  const { data: rows, error } = await input.service
    .from("scan_prompt_results")
    .select(
      "id, raw_response_text, prompt_text_snapshot, brand_snapshot, competitors_snapshot, provider, status, extraction_version"
    )
    .eq("project_id", input.projectId)
    .eq("run_id", input.runId)
    .eq("status", "completed")
    .eq("provider", "gemini")
    .not("raw_response_text", "is", null);

  if (error || !rows?.length) return;

  const eligibleRows = (rows as unknown as ScanPromptResultRow[]).filter(
    (row) => row.extraction_version !== EXTRACTION_VERSION && row.raw_response_text
  );
  const rowsToProcess = eligibleRows.slice(0, MAX_EXTRACTION_RESULTS);

  for (const row of rowsToProcess) {
    const rawResponseText = row.raw_response_text;
    if (!rawResponseText) continue;

    try {
      const competitors = Array.isArray(row.competitors_snapshot)
        ? row.competitors_snapshot
            .map((item) => (item?.name ? String(item.name) : ""))
            .filter((name) => name.length > 0)
        : [];

      const extracted = await extractGeminiStructuredData({
        brand: row.brand_snapshot,
        competitors,
        rawResponseText,
        promptText: row.prompt_text_snapshot
      });

      const mentionedCompetitorsCount = extracted.data.competitors.filter((c) => c.mentioned).length;
      const citationsCount = extracted.data.citations.length;

      await input.service
        .from("scan_prompt_results")
        .update({
          brand_mentioned: extracted.data.brand.mentioned,
          citation_found: citationsCount > 0,
          mentioned_competitors_count: mentionedCompetitorsCount,
          citations_count: citationsCount,
          sentiment: extracted.data.sentiment,
          extracted_json: extracted.data,
          extraction_version: EXTRACTION_VERSION,
          extraction_error: null
        })
        .eq("id", row.id)
        .eq("project_id", input.projectId)
        .eq("run_id", input.runId);
    } catch (extractError) {
      await input.service
        .from("scan_prompt_results")
        .update({
          extraction_error: extractError instanceof Error ? extractError.message : "Extraction failed."
        })
        .eq("id", row.id)
        .eq("project_id", input.projectId)
        .eq("run_id", input.runId);
    }
  }
}

/**
 * Counts how many `scan_runs` rows for this project are already terminal
 * `failed` with a timeout-related `error_summary` (TIMEOUT_ERROR_SUMMARIES)
 * within the last SCAN_TIMEOUT_RETRY_LOOKBACK_HOURS. Used to enforce
 * SCAN_TIMEOUT_AUTO_RETRY_CAP — see its doc comment for the full rationale.
 */
async function countRecentTimeoutFailures({
  projectId,
  service
}: {
  projectId: string;
  service: ReturnType<typeof createServiceClient>;
}): Promise<number> {
  const lookbackCutoffIso = new Date(Date.now() - SCAN_TIMEOUT_RETRY_LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();

  const { count, error } = await service
    .from("scan_runs")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("status", "failed")
    .in("error_summary", Array.from(TIMEOUT_ERROR_SUMMARIES))
    .gte("created_at", lookbackCutoffIso);

  if (error) {
    console.error(`${RECONCILE_LOG_PREFIX} failed to count recent timeout failures`, {
      projectId,
      message: error.message
    });
    // Fail closed: if we can't determine the prior count, assume the cap is
    // already reached so we don't risk an unbounded retry loop.
    return SCAN_TIMEOUT_AUTO_RETRY_CAP;
  }

  return count ?? 0;
}

/**
 * Attempts an internal auto-retry for a project whose scan was just marked
 * `failed` due to a timeout, by creating a fresh `pending` run via
 * `createPendingScanRunCore` with the service client (no authenticated user
 * — trigger_source='cron', same as the recurring-scan path). Failures here
 * are logged but non-fatal: the run was already correctly marked `failed`,
 * so the user can always retry manually even if the auto-retry itself fails
 * (e.g. transient DB error, or prompts_required if prompts were deleted
 * concurrently).
 */
async function attemptAutoRetry({
  projectId,
  service,
  reason
}: {
  projectId: string;
  service: ReturnType<typeof createServiceClient>;
  reason: string;
}): Promise<void> {
  try {
    const newRunId = await createPendingScanRunCore({
      projectId,
      readClient: service,
      service,
      triggeredByUserId: null,
      triggerSource: "cron"
    });

    console.info(`${RECONCILE_LOG_PREFIX} auto-retried timed-out scan`, {
      projectId,
      reason,
      newRunId
    });
  } catch (retryError) {
    console.error(`${RECONCILE_LOG_PREFIX} auto-retry failed, leaving run as failed for manual retry`, {
      projectId,
      reason,
      message: retryError instanceof Error ? retryError.message : String(retryError)
    });
  }
}

/**
 * Timeout-detection pass for the scan lifecycle (docs/scan-lifecycle.md,
 * "Timeout detection"). Finds `running` rows whose `started_at` is older than
 * SCAN_RUNNING_TIMEOUT_SECONDS and `pending` rows whose `created_at` is older
 * than SCAN_PENDING_TIMEOUT_SECONDS, and transitions them to `failed` with an
 * internal-only `error_summary` (see TIMEOUT_ERROR_SUMMARIES /
 * getDisplayErrorSummary for the user-facing mapping).
 *
 * This is what unblocks `active_run_exists`: a stuck run no longer permanently
 * blocks new scans for the project, because it becomes terminal (`failed`) on
 * the next reconciliation pass instead of remaining `pending`/`running`
 * forever.
 *
 * Auto-retry with cap (PR #78): when a row is marked `failed` due to timeout,
 * this also counts prior timeout-failures for the same project within
 * SCAN_TIMEOUT_RETRY_LOOKBACK_HOURS. If that count is below
 * SCAN_TIMEOUT_AUTO_RETRY_CAP, a fresh `pending` run is created automatically
 * for the project (the user doesn't need to click "Lanzar escaneo" again). If
 * the cap is reached, no auto-retry is triggered and the row is marked with a
 * `_retry_exhausted` reason instead, so the user can still retry manually
 * (with a calmer message — see getDisplayErrorSummary) without entering an
 * infinite auto-retry loop.
 *
 * Scoped to a single project to respect the same project_id scoping used
 * elsewhere in this module; uses the service client because the transition is
 * a system-level correction, not a user-initiated write, but the query is
 * always filtered by `project_id`.
 */
export async function reconcileStuckScanRuns({
  projectId,
  service
}: {
  projectId: string;
  service: ReturnType<typeof createServiceClient>;
}): Promise<{ reconciledCount: number }> {
  const now = Date.now();
  const runningCutoffIso = new Date(now - SCAN_RUNNING_TIMEOUT_SECONDS * 1000).toISOString();
  const pendingCutoffIso = new Date(now - SCAN_PENDING_TIMEOUT_SECONDS * 1000).toISOString();
  const nowIso = new Date(now).toISOString();

  let reconciledCount = 0;

  const { data: staleRunningRuns, error: staleRunningError } = await service
    .from("scan_runs")
    .select("id, started_at, created_at")
    .eq("project_id", projectId)
    .eq("status", "running")
    .lt("started_at", runningCutoffIso);

  const { data: stalePendingRuns, error: stalePendingError } = await service
    .from("scan_runs")
    .select("id, created_at")
    .eq("project_id", projectId)
    .eq("status", "pending")
    .lt("created_at", pendingCutoffIso);

  const hasStaleRows = Boolean(staleRunningRuns?.length || stalePendingRuns?.length);

  // Count prior timeout-failures once up front, then track how many
  // additional timeout-failures this pass is about to record, so multiple
  // stale rows reconciled in the same pass cannot each independently trigger
  // their own auto-retry (which would otherwise create several new pending
  // runs at once).
  let priorTimeoutFailureCount = hasStaleRows
    ? await countRecentTimeoutFailures({ projectId, service })
    : 0;
  let autoRetryTriggered = false;

  if (staleRunningError) {
    console.error(`${RECONCILE_LOG_PREFIX} failed to query stale running runs`, {
      projectId,
      message: staleRunningError.message
    });
  } else if (staleRunningRuns?.length) {
    for (const run of staleRunningRuns) {
      const capReached = priorTimeoutFailureCount >= SCAN_TIMEOUT_AUTO_RETRY_CAP;
      const errorSummary = capReached
        ? SCAN_TIMEOUT_RETRY_EXHAUSTED_ERROR_SUMMARY
        : SCAN_TIMEOUT_ERROR_SUMMARY;

      const { error: updateError } = await service
        .from("scan_runs")
        .update({
          status: "failed",
          error_summary: errorSummary,
          finished_at: nowIso
        })
        .eq("id", run.id)
        .eq("project_id", projectId)
        .eq("status", "running");

      if (updateError) {
        console.error(`${RECONCILE_LOG_PREFIX} failed to mark stale running run as failed`, {
          projectId,
          runId: run.id,
          message: updateError.message
        });
        continue;
      }

      reconciledCount += 1;
      priorTimeoutFailureCount += 1;
      console.info(`${RECONCILE_LOG_PREFIX} marked stale running run as failed (${errorSummary})`, {
        projectId,
        runId: run.id,
        startedAt: run.started_at,
        capReached
      });

      if (!capReached && !autoRetryTriggered) {
        autoRetryTriggered = true;
        await attemptAutoRetry({ projectId, service, reason: errorSummary });
      }
    }
  }

  if (stalePendingError) {
    console.error(`${RECONCILE_LOG_PREFIX} failed to query stale pending runs`, {
      projectId,
      message: stalePendingError.message
    });
  } else if (stalePendingRuns?.length) {
    for (const run of stalePendingRuns) {
      const capReached = priorTimeoutFailureCount >= SCAN_TIMEOUT_AUTO_RETRY_CAP;
      const errorSummary = capReached
        ? SCAN_PENDING_TIMEOUT_RETRY_EXHAUSTED_ERROR_SUMMARY
        : SCAN_PENDING_TIMEOUT_ERROR_SUMMARY;

      const { error: updateError } = await service
        .from("scan_runs")
        .update({
          status: "failed",
          error_summary: errorSummary,
          finished_at: nowIso
        })
        .eq("id", run.id)
        .eq("project_id", projectId)
        .eq("status", "pending");

      if (updateError) {
        console.error(`${RECONCILE_LOG_PREFIX} failed to mark stale pending run as failed`, {
          projectId,
          runId: run.id,
          message: updateError.message
        });
        continue;
      }

      reconciledCount += 1;
      priorTimeoutFailureCount += 1;
      console.info(`${RECONCILE_LOG_PREFIX} marked stale pending run as failed (${errorSummary})`, {
        projectId,
        runId: run.id,
        createdAt: run.created_at,
        capReached
      });

      if (!capReached && !autoRetryTriggered) {
        autoRetryTriggered = true;
        await attemptAutoRetry({ projectId, service, reason: errorSummary });
      }
    }
  }

  return { reconciledCount };
}

async function createPendingScanRunCore({
  projectId,
  readClient,
  service,
  triggeredByUserId,
  triggerSource
}: {
  projectId: string;
  readClient: AuthenticatedContext["supabase"];
  service: ReturnType<typeof createServiceClient>;
  triggeredByUserId: string | null;
  triggerSource: "user" | "cron";
}): Promise<string> {
  const { data: project, error: projectError } = await readClient
    .from("projects")
    .select("id, is_archived")
    .eq("id", projectId)
    .maybeSingle();

  if (projectError) {
    throw new ProjectActionError("unexpected_error");
  }

  if (!project) {
    throw new ProjectActionError("project_not_found");
  }

  if (project.is_archived) {
    throw new ProjectActionError("project_archived");
  }

  // Reconcile any stuck pending/running runs before checking for an active
  // run, so a previously-stuck scan does not permanently block a new one
  // (docs/scan-lifecycle.md, "Timeout detection" / invariant 3).
  await reconcileStuckScanRuns({ projectId, service });

  const { data: activeRun, error: activeRunError } = await readClient
    .from("scan_runs")
    .select("id")
    .eq("project_id", projectId)
    .in("status", ["pending", "running"])
    .limit(1)
    .maybeSingle();

  if (activeRunError) {
    throw new ProjectActionError("unexpected_error");
  }

  if (activeRun) {
    throw new ProjectActionError("active_run_exists");
  }

  const { data: activePrompts, error: promptError } = await readClient
    .from("project_prompts")
    .select("id, prompt_text")
    .eq("project_id", projectId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (promptError) {
    throw new ProjectActionError("unexpected_error");
  }

  if (!activePrompts?.length) {
    throw new ProjectActionError("prompts_required");
  }

  if (activePrompts.length > MAX_REAL_SCAN_PROMPTS) {
    throw new ProjectActionError("too_many_prompts");
  }

  const promptCount = activePrompts.length;

  const { data: run, error: runError } = await service
    .from("scan_runs")
    .insert({
      project_id: projectId,
      triggered_by_user_id: triggeredByUserId,
      trigger_source: triggerSource,
      status: "pending",
      total_prompts: promptCount,
      successful_prompts: 0,
      failed_prompts: 0,
      extraction_version: "v1",
      scoring_version: "v1"
    })
    .select("id")
    .single();

  if (runError || !run) {
    throw new ProjectActionError("scan_failed");
  }

  const jobsPayload = [
    {
      project_id: projectId,
      run_id: run.id,
      job_type: "scan_start",
      status: "pending",
      payload_json: { run_id: run.id, project_id: projectId }
    },
    ...activePrompts.map((prompt) => ({
      project_id: projectId,
      run_id: run.id,
      job_type: "scan_prompt",
      status: "pending",
      payload_json: {
        run_id: run.id,
        project_id: projectId,
        prompt_id: prompt.id,
        prompt_text: prompt.prompt_text
      }
    })),
    {
      project_id: projectId,
      run_id: run.id,
      job_type: "scan_finalize",
      status: "pending",
      payload_json: { run_id: run.id, project_id: projectId }
    }
  ];

  const { error: jobsError } = await service.from("jobs").insert(jobsPayload);

  if (jobsError) {
    await service
      .from("scan_runs")
      .update({
        status: "failed",
        error_summary: "No se han podido crear los jobs del escaneo.",
        finished_at: new Date().toISOString()
      })
      .eq("id", run.id)
      .eq("project_id", projectId);

    throw new ProjectActionError("scan_failed");
  }

  return run.id;
}

export async function createPendingScanRun({
  projectId,
  supabase,
  user
}: {
  projectId: string;
  supabase: AuthenticatedContext["supabase"];
  user: AuthenticatedContext["user"];
}): Promise<string> {
  return createPendingScanRunCore({
    projectId,
    readClient: supabase,
    service: createServiceClient(),
    triggeredByUserId: user.id,
    triggerSource: "user"
  });
}

/**
 * Cron-triggered variant of createPendingScanRun: no authenticated user, all
 * reads and writes go through the service client, and the run is recorded
 * with trigger_source='cron' and triggered_by_user_id=null (see migration
 * 0008_recurring_scans.sql).
 */
export async function createPendingScanRunForCron({
  projectId,
  service
}: {
  projectId: string;
  service: ReturnType<typeof createServiceClient>;
}): Promise<string> {
  return createPendingScanRunCore({
    projectId,
    readClient: service,
    service,
    triggeredByUserId: null,
    triggerSource: "cron"
  });
}

export async function executePendingScan({
  projectId,
  runId,
  supabase
}: {
  projectId: string;
  runId: string;
  supabase: AuthenticatedContext["supabase"];
}) {
  const { data: run, error: runError } = await supabase
    .from("scan_runs")
    .select("id, project_id, status, total_prompts")
    .eq("id", runId)
    .eq("project_id", projectId)
    .single();

  if (runError || !run) {
    throw new ProjectActionError("project_not_found");
  }

  if (run.status !== "pending") {
    throw new ProjectActionError("scan_failed");
  }

  const service = createServiceClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, domain, brand, country, language")
    .eq("id", projectId)
    .single();

  if (!project) {
    throw new ProjectActionError("project_not_found");
  }

  const [{ data: competitors }, { data: jobsRaw, error: jobsError }] = await Promise.all([
    supabase
      .from("project_competitors")
      .select("name, domain")
      .eq("project_id", projectId)
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    service
      .from("jobs")
      .select("id, job_type, status, attempt_count, max_attempts, payload_json, created_at")
      .eq("project_id", projectId)
      .eq("run_id", runId)
      .order("created_at", { ascending: true })
  ]);

  if (jobsError || !jobsRaw?.length) {
    await service
      .from("scan_runs")
      .update({
        status: "failed",
        error_summary: "No se han encontrado jobs para el escaneo.",
        finished_at: new Date().toISOString()
      })
      .eq("id", runId)
      .eq("project_id", projectId);

    throw new ProjectActionError("scan_failed");
  }

  const jobs = jobsRaw as unknown as (JobRow & { created_at: string })[];
  const startJob = jobs.find((job) => job.job_type === "scan_start");
  const promptJobs = jobs.filter((job) => job.job_type === "scan_prompt");
  const finalizeJob = jobs.find((job) => job.job_type === "scan_finalize");

  if (promptJobs.length > MAX_REAL_SCAN_PROMPTS) {
    throw new ProjectActionError("too_many_prompts");
  }

  const nowIso = new Date().toISOString();
  const { data: runningRun, error: runStartError } = await service
    .from("scan_runs")
    .update({ status: "running", started_at: nowIso, error_summary: null })
    .eq("id", runId)
    .eq("project_id", projectId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (runStartError || !runningRun) {
    throw new ProjectActionError("scan_failed");
  }

  let currentRunningPromptJob: JobRow | null = null;
  let promptSuccess = 0;
  let promptFailed = 0;

  try {
    if (startJob) {
      await service
        .from("jobs")
        .update({
          status: "running",
          locked_at: new Date().toISOString(),
          locked_by: "gemini-executor",
          attempt_count: startJob.attempt_count + 1,
          last_error: null
        })
        .eq("id", startJob.id)
        .eq("project_id", projectId)
        .eq("run_id", runId);

      await logJob(service, {
        jobId: startJob.id,
        projectId,
        runId,
        level: "info",
        message: "Gemini scan started."
      });

      await service
        .from("jobs")
        .update({
          status: "completed",
          locked_at: null,
          locked_by: null
        })
        .eq("id", startJob.id)
        .eq("project_id", projectId)
        .eq("run_id", runId);
    }

    for (let i = 0; i < promptJobs.length; i += 1) {
      const job = promptJobs[i];

      await service
        .from("jobs")
        .update({
          status: "running",
          locked_at: new Date().toISOString(),
          locked_by: "gemini-executor",
          attempt_count: job.attempt_count + 1,
          last_error: null
        })
        .eq("id", job.id)
        .eq("project_id", projectId)
        .eq("run_id", runId);
      currentRunningPromptJob = job;

      const promptId = String(job.payload_json.prompt_id ?? "");
      const promptText = String(job.payload_json.prompt_text ?? "").trim();

      if (!promptId || !promptText) {
        await logJob(service, {
          jobId: job.id,
          projectId,
          runId,
          level: "error",
          message: "Missing prompt payload for scan_prompt job."
        });

        await service
          .from("jobs")
          .update({
            status: "failed",
            locked_at: null,
            locked_by: null,
            last_error: "Missing prompt payload."
          })
          .eq("id", job.id)
          .eq("project_id", projectId)
          .eq("run_id", runId);

        promptFailed += 1;
        currentRunningPromptJob = null;
        continue;
      }

      const { data: existingResult } = await service
        .from("scan_prompt_results")
        .select("id")
        .eq("run_id", runId)
        .eq("project_id", projectId)
        .eq("prompt_id", promptId)
        .maybeSingle();

      if (existingResult) {
        await logJob(service, {
          jobId: job.id,
          projectId,
          runId,
          level: "warn",
          message: "Skipping prompt job because result already exists.",
          context: { prompt_id: promptId }
        });
        await service
          .from("jobs")
          .update({
            status: "completed",
            locked_at: null,
            locked_by: null
          })
          .eq("id", job.id)
          .eq("project_id", projectId)
          .eq("run_id", runId);
        promptSuccess += 1;
        currentRunningPromptJob = null;
        continue;
      }

      let llmResult: Awaited<ReturnType<typeof generateGeminiVisibilityAnswer>>;
      let latency: number;

      try {
        const llmStart = Date.now();
        llmResult = await generateGeminiVisibilityAnswer({
          prompt: promptText,
          brand: project.brand,
          competitors: (competitors ?? []).map((c) => c.name),
          country: project.country,
          language: project.language
        });
        latency = Date.now() - llmStart;
      } catch (error) {
        if (error instanceof GeminiConfigError) {
          throw error;
        }

        const errorSummary = getSanitizedScanError(error);

        await logJob(service, {
          jobId: job.id,
          projectId,
          runId,
          level: "error",
          message: "Gemini prompt execution failed.",
          context: { prompt_id: promptId, error: error instanceof Error ? error.message : String(error) }
        });

        await service
          .from("jobs")
          .update({
            status: "failed",
            locked_at: null,
            locked_by: null,
            last_error: errorSummary
          })
          .eq("id", job.id)
          .eq("project_id", projectId)
          .eq("run_id", runId);

        promptFailed += 1;
        currentRunningPromptJob = null;
        continue;
      }

      const responseLower = llmResult.text.toLowerCase();
      const brandMentioned = responseLower.includes(project.brand.toLowerCase());
      const mentionedCompetitorsCount = (competitors ?? []).reduce(
        (acc, competitor) => (responseLower.includes(competitor.name.toLowerCase()) ? acc + 1 : acc),
        0
      );
      const citationRegex = /(https?:\/\/[^\s)]+|www\.[^\s)]+)/gi;
      const citations = llmResult.text.match(citationRegex) ?? [];
      const citationFound = citations.length > 0;
      const citationsCount = citations.length;
      const sentiment: "positive" | "neutral" | "negative" | "mixed" | "unknown" = "unknown";

      const extractedJson = {
        phase: "phase4-basic",
        notes: "Basic extraction placeholders from raw Gemini response.",
        citations
      };

      const { error: resultError } = await service.from("scan_prompt_results").insert({
        run_id: runId,
        project_id: projectId,
        prompt_id: promptId,
        prompt_text_snapshot: promptText,
        brand_snapshot: project.brand,
        competitors_snapshot: (competitors ?? []).map((c) => ({ name: c.name, domain: c.domain })),
        country_snapshot: project.country,
        language_snapshot: project.language,
        provider: "gemini",
        model: llmResult.model,
        status: "completed",
        raw_response_text: llmResult.text,
        raw_response_json: {
          text: llmResult.text,
          total_tokens: llmResult.totalTokens
        },
        tokens_in: llmResult.tokensIn,
        tokens_out: llmResult.tokensOut,
        cost_usd: null,
        llm_latency_ms: latency,
        brand_mentioned: brandMentioned,
        citation_found: citationFound,
        mentioned_competitors_count: mentionedCompetitorsCount,
        citations_count: citationsCount,
        sentiment,
        extraction_version: "phase4-basic-v1",
        extracted_json: extractedJson
      });

      if (resultError) {
        await logJob(service, {
          jobId: job.id,
          projectId,
          runId,
          level: "error",
          message: "Failed to insert prompt result.",
          context: { reason: resultError.message }
        });

        await service
          .from("jobs")
          .update({
            status: "failed",
            locked_at: null,
            locked_by: null,
            last_error: "Failed to insert prompt result."
          })
          .eq("id", job.id)
          .eq("project_id", projectId)
          .eq("run_id", runId);

        promptFailed += 1;
        currentRunningPromptJob = null;
        continue;
      }

      await logJob(service, {
        jobId: job.id,
        projectId,
        runId,
        level: "info",
        message: "Prompt job completed with Gemini response.",
        context: { prompt_id: promptId, brand_mentioned: brandMentioned, citation_found: citationFound }
      });

      await service
        .from("jobs")
        .update({
          status: "completed",
          locked_at: null,
          locked_by: null
        })
        .eq("id", job.id)
        .eq("project_id", projectId)
        .eq("run_id", runId);

      promptSuccess += 1;
      currentRunningPromptJob = null;
    }

    if (promptSuccess === 0) {
      throw new ProjectActionError("scan_failed");
    }

    await runStructuredExtractionForRun({
      service,
      projectId,
      runId
    });

    const { data: promptResults } = await service
      .from("scan_prompt_results")
      .select(
        "id, prompt_text_snapshot, brand_mentioned, citation_found, mentioned_competitors_count, citations_count, sentiment, extracted_json, extraction_error, status"
      )
      .eq("project_id", projectId)
      .eq("run_id", runId);

    const completedPromptResults = (promptResults ?? []).filter((row) => row.status === "completed");
    const scores = computeRunScoresFromResults(
      completedPromptResults.map((row) => ({
        id: row.id,
        prompt_text_snapshot: row.prompt_text_snapshot,
        brand_mentioned: row.brand_mentioned,
        citation_found: row.citation_found,
        mentioned_competitors_count: row.mentioned_competitors_count,
        citations_count: row.citations_count,
        sentiment: row.sentiment,
        extracted_json: row.extracted_json,
        extraction_error: row.extraction_error
      }))
    );

    await service.from("run_scores").upsert(
      {
        run_id: runId,
        project_id: projectId,
        scoring_version: SCORING_VERSION,
        visibility_score: scores.visibility_score,
        citation_score: scores.citation_score,
        competitor_gap_score: scores.competitor_gap_score,
        confidence: scores.confidence,
        details_json: scores.details_json
      },
      { onConflict: "run_id" }
    );

    const recommendationRows = generateRecommendationsForRun({
      project: {
        brand: project.brand,
        domain: project.domain,
        country: project.country,
        language: project.language
      },
      competitors: (competitors ?? []).map((c) => c.name),
      runScore: {
        visibility_score: scores.visibility_score,
        citation_score: scores.citation_score,
        competitor_gap_score: scores.competitor_gap_score,
        confidence: scores.confidence,
        details_json: scores.details_json
      },
      promptResults: completedPromptResults.map((row) => ({
        id: row.id,
        prompt_text_snapshot: row.prompt_text_snapshot,
        brand_mentioned: row.brand_mentioned,
        citation_found: row.citation_found,
        mentioned_competitors_count: row.mentioned_competitors_count,
        citations_count: row.citations_count,
        sentiment: row.sentiment,
        extracted_json: row.extracted_json
      }))
    });

    // Close out any still-"active" recommendations from prior runs of this
    // project so the sidebar badge (which counts active recommendations
    // project-wide) stays in sync with the latest run's recommendations
    // page (which scopes to run_id). History is preserved via status change,
    // not deletion. Fail soft: a failure here must not prevent the current
    // run's recommendations from being persisted or the run from completing.
    const { error: supersedeError } = await service
      .from("recommendations")
      .update({ status: "superseded" })
      .eq("project_id", projectId)
      .eq("status", "active")
      .neq("run_id", runId);

    if (supersedeError) {
      console.error("[scan-runner] failed to supersede prior recommendations", {
        projectId,
        runId,
        message: supersedeError.message
      });
    }

    await service.from("recommendations").delete().eq("project_id", projectId).eq("run_id", runId);
    if (recommendationRows.length) {
      await service.from("recommendations").insert(
        recommendationRows.map((rec) => ({
          run_id: runId,
          project_id: projectId,
          status: "active",
          priority_rank: rec.priority_rank,
          title: rec.title,
          description: rec.description,
          rule_id: rec.rule_id,
          recommendation_type: rec.recommendation_type,
          impact: rec.impact,
          effort: rec.effort,
          confidence: rec.confidence,
          source_type: "rule",
          evidence_json: rec.evidence_json
        }))
      );
    }

    if (finalizeJob) {
      await service
        .from("jobs")
        .update({
          status: "running",
          locked_at: new Date().toISOString(),
          locked_by: "gemini-executor",
          attempt_count: finalizeJob.attempt_count + 1,
          last_error: null
        })
        .eq("id", finalizeJob.id)
        .eq("project_id", projectId)
        .eq("run_id", runId);

      await logJob(service, {
        jobId: finalizeJob.id,
        projectId,
        runId,
        level: "info",
        message: "Finalizing Gemini run."
      });

      await service
        .from("jobs")
        .update({
          status: "completed",
          locked_at: null,
          locked_by: null
        })
        .eq("id", finalizeJob.id)
        .eq("project_id", projectId)
        .eq("run_id", runId);
    }

    await service
      .from("scan_runs")
      .update({
        status: "completed",
        successful_prompts: promptSuccess,
        failed_prompts: promptFailed,
        finished_at: new Date().toISOString(),
        extraction_version: EXTRACTION_VERSION,
        scoring_version: SCORING_VERSION
      })
      .eq("id", runId)
      .eq("project_id", projectId);
  } catch (error) {
    const errorSummary = getSanitizedScanError(error);

    if (currentRunningPromptJob) {
      await service
        .from("jobs")
        .update({
          status: "failed",
          locked_at: null,
          locked_by: null,
          last_error: errorSummary
        })
        .eq("id", currentRunningPromptJob.id)
        .eq("project_id", projectId)
        .eq("run_id", runId);

      await logJob(service, {
        jobId: currentRunningPromptJob.id,
        projectId,
        runId,
        level: "error",
        message: "Gemini prompt execution failed.",
        context: { error: errorSummary }
      });
    }

    await service
      .from("jobs")
      .update({
        status: "failed",
        locked_at: null,
        locked_by: null,
        last_error: errorSummary
      })
      .eq("project_id", projectId)
      .eq("run_id", runId)
      .eq("status", "running");

    const { count: failedPromptCount } = await service
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("run_id", runId)
      .eq("job_type", "scan_prompt")
      .eq("status", "failed");

    await service
      .from("scan_runs")
      .update({
        status: "failed",
        error_summary: errorSummary,
        successful_prompts: promptSuccess,
        failed_prompts: failedPromptCount ?? promptFailed,
        finished_at: new Date().toISOString()
      })
      .eq("id", runId)
      .eq("project_id", projectId);

    throw new ProjectActionError("scan_failed");
  }
}

/**
 * Create a pending run and, when sync execution is enabled, run it to completion
 * in-request. Used by both the manual "launch scan" action and the automatic
 * scan triggered right after a new domain is created.
 * Returns the run id and whether it was executed synchronously.
 */
export async function launchScan({
  projectId,
  supabase,
  user
}: {
  projectId: string;
  supabase: AuthenticatedContext["supabase"];
  user: AuthenticatedContext["user"];
}): Promise<{ runId: string; executed: boolean }> {
  const runId = await createPendingScanRun({ projectId, supabase, user });

  if (ENABLE_SYNC_SCAN_EXECUTION) {
    await executePendingScan({ projectId, runId, supabase });
    return { runId, executed: true };
  }

  return { runId, executed: false };
}
