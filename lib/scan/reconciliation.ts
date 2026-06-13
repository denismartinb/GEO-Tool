import "server-only";

import {
  RECONCILE_LOG_PREFIX,
  SCAN_PENDING_TIMEOUT_ERROR_SUMMARY,
  SCAN_PENDING_TIMEOUT_RETRY_EXHAUSTED_ERROR_SUMMARY,
  SCAN_PENDING_TIMEOUT_SECONDS,
  SCAN_RUNNING_TIMEOUT_SECONDS,
  SCAN_TIMEOUT_AUTO_RETRY_CAP,
  SCAN_TIMEOUT_ERROR_SUMMARY,
  SCAN_TIMEOUT_RETRY_EXHAUSTED_ERROR_SUMMARY,
  SCAN_TIMEOUT_RETRY_LOOKBACK_HOURS,
  TIMEOUT_ERROR_SUMMARIES
} from "@/lib/scan/constants";
import { createServiceClient } from "@/lib/supabase/service";

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
 *
 * `createPendingScanRunCore` is pulled in via a dynamic import rather than a
 * top-level import on purpose: `run-creation.ts` statically imports
 * `reconcileStuckScanRuns` from this module (it reconciles before creating a
 * run), so a static import back to `run-creation.ts` here would form a module
 * cycle. The auto-retry runs only after the timeout transitions, so resolving
 * the import lazily at that point keeps the behavior identical while leaving
 * the static dependency graph acyclic (run-creation → reconciliation).
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
    const { createPendingScanRunCore } = await import("@/lib/scan/run-creation");
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
