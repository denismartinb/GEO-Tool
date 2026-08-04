import "server-only";

import { auditDomainCoverageCore } from "@/lib/recommendations/domain-coverage";
import { runTechnicalAuditCore } from "@/lib/web-audit/technical-audit";
import { isTerminalAuditFailure, type AuditFailureReason } from "@/lib/web-audit/audit-failure";
import {
  nextAuditJobState,
  retryWindowMinutes,
  WEB_AUDIT_JOB_TYPE,
  WEB_AUDIT_MAX_ATTEMPTS
} from "@/lib/web-audit/audit-job";
import { sendWebAuditFailedAlertEmail } from "@/lib/email/transactional";
import { type createServiceClient } from "@/lib/supabase/service";
import { type AuthenticatedContext } from "@/lib/scan/types";

/**
 * AUDIT-AFTER-SCAN-1 — the backend half: run the full web audit (coverage +
 * technical health) automatically after every completed scan, with retries,
 * and alert the operator when it gives up.
 *
 * Why this exists at all: the audit used to run ONLY from "Auditar ahora", a
 * foreground loop driven by the user's own browser tab. The product is moving
 * to fully automatic daily scans, where nobody is present when a run
 * finishes — so under the old design the flagship screen would simply never
 * refresh for the accounts that matter most. The founder's requirement was
 * explicit: hang it off the scan, in the backend, with real retries and an
 * alert email on definitive failure.
 *
 * ------------------------------------------------------------------------
 * Two different loops, deliberately not conflated
 * ------------------------------------------------------------------------
 *
 * 1. CONTINUATION — the coverage campaign is inherently multi-request
 *    (BATCH_TOPICS_PER_CALL topics per call, ~30s each, under a 60s function
 *    budget). Making progress but not finishing is NOT a failure, so it never
 *    touches `attempt_count`. The job goes back to 'pending', due immediately,
 *    and the next invocation picks up exactly where the campaign left off
 *    (the campaign's own resume-from-persisted-topics logic does the work).
 *
 * 2. RETRY — an actual error. This consumes `attempt_count` and schedules the
 *    documented backoff from audit-job.ts (1m → 5m → 25m → 2h → 10h).
 *
 * Conflating them would be a real bug: an 8-batch campaign would exhaust a
 * 6-attempt budget before ever finishing and would email the operator about a
 * failure that never happened.
 *
 * ------------------------------------------------------------------------
 * Why the `jobs` table and not fire-and-forget
 * ------------------------------------------------------------------------
 *
 * A lost `after()` dispatch must not mean a silently missing audit. Every
 * unit of work here is a durable row: if the fast-path dispatch never lands,
 * the row is still 'pending' and due, and the daily cron sweep picks it up.
 * That is the whole reason for the queue — the dispatch is an optimisation,
 * the row is the contract.
 *
 * ------------------------------------------------------------------------
 * Service role
 * ------------------------------------------------------------------------
 *
 * There is no user session on this path by construction, so both audit cores
 * are called with the service client. Ownership is NOT weakened: the cores
 * prove ownership with an explicit `.eq("owner_user_id", user.id)` filter
 * against the project's real owner (read from the project row here), and
 * every subsequent query is scoped to that same proven `projectId`. This is
 * a cron/background path, never reachable from a user request — same posture
 * as the existing daily scan sweep.
 */

const LOG_PREFIX = "[geo:audit-after-scan]";

/**
 * Wall-clock a single invocation will spend running batches before parking
 * the job for a continuation. Comfortably under the route's maxDuration=60
 * (ADR-0003): one coverage batch can take BATCH_TIME_BUDGET_MS (30s), so this
 * allows one batch to start late and still finish, plus room to write the row
 * back. A second batch is only started if there is genuinely time for it.
 */
export const INVOCATION_BUDGET_MS = 42_000;

/**
 * Latest point at which a new coverage batch may START, as a margin below the
 * invocation budget. A batch can run for BATCH_TIME_BUDGET_MS (30s) plus its
 * own Supabase writes, so anything starting later than this risks a platform
 * kill mid-batch — which would lose the row update, not just the batch, and
 * leave the job locked in 'running' until the stale-lock sweep. Continuing in
 * a fresh invocation costs one dispatch and loses nothing.
 */
const BATCH_START_MARGIN_MS = 32_000;

