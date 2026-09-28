import "server-only";

import {
  RECONCILE_LOG_PREFIX,
  SCAN_RESUME_CAP,
  SCAN_RESUME_LOG_MESSAGE,
  SCAN_RESUME_MAX_RUN_AGE_HOURS
} from "@/lib/scan/constants";
import { scheduleScanContinuation } from "@/lib/scan/continuation";
import type { createServiceClient } from "@/lib/supabase/service";

/**
 * SCAN-RELAY-1 (`docs/brand/design-decisions-log.md` §228).
 *
 * A campaign advances one invocation at a time, each handing the next batch to
 * a fresh one (ADR 0014/0037). When one of those invocations dies before the
 * hand-off, nothing restarts the chain: the run just stops, and until this
 * phase `reconcileStuckScanRuns` then marked it `failed` and — at most once a
 * day — created a brand-new run from zero. Every answer the dead run had
 * already paid for was thrown away with it (30 prompts × 3 engines on
 * alberdiderma.es, six days in a row).
 *
 * Everything needed to carry on is already durable: prompt jobs are `pending`
 * or hold an expired lease, finalize is `pending` or leased, and results are
 * rows. So a stalled run is first resumed — re-dispatched where it stopped —
 * and only failed when that is not possible or has already been tried
 * SCAN_RESUME_CAP times.
 */

type Service = ReturnType<typeof createServiceClient>;

export type ResumeDecision = "resume" | "too_old" | "cap_reached" | "nothing_left";

/** Pure: whether a stalled run should be resumed rather than failed. */
export function decideResume(input: {
  runCreatedAt: string;
  now: number;
  priorResumes: number;
  jobs: ReadonlyArray<{ job_type: string; status: string }>;
}): ResumeDecision {
  if (input.now - Date.parse(input.runCreatedAt) > SCAN_RESUME_MAX_RUN_AGE_HOURS * 60 * 60 * 1000) {
    return "too_old";
  }
  if (input.priorResumes >= SCAN_RESUME_CAP) return "cap_reached";

  // Only work the executor can still claim: pending, or `running` with a
  // lease that — the run being stale — can only belong to a dead invocation.
  const hasWorkLeft = input.jobs.some(
    (job) =>
      (job.job_type === "scan_prompt" || job.job_type === "scan_finalize") &&
      (job.status === "pending" || job.status === "running")
  );
  return hasWorkLeft ? "resume" : "nothing_left";
}

/**
 * Resumes a stalled run if it can. Returns `true` when it did, in which case
 * the caller must NOT fail the run. Every failure path returns `false`, so a
 * resume that cannot be attempted degrades to exactly the pre-SCAN-RELAY-1
 * behavior (fail + auto-retry), never to a run left stuck.
 */
export async function tryResumeStalledRun(input: {
  service: Service;
  projectId: string;
  run: { id: string; created_at: string };
}): Promise<boolean> {
  const { service, projectId, run } = input;

  try {
    const [{ data: jobs, error: jobsError }, { count: priorResumes, error: logsError }] = await Promise.all([
      service.from("jobs").select("id, job_type, status").eq("project_id", projectId).eq("run_id", run.id),
      service
        .from("job_logs")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .eq("run_id", run.id)
        .eq("message", SCAN_RESUME_LOG_MESSAGE)
    ]);

    if (jobsError || logsError || !jobs) return false;

    const jobRows = jobs as Array<{ id: string; job_type: string; status: string }>;
    const decision = decideResume({
      runCreatedAt: run.created_at,
      now: Date.now(),
      priorResumes: priorResumes ?? 0,
      jobs: jobRows
    });

    if (decision !== "resume") {
      console.info(`${RECONCILE_LOG_PREFIX} stalled run not resumed (${decision})`, { projectId, runId: run.id });
      return false;
    }

    const anchor = jobRows.find((job) => job.job_type === "scan_finalize") ?? jobRows[0];

    // The marker goes first: it is the cap's counter, so a resume whose
    // dispatch then fails still counts, and a run that can never be resumed
    // successfully still reaches the cap and gets failed.
    const { error: markerError } = await service.from("job_logs").insert({
      job_id: anchor.id,
      project_id: projectId,
      run_id: run.id,
      level: "warn",
      message: SCAN_RESUME_LOG_MESSAGE,
      context_json: { resume_number: (priorResumes ?? 0) + 1 }
    });
    if (markerError) return false;

    // Bumps `updated_at` (DB trigger) so the next reconciliation pass — a page
    // view seconds later — sees a run that is advancing, not one to fail.
    await service
      .from("scan_runs")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", run.id)
      .eq("project_id", projectId)
      .in("status", ["pending", "running"]);

    await scheduleScanContinuation({ projectId, runId: run.id });

    console.info(`${RECONCILE_LOG_PREFIX} resumed stalled run`, {
      projectId,
      runId: run.id,
      resumeNumber: (priorResumes ?? 0) + 1
    });
    return true;
  } catch (error) {
    console.error(`${RECONCILE_LOG_PREFIX} resume attempt failed; falling back to failing the run`, {
      projectId,
      runId: run.id,
      message: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}
