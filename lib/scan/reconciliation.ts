import "server-only";

import {
  ALL_RECOVERABLE_ERROR_SUMMARIES,
  RECONCILE_LOG_PREFIX,
  SCAN_NO_RESULTS_ERROR_SUMMARY,
  SCAN_NO_RESULTS_RETRY_EXHAUSTED_ERROR_SUMMARY,
  SCAN_PENDING_TIMEOUT_ERROR_SUMMARY,
  SCAN_PENDING_TIMEOUT_RETRY_EXHAUSTED_ERROR_SUMMARY,
  SCAN_PENDING_TIMEOUT_SECONDS,
  SCAN_RUNNING_TIMEOUT_SECONDS,
  SCAN_TIMEOUT_AUTO_RETRY_CAP,
  SCAN_TIMEOUT_ERROR_SUMMARY,
  SCAN_TIMEOUT_RETRY_EXHAUSTED_ERROR_SUMMARY,
  SCAN_TIMEOUT_RETRY_LOOKBACK_HOURS
} from "@/lib/scan/constants";
import { scheduleScanContinuation } from "@/lib/scan/continuation";
import { checkAndSendScanHealthAlert } from "@/lib/scan/scan-health-alert";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Cheap, read-only gate for callers on a hot render path (Overview, Escaneos)
 * that today call `reconcileStuckScanRuns` unconditionally on every page
 * load. `reconcileStuckScanRuns` itself always issues its staleness-check
 * SELECTs even when nothing is stale, so the common case (no active scan,
 * no unresolved zero-result failure) pays that cost for nothing.
 *
 * `runs` must be ordered by `created_at` descending (both call sites already
 * do this) — mirrors the two things `reconcileStuckScanRuns` can actually act
 * on: (1) any row still `pending`/`running` (might be stale — the exact
 * staleness cutoff is re-checked inside `reconcileStuckScanRuns` itself, this
 * only decides whether it's worth asking), and (2) the zero-result auto-retry
 * pass, which only ever acts on the *latest* row for the project (an older
 * `SCAN_NO_RESULTS_ERROR_SUMMARY` row is already "superseded" by construction
 * once a newer row exists — see the pass's own supersede check below).
 */
export function scanRunsNeedReconciliation(
  runs: Array<{ status: string; error_summary?: string | null }> | null | undefined
): boolean {
  if (!runs?.length) return false;
  if (runs.some((r) => r.status === "pending" || r.status === "running")) return true;

  const latest = runs[0];
  return latest.status === "failed" && latest.error_summary === SCAN_NO_RESULTS_ERROR_SUMMARY;
}

/**
 * Counts how many `scan_runs` rows for this project are already terminal
 * `failed` with a recoverable `error_summary` (ALL_RECOVERABLE_ERROR_SUMMARIES
 * — timeouts AND "zero successful prompts", SCAN-ROBUST-1) within the last
 * SCAN_TIMEOUT_RETRY_LOOKBACK_HOURS. Used to enforce SCAN_TIMEOUT_AUTO_RETRY_CAP
 * — see its doc comment for the full rationale. A single shared cap/lookback
 * covers all recoverable failure types for a project, so a project that hits
 * one timeout and then one zero-results failure in the same window does not
 * get two separate auto-retry budgets.
 */
async function countRecentRecoverableFailures({
  projectId,
  service,
  excludeRunId
}: {
  projectId: string;
  service: ReturnType<typeof createServiceClient>;
  /**
   * Exclude this run's own id from the count. Needed by the zero-results
   * pass: the run being evaluated is itself already a `failed` row with a
   * recoverable `error_summary`, so without exclusion it would always count
   * against its own cap and never get a first auto-retry.
   */
  excludeRunId?: string;
}): Promise<number> {
  const lookbackCutoffIso = new Date(Date.now() - SCAN_TIMEOUT_RETRY_LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();

  let query = service
    .from("scan_runs")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("status", "failed")
    .in("error_summary", Array.from(ALL_RECOVERABLE_ERROR_SUMMARIES));

  if (excludeRunId) {
    query = query.neq("id", excludeRunId);
  }

  const { count, error } = await query.gte("created_at", lookbackCutoffIso);

  if (error) {
    console.error(`${RECONCILE_LOG_PREFIX} failed to count recent recoverable failures`, {
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
  let newRunId: string;

  try {
    const { createPendingScanRunCore } = await import("@/lib/scan/run-creation");
    newRunId = await createPendingScanRunCore({
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
    return;
  }

  // Start it (SCAN-DRIVE-1, docs/adr/0037). Creating the run used to be the
  // whole auto-retry: the row was left `pending` for "whatever drives scans"
  // to pick up, and the only thing that did was the foreground driver in a
  // browser sitting on one of the project's screens. With nobody looking, the
  // replacement run just aged out into `scan_pending_timeout` — a retry that
  // fails the same way as the failure it was retrying is not a retry.
  //
  // Guarded separately from the creation above, and not folded into its
  // try/catch, so a hand-off that cannot be scheduled is never reported as
  // "auto-retry failed": the run exists either way, and a driver arriving on
  // a page render still picks it up.
  try {
    await scheduleScanContinuation({ projectId, runId: newRunId });
  } catch (dispatchError) {
    console.error(`${RECONCILE_LOG_PREFIX} auto-retry created a run but could not start it`, {
      projectId,
      reason,
      newRunId,
      message: dispatchError instanceof Error ? dispatchError.message : String(dispatchError)
    });
  }
}

/**
 * Timeout-detection pass for the scan lifecycle (docs/scan-lifecycle.md,
 * "Timeout detection"). Finds `running` rows whose `updated_at` is older than
 * SCAN_RUNNING_TIMEOUT_SECONDS and `pending` rows whose `created_at` is older
 * than SCAN_PENDING_TIMEOUT_SECONDS, and transitions them to `failed` with an
 * internal-only `error_summary` (see TIMEOUT_ERROR_SUMMARIES /
 * getDisplayErrorSummary for the user-facing mapping).
 *
 * `updated_at` (not `started_at`) is the staleness anchor for `running` rows
 * (SCAN-CHAIN-1): a multi-batch campaign can legitimately stay `running` far
 * longer than SCAN_RUNNING_TIMEOUT_SECONDS after `started_at`, self-chaining
 * one batch at a time. `updated_at` is bumped by the DB trigger on every
 * write `executePendingScan` makes as it makes real progress (each batch's
 * `refreshRunProgressCounters` call), so a campaign that is actively
 * progressing never looks stale — only one that has genuinely stopped
 * advancing (a lost self-chain dispatch, a crashed invocation) does.
 *
 * This is what unblocks `active_run_exists`: a stuck run no longer permanently
 * blocks new scans for the project, because it becomes terminal (`failed`) on
 * the next reconciliation pass instead of remaining `pending`/`running`
 * forever.
 *
 * Auto-retry with cap (PR #78, generalized by SCAN-ROBUST-1): when a row is
 * marked `failed` due to timeout, this also counts prior recoverable failures
 * for the same project within SCAN_TIMEOUT_RETRY_LOOKBACK_HOURS
 * (ALL_RECOVERABLE_ERROR_SUMMARIES — timeouts AND "zero successful prompts").
 * If that count is below SCAN_TIMEOUT_AUTO_RETRY_CAP, a fresh `pending` run is
 * created automatically for the project (the user doesn't need to click
 * "Lanzar escaneo" again). If the cap is reached, no auto-retry is triggered
 * and the row is marked with a `_retry_exhausted` reason instead, so the user
 * can still retry manually (with a calmer message — see
 * getDisplayErrorSummary) without entering an infinite auto-retry loop.
 *
 * SCAN-ROBUST-1 also adds a second pass (after the timeout passes) over
 * already-`failed` runs whose `error_summary` is SCAN_NO_RESULTS_ERROR_SUMMARY
 * ("zero successful prompts" — every prompt in the run individually failed
 * but recoverably, per docs/scan-lifecycle.md). These runs are already
 * terminal `failed` when this function runs, so that pass only decides
 * whether to auto-retry (same cap/lookback) or mark the row
 * SCAN_NO_RESULTS_RETRY_EXHAUSTED_ERROR_SUMMARY.
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
    .select("id, started_at, created_at, updated_at")
    .eq("project_id", projectId)
    .eq("status", "running")
    .lt("updated_at", runningCutoffIso);

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
  let priorRecoverableFailureCount = hasStaleRows
    ? await countRecentRecoverableFailures({ projectId, service })
    : 0;
  let autoRetryTriggered = false;

  if (staleRunningError) {
    console.error(`${RECONCILE_LOG_PREFIX} failed to query stale running runs`, {
      projectId,
      message: staleRunningError.message
    });
  } else if (staleRunningRuns?.length) {
    for (const run of staleRunningRuns) {
      const capReached = priorRecoverableFailureCount >= SCAN_TIMEOUT_AUTO_RETRY_CAP;
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
      priorRecoverableFailureCount += 1;
      console.info(`${RECONCILE_LOG_PREFIX} marked stale running run as failed (${errorSummary})`, {
        projectId,
        runId: run.id,
        startedAt: run.started_at,
        updatedAt: run.updated_at,
        capReached
      });

      if (!capReached && !autoRetryTriggered) {
        autoRetryTriggered = true;
        await attemptAutoRetry({ projectId, service, reason: errorSummary });
      } else if (capReached) {
        // EXTRACTION-RELIABILITY-1 Fase B: a run that timed out AND has spent
        // its auto-retry will not fix itself, so it is the operator's problem
        // now. This is the exact shape of the 2026-08-04 IKEA failure, which
        // nobody was told about — the run just sat there marked `Fallido`.
        await checkAndSendScanHealthAlert({
          service,
          projectId,
          runId: run.id as string,
          runFailedWithoutRetry: true
        });
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
      const capReached = priorRecoverableFailureCount >= SCAN_TIMEOUT_AUTO_RETRY_CAP;
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
      priorRecoverableFailureCount += 1;
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

  // SCAN-ROBUST-1: generalize auto-retry to runs that already finished
  // `failed` with zero successful prompts (executor.ts,
  // ProjectActionError "scan_failed_no_results" ->
  // SCAN_NO_RESULTS_ERROR_SUMMARY). Unlike the timeout passes above, these
  // rows are already terminal `failed` by the time this reconciliation pass
  // runs — there is nothing to "mark as failed" here, only a decision about
  // whether to auto-retry or mark retry-exhausted.
  //
  // A row only needs to be considered once: if a newer scan_runs row already
  // exists for this project (created after this failed run), either a manual
  // relaunch or a prior reconciliation pass's auto-retry has already
  // superseded it, so it is skipped here to avoid retrying the same failure
  // repeatedly.
  const { data: noResultsFailedRuns, error: noResultsError } = await service
    .from("scan_runs")
    .select("id, created_at")
    .eq("project_id", projectId)
    .eq("status", "failed")
    .eq("error_summary", SCAN_NO_RESULTS_ERROR_SUMMARY)
    .order("created_at", { ascending: true });

  if (noResultsError) {
    console.error(`${RECONCILE_LOG_PREFIX} failed to query zero-result failed runs`, {
      projectId,
      message: noResultsError.message
    });
  } else if (noResultsFailedRuns?.length) {
    const { data: latestRun, error: latestRunError } = await service
      .from("scan_runs")
      .select("id, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestRunError) {
      console.error(`${RECONCILE_LOG_PREFIX} failed to query latest run for project`, {
        projectId,
        message: latestRunError.message
      });
    } else {
      for (const run of noResultsFailedRuns) {
        // Skip if a newer run already exists for this project — this failure
        // was already superseded (auto-retried or manually relaunched).
        if (latestRun && latestRun.id !== run.id && latestRun.created_at > run.created_at) {
          continue;
        }

        // This run is itself a `failed` row with a recoverable
        // error_summary, so exclude it from its own cap count — otherwise it
        // would always count against itself and never get a first retry.
        const recoverableFailureCount = await countRecentRecoverableFailures({
          projectId,
          service,
          excludeRunId: run.id
        });

        const capReached = recoverableFailureCount >= SCAN_TIMEOUT_AUTO_RETRY_CAP;

        // If an earlier pass in this same reconciliation call already
        // triggered the one allowed auto-retry, leave this row's
        // error_summary as-is (still the non-exhausted "Reintentando…"
        // value) rather than marking it exhausted — the freshly-created
        // pending run will make this row "superseded by a newer run" on the
        // next pass, so it will be skipped (not re-evaluated) then.
        if (capReached && autoRetryTriggered) {
          continue;
        }

        if (capReached) {
          const { error: updateError } = await service
            .from("scan_runs")
            .update({ error_summary: SCAN_NO_RESULTS_RETRY_EXHAUSTED_ERROR_SUMMARY })
            .eq("id", run.id)
            .eq("project_id", projectId)
            .eq("status", "failed");

          if (updateError) {
            console.error(`${RECONCILE_LOG_PREFIX} failed to mark zero-result run as retry-exhausted`, {
              projectId,
              runId: run.id,
              message: updateError.message
            });
            continue;
          }

          console.info(
            `${RECONCILE_LOG_PREFIX} zero-result run retry cap reached, marked retry-exhausted`,
            { projectId, runId: run.id }
          );

          // RECURRING-CADENCE-1 Fase B: su hermano de timeout (arriba) sí
          // avisaba al operador al agotar el reintento, y esta rama no. Mismo
          // estado terminal —un run fallido que no se va a reintentar solo— y
          // el mismo motivo para avisar; era un olvido, no una decisión
          // (`docs/brand/design-decisions-log.md` §193).
          await checkAndSendScanHealthAlert({
            service,
            projectId,
            runId: run.id as string,
            runFailedWithoutRetry: true
          });
          continue;
        }

        if (!autoRetryTriggered) {
          autoRetryTriggered = true;
          priorRecoverableFailureCount += 1;
          console.info(`${RECONCILE_LOG_PREFIX} auto-retrying zero-result run`, {
            projectId,
            runId: run.id
          });
          await attemptAutoRetry({ projectId, service, reason: SCAN_NO_RESULTS_ERROR_SUMMARY });
        }
      }
    }
  }

  return { reconciledCount };
}