/**
 * Hard ceiling on continuations for one job, so a bug in the campaign's
 * "am I done?" logic can never produce an infinite self-dispatch chain.
 *
 * Sized for the largest plan: the Agency ceiling is 300 prompts, audited
 * BATCH_TOPICS_PER_CALL (4) at a time = 75 batches, and an invocation
 * realistically completes one batch. 120 leaves headroom without being
 * unbounded. Hitting it is a bug, not a capacity limit — it logs loudly and
 * fails the job so the alert email fires.
 */
export const MAX_AUDIT_CONTINUATIONS = 120;

/**
 * Ceiling on coverage batches per invocation, independent of the clock.
 *
 * The time cutoff alone is not a sufficient guard: a batch that returns
 * "running" quickly — because it audited zero topics, or because everything
 * it needed was cached — would spin this loop as fast as the event loop
 * allows until the cutoff, hammering Supabase for no gain. A count-based cap
 * bounds the loop even when every call is instant.
 */
const MAX_BATCHES_PER_INVOCATION = 4;

/** How many due jobs one sweep invocation will process. */
const SWEEP_BATCH_SIZE = 3;

/**
 * After this long, a job still marked 'running' is considered abandoned and
 * reclaimable.
 *
 * Without this the queue has a permanent leak: an invocation killed by the
 * platform mid-batch never gets to write the row back, so the job stays
 * 'running' with a stale `locked_by` — and a claim that only looks at
 * 'pending'/'retrying' would never touch it again. The audit would silently
 * never happen, which is the exact failure this phase exists to remove, just
 * moved one layer down.
 *
 * 10 minutes is comfortably above the route's own maxDuration=60 (ADR-0003),
 * so a healthy in-flight job is never stolen from itself. Migration 0001
 * already ships `jobs_locked_idx on (locked_at) where status in
 * ('running','retrying')` — the schema anticipated exactly this sweep.
 */
const STALE_LOCK_MS = 10 * 60_000;

/**
 * Hard backstop on how many times the worker route may self-dispatch in one
 * chain. Sits ABOVE the realistic need (a single 300-prompt campaign needs
 * ~75 continuations) and below anything that could look like a runaway. When
 * the chain ends with work still queued, the jobs stay 'pending' and due and
 * the daily sweep restarts the chain — nothing is lost, it is just slower.
 */
export const MAX_AUDIT_WORKER_CHAIN = 150;

type ServiceClient = ReturnType<typeof createServiceClient>;

export type WebAuditJobRow = {
  id: string;
  project_id: string;
  run_id: string;
  attempt_count: number;
  max_attempts: number;
  payload_json: Record<string, unknown>;
};

export type WebAuditJobOutcome =
  | { result: "completed" }
  /** Progress made, campaign unfinished — re-dispatch, no attempt consumed. */
  | { result: "continue"; continuations: number }
  | { result: "retrying"; attemptCount: number; nextAttemptAt: Date }
  | { result: "failed"; attemptCount: number; lastError: string }
  /** Terminal-but-not-an-error: archived project, plan downgrade, no prompts. */
  | { result: "cancelled"; reason: AuditFailureReason };

function readContinuations(payload: Record<string, unknown>): number {
  const raw = payload.continuations;
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0;
}

/**
 * Queue the post-scan audit for a run. Idempotent by design: a scan that is
 * re-finalized (a retried finalize job, a reconciliation) must not stack
 * duplicate audits that would double-spend Gemini calls on the same run.
 *
 * `jobs.run_id` is NOT NULL with an FK to `scan_runs`, so the job is
 * inherently tied to the run it audits — which is also exactly the dedupe
 * key we want.
 */
export async function enqueueWebAuditJob({
  service,
  projectId,
  runId
}: {
  service: ServiceClient;
  projectId: string;
  runId: string;
}): Promise<"enqueued" | "already_queued" | "error"> {
  try {
    const { data: existing } = await service
      .from("jobs")
      .select("id")
      .eq("project_id", projectId)
      .eq("run_id", runId)
      .eq("job_type", WEB_AUDIT_JOB_TYPE)
      .limit(1)
      .maybeSingle();

    // Any prior row for this run wins, whatever its status: a 'completed' one
    // means the audit already happened, and a 'failed' one already burned its
    // full retry budget and alerted. Re-queuing either would be noise.
    if (existing) return "already_queued";

    const { error } = await service.from("jobs").insert({
      project_id: projectId,
      run_id: runId,
      job_type: WEB_AUDIT_JOB_TYPE,
      status: "pending",
      max_attempts: WEB_AUDIT_MAX_ATTEMPTS,
      payload_json: { continuations: 0 }
    });

    if (error) {
      console.error(`${LOG_PREFIX} enqueue failed`, { projectId, runId, message: error.message });
      return "error";
    }
    return "enqueued";
  } catch (error) {
    console.error(`${LOG_PREFIX} enqueue threw`, {
      projectId,
      runId,
      message: error instanceof Error ? error.message : String(error)
    });
    return "error";
  }
}

