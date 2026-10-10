import "server-only";

import {
  FINALIZE_LOCK_LEASE_MS,
  PROMPT_LOCK_LEASE_MS,
  SCAN_RESUME_MAX_RUN_AGE_HOURS
} from "@/lib/scan/constants";
import { scheduleScanContinuation } from "@/lib/scan/continuation";
import type { createServiceClient } from "@/lib/supabase/service";

/**
 * SCAN-CRON-DRAIN-1 (`docs/brand/design-decisions-log.md` §262).
 *
 * A campaign advances by self-calls to `/api/scan/continue`, one invocation
 * handing the next batch to a fresh one (ADR 0014/0037). Vercel cuts a chain
 * of self-calls with 508 after a few hops even when the URL is right (log
 * §261): on 2026-10-10 the 06:00 sweep's chain died at about the fifth hop
 * and the run sat still until the watchdog resumed it eleven minutes later.
 * The watchdog only resumes SCAN_RESUME_CAP times, so a project that needs
 * more hops than (cap + 1) chains can carry would fail with work left.
 *
 * This pass is the engine the chain cannot be: every 5 minutes
 * (`/api/cron/scan-continue`) a cron firing — which always starts a fresh
 * chain — re-dispatches every young run that stopped advancing and still has
 * work the executor can claim. It writes nothing. It does not count against
 * the resume cap, bump `updated_at` or touch a job: if its dispatch makes
 * progress the executor bumps `updated_at` as it always does; if it does
 * not, the run stays stale and the watchdog's resume/fail path sees exactly
 * what it saw before this pass existed. A double dispatch (this pass plus a
 * live chain, or plus the watchdog) is safe because batch claims are atomic.
 */

type Service = ReturnType<typeof createServiceClient>;

/**
 * A run whose `updated_at` moved within this window is being driven right
 * now, and any job it leased is still inside its lease. Matches the job
 * leases, so by the time a run qualifies its dead invocation's claims are
 * reclaimable.
 */
export const SCAN_DRAIN_IDLE_MS = Math.max(PROMPT_LOCK_LEASE_MS, FINALIZE_LOCK_LEASE_MS);

/**
 * Runs re-dispatched per pass, oldest-idle first. Not a cap on work: a run
 * past it stays eligible and is picked up by the next firing five minutes
 * later. It bounds how many campaigns one firing starts on the providers at
 * once (`.claude/rules/scan.md`, "Never dispatch a whole batch on the same
 * tick").
 */
export const SCAN_DRAIN_MAX_RUNS_PER_PASS = 5;

export type DrainRun = { id: string; project_id: string; created_at: string; updated_at: string };
export type DrainJob = { run_id: string; job_type: string; status: string; locked_at: string | null };

/** Whether the executor could claim this job if it were dispatched now. */
export function isClaimableJob(job: DrainJob, now: number): boolean {
  const lease =
    job.job_type === "scan_prompt" ? PROMPT_LOCK_LEASE_MS : job.job_type === "scan_finalize" ? FINALIZE_LOCK_LEASE_MS : null;
  if (lease === null) return false;
  if (job.status === "pending") return true;
  return job.status === "running" && Boolean(job.locked_at) && Date.parse(String(job.locked_at)) < now - lease;
}

/** Pure: which stalled runs this pass re-dispatches, oldest-idle first. */
export function selectRunsToContinue(input: {
  runs: readonly DrainRun[];
  jobs: readonly DrainJob[];
  now: number;
}): DrainRun[] {
  const maxAgeMs = SCAN_RESUME_MAX_RUN_AGE_HOURS * 60 * 60 * 1000;
  const withWork = new Set(input.jobs.filter((job) => isClaimableJob(job, input.now)).map((job) => job.run_id));

  return input.runs
    .filter((run) => input.now - Date.parse(run.created_at) <= maxAgeMs)
    .filter((run) => input.now - Date.parse(run.updated_at) >= SCAN_DRAIN_IDLE_MS)
    .filter((run) => withWork.has(run.id))
    .sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at))
    .slice(0, SCAN_DRAIN_MAX_RUNS_PER_PASS);
}

export async function runScanDrain({
  service,
  now = Date.now()
}: {
  service: Service;
  now?: number;
}): Promise<{ candidates: number; dispatched: number }> {
  const createdAfterIso = new Date(now - SCAN_RESUME_MAX_RUN_AGE_HOURS * 60 * 60 * 1000).toISOString();
  const idleBeforeIso = new Date(now - SCAN_DRAIN_IDLE_MS).toISOString();

  const { data: runs, error: runsError } = await service
    .from("scan_runs")
    .select("id, project_id, created_at, updated_at")
    .in("status", ["pending", "running"])
    .gte("created_at", createdAfterIso)
    .lt("updated_at", idleBeforeIso);

  if (runsError) throw new Error("scan_drain_runs_read_failed");
  const runRows = (runs ?? []) as DrainRun[];
  if (runRows.length === 0) return { candidates: 0, dispatched: 0 };

  const { data: jobs, error: jobsError } = await service
    .from("jobs")
    .select("run_id, job_type, status, locked_at")
    .in(
      "run_id",
      runRows.map((run) => run.id)
    )
    .in("job_type", ["scan_prompt", "scan_finalize"])
    .in("status", ["pending", "running"]);

  if (jobsError) throw new Error("scan_drain_jobs_read_failed");

  const selected = selectRunsToContinue({ runs: runRows, jobs: (jobs ?? []) as DrainJob[], now });

  for (const run of selected) {
    await scheduleScanContinuation({ projectId: run.project_id, runId: run.id });
    console.info("[geo:scan:drain] re-dispatched stalled run", {
      projectId: run.project_id,
      runId: run.id,
      idleSeconds: Math.round((now - Date.parse(run.updated_at)) / 1000)
    });
  }

  return { candidates: runRows.length, dispatched: selected.length };
}