/**
 * Atomically claim due jobs. Same optimistic-claim shape the scan executor
 * uses: flip the status to 'running' filtered on the status we expected to
 * see, and trust only the rows the UPDATE actually returned. Two concurrent
 * sweeps therefore cannot both run the same audit — the loser's UPDATE
 * matches zero rows.
 *
 * Claims two disjoint sets: jobs that are due ('pending'/'retrying' with
 * `next_attempt_at` in the past) and jobs abandoned mid-flight ('running'
 * with a `locked_at` older than STALE_LOCK_MS). Without the second, a single
 * platform kill leaks a job out of the queue permanently.
 */
export async function claimDueWebAuditJobs({
  service,
  now,
  limit = SWEEP_BATCH_SIZE
}: {
  service: ServiceClient;
  now: Date;
  limit?: number;
}): Promise<WebAuditJobRow[]> {
  const COLUMNS = "id, project_id, run_id, attempt_count, max_attempts, payload_json";
  const staleBefore = new Date(now.getTime() - STALE_LOCK_MS).toISOString();

  const [due, stale] = await Promise.all([
    service
      .from("jobs")
      .select(COLUMNS)
      .eq("job_type", WEB_AUDIT_JOB_TYPE)
      .in("status", ["pending", "retrying"])
      .lte("next_attempt_at", now.toISOString())
      .order("next_attempt_at", { ascending: true })
      .limit(limit),
    service
      .from("jobs")
      .select(COLUMNS)
      .eq("job_type", WEB_AUDIT_JOB_TYPE)
      .eq("status", "running")
      .lt("locked_at", staleBefore)
      .order("locked_at", { ascending: true })
      .limit(limit)
  ]);

  if (due.error) console.error(`${LOG_PREFIX} due-claim query failed`, { message: due.error.message });
  if (stale.error) console.error(`${LOG_PREFIX} stale-claim query failed`, { message: stale.error.message });

  const candidates: Array<WebAuditJobRow & { claimFrom: string[] }> = [
    ...((due.data ?? []) as WebAuditJobRow[]).map((j) => ({ ...j, claimFrom: ["pending", "retrying"] })),
    ...((stale.data ?? []) as WebAuditJobRow[]).map((j) => ({ ...j, claimFrom: ["running"] }))
  ].slice(0, limit);

  const claimed: WebAuditJobRow[] = [];
  for (const { claimFrom, ...candidate } of candidates) {
    // For a stale reclaim, `locked_at` must ALSO still be old at UPDATE time:
    // between the SELECT and here, the original owner could have come back to
    // life and re-locked it. Filtering on the status alone would then steal a
    // job that is legitimately running.
    let update = service
      .from("jobs")
      .update({ status: "running", locked_at: now.toISOString(), locked_by: "web-audit-runner" })
      .eq("id", candidate.id)
      .eq("project_id", candidate.project_id)
      .in("status", claimFrom);

    if (claimFrom[0] === "running") {
      update = update.lt("locked_at", staleBefore);
      console.warn(`${LOG_PREFIX} reclaiming abandoned job`, {
        projectId: candidate.project_id,
        runId: candidate.run_id
      });
    }

    const { data: won } = await update.select("id").maybeSingle();
    if (won) claimed.push(candidate);
  }

  return claimed;
}

/**
 * Resolve the project's real owner and domain. The owner id is what the audit
 * cores use to prove ownership, so it is read from the database here and
 * never passed in from a caller.
 */
async function loadProjectContext(
  service: ServiceClient,
  projectId: string
): Promise<{ ownerUserId: string; domain: string } | null> {
  const { data } = await service
    .from("projects")
    .select("owner_user_id, domain")
    .eq("id", projectId)
    .maybeSingle();

  const row = data as { owner_user_id: string; domain: string } | null;
  return row ? { ownerUserId: row.owner_user_id, domain: row.domain } : null;
}

/**
 * Run one claimed job for as long as this invocation's budget allows.
 *
 * Order is coverage first, then technical health: coverage is the expensive,
 * chained, Gemini-backed half, and the technical audit's own candidate
 * selection reads the coverage map. Running technical first would audit the
 * previous campaign's pages.
 */
export async function runWebAuditJob({
  service,
  job,
  now = new Date(),
  budgetMs = INVOCATION_BUDGET_MS
}: {
  service: ServiceClient;
  job: WebAuditJobRow;
  now?: Date;
  budgetMs?: number;
}): Promise<WebAuditJobOutcome> {
  const startedAt = Date.now();
  const batchStartCutoffMs = Math.max(0, budgetMs - BATCH_START_MARGIN_MS);
  const continuations = readContinuations(job.payload_json);

  if (continuations >= MAX_AUDIT_CONTINUATIONS) {
    // A campaign that never reports "completed" is a bug in the campaign, not
    // a capacity problem — treat it as a hard failure so it is alerted, not
    // retried forever.
    console.error(`${LOG_PREFIX} continuation cap hit`, {
      projectId: job.project_id,
      runId: job.run_id,
      continuations
    });
    return finishFailed(service, job, `continuation cap (${MAX_AUDIT_CONTINUATIONS}) reached`, now);
  }

  const project = await loadProjectContext(service, job.project_id);
  if (!project) {
    return finishCancelled(service, job, "project_not_found");
  }

  // The service client stands in for the user-context client here; see the
  // "Service role" note in this file's header for why that does not weaken
  // ownership. `user` is narrowed to `{ id }` by both cores.
  const asUser = { id: project.ownerUserId } as AuthenticatedContext["user"];
  const coreArgs = {
    projectId: job.project_id,
    supabase: service as unknown as AuthenticatedContext["supabase"],
    service,
    user: asUser,
    trigger: "automatic" as const
  };

  try {
    // --- Coverage campaign (chained batches) -----------------------------
    //
    // A do/while, not a while: one batch always runs. A budget smaller than
    // the start margin would otherwise park the job without doing anything,
    // and the chain would dispatch forever achieving nothing until the
    // continuation cap stopped it.
    let coverageDone = false;
    let batches = 0;
    let topicsBefore = -1;

    do {
      const coverage = await auditDomainCoverageCore(coreArgs);
      batches += 1;

      if (!coverage.success) {
        if (isTerminalAuditFailure(coverage.reason)) {
          return finishCancelled(service, job, coverage.reason);
        }
        return finishAttempt(service, job, `coverage: ${coverage.reason}`, now);
      }

      if (coverage.status === "completed") {
        coverageDone = true;
        break;
      }

      // No new topic covered means this batch achieved nothing; looping again
      // in the same invocation would just repeat it. Park instead — the
      // continuation cap then bounds how long a genuinely stuck campaign can
      // keep re-dispatching.
      const topicsAfter = coverage.coverage.topics.length;
      if (topicsAfter <= topicsBefore) break;
      topicsBefore = topicsAfter;
    } while (batches < MAX_BATCHES_PER_INVOCATION && Date.now() - startedAt < batchStartCutoffMs);

    if (!coverageDone) {
      return finishContinuation(service, job, continuations + 1, now);
    }

    // --- Technical health (single call, own 25s budget) -------------------
    const technical = await runTechnicalAuditCore(coreArgs);

    if (!technical.success) {
      if (isTerminalAuditFailure(technical.reason)) {
        return finishCancelled(service, job, technical.reason);
      }
      return finishAttempt(service, job, `technical: ${technical.reason}`, now);
    }

    await service
      .from("jobs")
      .update({ status: "completed", locked_at: null, locked_by: null, last_error: null })
      .eq("id", job.id)
      .eq("project_id", job.project_id);

    console.info(`${LOG_PREFIX} completed`, {
      projectId: job.project_id,
      runId: job.run_id,
      continuations
    });
    return { result: "completed" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${LOG_PREFIX} threw`, { projectId: job.project_id, runId: job.run_id, message });
    return finishAttempt(service, job, message.slice(0, 500), now);
  }
}

/** Park the job for another invocation. Not a failure — no attempt consumed. */
async function finishContinuation(
  service: ServiceClient,
  job: WebAuditJobRow,
  continuations: number,
  now: Date
): Promise<WebAuditJobOutcome> {
  await service
    .from("jobs")
    .update({
      status: "pending",
      locked_at: null,
      locked_by: null,
      next_attempt_at: now.toISOString(),
      payload_json: { ...job.payload_json, continuations }
    })
    .eq("id", job.id)
    .eq("project_id", job.project_id);

  return { result: "continue", continuations };
}

/** A real error: consume an attempt and apply the documented backoff. */
async function finishAttempt(
  service: ServiceClient,
  job: WebAuditJobRow,
  error: string,
  now: Date
): Promise<WebAuditJobOutcome> {
  const state = nextAuditJobState({
    previousAttemptCount: job.attempt_count,
    maxAttempts: job.max_attempts,
    error,
    now
  });

  if (state.status === "retrying") {
    await service
      .from("jobs")
      .update({
        status: "retrying",
        attempt_count: state.attemptCount,
        next_attempt_at: state.nextAttemptAt.toISOString(),
        last_error: error,
        locked_at: null,
        locked_by: null
      })
      .eq("id", job.id)
      .eq("project_id", job.project_id);

    return { result: "retrying", attemptCount: state.attemptCount, nextAttemptAt: state.nextAttemptAt };
  }

  if (state.status === "failed") {
    return finishFailed(service, job, error, now, state.attemptCount);
  }

  // Unreachable: nextAuditJobState only returns "completed" for a null error.
  return { result: "completed" };
}

/** Retry budget exhausted: mark failed and alert the operator. */
async function finishFailed(
  service: ServiceClient,
  job: WebAuditJobRow,
  error: string,
  now: Date,
  attemptCount: number = job.attempt_count + 1
): Promise<WebAuditJobOutcome> {
  await service
    .from("jobs")
    .update({
      status: "failed",
      attempt_count: attemptCount,
      last_error: error,
      locked_at: null,
      locked_by: null
    })
    .eq("id", job.id)
    .eq("project_id", job.project_id);

  console.error(`${LOG_PREFIX} gave up`, {
    projectId: job.project_id,
    runId: job.run_id,
    attemptCount,
    error
  });

  // The alert is the founder's explicit requirement ("en caso de que falle,
  // que se me envíe un email de alerta"). It goes to the operator address,
  // not the customer: an automatic audit the user never asked for should not
  // send them mail about backend trouble they cannot act on.
  const project = await loadProjectContext(service, job.project_id);
  await sendWebAuditFailedAlertEmail({
    domain: project?.domain ?? job.project_id,
    projectId: job.project_id,
    runId: job.run_id,
    attempts: attemptCount,
    windowMinutes: retryWindowMinutes(job.max_attempts),
    lastError: error,
    failedAt: now
  });

  return { result: "failed", attemptCount, lastError: error };
}

/** Terminal but expected. No alert — nothing is broken. */
async function finishCancelled(
  service: ServiceClient,
  job: WebAuditJobRow,
  reason: AuditFailureReason
): Promise<WebAuditJobOutcome> {
  await service
    .from("jobs")
    .update({
      status: "cancelled",
      last_error: reason,
      locked_at: null,
      locked_by: null
    })
    .eq("id", job.id)
    .eq("project_id", job.project_id);

  console.info(`${LOG_PREFIX} cancelled`, { projectId: job.project_id, runId: job.run_id, reason });
  return { result: "cancelled", reason };
}

/**
 * Claim and run every due audit job this invocation can afford. Shared by the
 * `after()` fast path (`/api/cron/run-audit`) and the daily sweep safety net.
 *
 * Returns whether at least one job still has work queued, so the caller can
 * decide to chain another invocation.
 */
export async function processDueWebAuditJobs({
  service,
  now = new Date(),
  limit = SWEEP_BATCH_SIZE
}: {
  service: ServiceClient;
  now?: Date;
  limit?: number;
}): Promise<{ processed: number; outcomes: WebAuditJobOutcome[]; hasMoreWork: boolean }> {
  const jobs = await claimDueWebAuditJobs({ service, now, limit });
  const outcomes: WebAuditJobOutcome[] = [];

  for (const job of jobs) {
    outcomes.push(await runWebAuditJob({ service, job, now }));
  }

  return {
    processed: jobs.length,
    outcomes,
    // Two independent reasons to chain another invocation: a campaign parked
    // mid-flight, or a claim that filled the batch limit (there may be more
    // due jobs behind it). Without the second, the daily-sweep safety net
    // would drain a backlog at `limit` jobs PER DAY.
    hasMoreWork: outcomes.some((o) => o.result === "continue") || jobs.length >= limit
  };
}
