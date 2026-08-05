import "server-only";

import { auditDomainCoverageCore } from "@/lib/recommendations/domain-coverage";
import { runTechnicalAuditCore, TECH_AUDIT_TOTAL_BUDGET_MS } from "@/lib/web-audit/technical-audit";
import { REGRESSION_ALERTS_BUDGET_MS } from "@/lib/web-audit/regression-alerts";
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
 * Wall-clock the whole sweep may spend, shared across every job it runs.
 *
 * This is NOT the same as INVOCATION_BUDGET_MS, and conflating them was a real
 * bug: each job measured its budget from its own start, so a sweep that
 * claimed SWEEP_BATCH_SIZE jobs could spend 3 × 42s inside a route whose
 * maxDuration is 60 (ADR-0003). The platform kill then landed on the exact
 * path the queue exists to protect — the daily safety net, which is by
 * definition the invocation that finds a backlog — leaving the unrun jobs
 * claimed in 'running' for the full STALE_LOCK_MS and killing the self-chain
 * before it could be dispatched. A backlog would have drained at roughly one
 * audit per DAY, silently.
 */
export const SWEEP_BUDGET_MS = 45_000;

/**
 * Least remaining wall-clock worth claiming another job with: enough for one
 * full coverage batch (BATCH_TIME_BUDGET_MS = 30s) plus its write-back. Below
 * this the sweep stops instead of claiming a job it cannot run — a claim it
 * cannot honour is strictly worse than not claiming, because the job is then
 * locked out of the queue for STALE_LOCK_MS.
 */
const MIN_JOB_BUDGET_MS = 34_000;

/**
 * Wall-clock kept in reserve for the technical audit once coverage is done.
 * Sized off TECH_AUDIT_TOTAL_BUDGET_MS plus room for the persist. If what is
 * left is under this, the job parks as a continuation instead: coverage is
 * already persisted, so re-entering costs one cached (near-instant) coverage
 * call and the technical audit runs on a fresh clock. Starting it anyway
 * would gamble on a platform kill mid-fetch — which loses the row update, not
 * just the audit.
 *
 * WEB-AUDIT-ALERTS-1 widened this by REGRESSION_ALERTS_BUDGET_MS, and that
 * adjustment is the point rather than an afterthought: the technical core now
 * ends with the regression comparison and its emits, so the reserve has to
 * cover the whole tail of that call. `.claude/rules/web-audit.md` names this
 * exact failure — a phase that adds per-job work and raises only the batch
 * limit leaves the last step running past `maxDuration`, which loses the row
 * update rather than just the step.
 *
 * MIN_JOB_BUDGET_MS was re-checked against this and deliberately left alone:
 * it sizes the smallest claim worth making (one coverage batch + write-back),
 * and a job claimed with that little simply never starts the technical audit
 * — the reserve check below parks it as a continuation instead.
 */
const TECHNICAL_RESERVE_MS = TECH_AUDIT_TOTAL_BUDGET_MS + REGRESSION_ALERTS_BUDGET_MS + 2_000;

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
 *
 * DOMAINS-REDESIGN-1: this is also where the per-project opt-out
 * (`projects.auto_web_audit_enabled`, migration 0030) is enforced, and that
 * placement is deliberate rather than convenient. Two paths enqueue audits —
 * the executor's inline call after a run completes, and
 * `backfillMissingWebAuditJobs` on the daily cron — so a check at the executor
 * alone would be undone hours later by the backfill queueing the very audit the
 * founder had switched off. Gating the single function both go through makes
 * that impossible, and makes a future third caller safe by construction.
 *
 * The check costs one indexed read per call. The backfill calls this in a loop
 * bounded to `BACKFILL_LIMIT`, so the worst case is ten tiny reads on a daily
 * cron — cheaper than the alternative of duplicating the gate in two places and
 * keeping them in sync.
 */
export async function enqueueWebAuditJob({
  service,
  projectId,
  runId
}: {
  service: ServiceClient;
  projectId: string;
  runId: string;
}): Promise<"enqueued" | "already_queued" | "disabled" | "error"> {
  try {
    // Read the flag before the dedupe query: when a project has audits off,
    // this returns without touching `jobs` at all.
    const { data: projectRow, error: projectError } = await service
      .from("projects")
      .select("auto_web_audit_enabled")
      .eq("id", projectId)
      .maybeSingle();

    // Fail OPEN, on purpose. A read failure here must not silently stop audits
    // for every project — the same reasoning as `isAutoWebAuditEnabled`
    // defaulting to on. A missing column (migration 0030 not yet applied) and a
    // transient error are indistinguishable at this layer, and of the two
    // possible mistakes, "audited something the founder had switched off" costs
    // one Gemini campaign while "stopped auditing everything" is invisible.
    if (!projectError && projectRow && projectRow.auto_web_audit_enabled === false) {
      return "disabled";
    }

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
 * How far back the backfill looks for completed runs that never got a job.
 *
 * A day is generous on purpose: the point is to survive an outage or a bad
 * deploy window, not just a single unlucky invocation. Auditing a run that
 * finished 20 hours ago is still worth more than never auditing it.
 */
export const BACKFILL_LOOKBACK_MS = 24 * 60 * 60_000;

/**
 * A run must have been finished at least this long to be backfilled.
 *
 * Without it the backfill races the normal path: the executor marks the run
 * completed and inserts the job milliseconds later, and a sweep landing in
 * between would insert a second one (the dedupe is a SELECT-then-INSERT, not
 * a constraint). Five minutes is far longer than that window and far shorter
 * than the daily cron.
 */
export const BACKFILL_GRACE_MS = 5 * 60_000;

/** Runs enqueued per backfill pass. Bounds the cost of a large recovery. */
const BACKFILL_LIMIT = 10;

/**
 * Enqueue audits for completed runs that never got one.
 *
 * The gap this closes, found in production on 2026-08-04: the inline enqueue
 * lives in the SAME invocation that has just marked the run `completed`, three
 * lines earlier. If that invocation dies in between — platform timeout, or an
 * instance recycled by a deploy landing at that moment, both observed — there
 * is no row, no log and no catch. And with no row, nothing ever looks at that
 * run again: the sweep only walks `jobs`, so the audit is lost permanently.
 *
 * That made a lie of the phase's own claim that "the row is the contract, the
 * dispatch is an optimisation". It is only a contract once the row exists;
 * before that there was nothing. This reconciles against `scan_runs` instead,
 * so the durable record of "a scan finished" is what drives the audit, not the
 * liveness of one serverless invocation.
 *
 * Deliberately not filtered by plan: `runWebAuditJob` cancels a non-Pro job on
 * its first cheap query, before any Gemini call, and duplicating the plan gate
 * here would mean two places to keep in sync for no saving.
 *
 * ------------------------------------------------------------------------
 * Only the newest run of each project, and that is not an optimisation
 * ------------------------------------------------------------------------
 *
 * Both audit cores derive their target themselves — `the latest completed run
 * of THIS project` — and ignore the `run_id` on the job, which is only a
 * dedupe key. So a job naming an older run does NOT audit that run: it audits
 * the newest one, again.
 *
 * The first version of this function backfilled every uncovered run in the
 * window, which on the first production sweep queued nine jobs for one
 * project — nine jobs that would all have audited the same run, while the
 * Escaneos table showed nine historical rows as "En curso" for work that
 * could never produce an audit of their own (caught by reading the pilot's
 * own capture of PR #333, not by any assertion).
 *
 * Restricting to the newest run per project makes the backfill mean what it
 * says, and still covers the case it exists for: an enqueue lost by a dying
 * invocation, recovered on the next sweep.
 */
export async function backfillMissingWebAuditJobs({
  service,
  now = new Date(),
  limit = BACKFILL_LIMIT
}: {
  service: ServiceClient;
  now?: Date;
  limit?: number;
}): Promise<number> {
  try {
    const since = new Date(now.getTime() - BACKFILL_LOOKBACK_MS).toISOString();
    const until = new Date(now.getTime() - BACKFILL_GRACE_MS).toISOString();

    // Over-fetch: most recent runs already have a job, and filtering happens
    // below. Bounded so a busy day cannot turn this into an unbounded scan.
    const { data: runRows, error: runsError } = await service
      .from("scan_runs")
      .select("id, project_id")
      .eq("status", "completed")
      .gte("finished_at", since)
      .lte("finished_at", until)
      .order("finished_at", { ascending: false })
      .limit(limit * 10);

    if (runsError) {
      console.error(`${LOG_PREFIX} backfill query failed`, { message: runsError.message });
      return 0;
    }

    const ordered = (runRows ?? []) as Array<{ id: string; project_id: string }>;
    if (ordered.length === 0) return 0;

    // Newest-first ordering above means the first row seen for a project IS
    // its newest completed run in the window. See the header: an older run's
    // job would audit the newest run anyway, so queueing one is meaningless.
    const newestByProject = new Map<string, { id: string; project_id: string }>();
    for (const run of ordered) {
      if (!newestByProject.has(run.project_id)) newestByProject.set(run.project_id, run);
    }
    const runs = [...newestByProject.values()];

    // One query for every candidate rather than one per run: this path runs on
    // every worker invocation, so it has to stay cheap when there is nothing
    // to do — which is the normal case.
    const { data: existingRows } = await service
      .from("jobs")
      .select("run_id")
      .eq("job_type", WEB_AUDIT_JOB_TYPE)
      .in(
        "run_id",
        runs.map((r) => r.id)
      );

    const alreadyQueued = new Set(((existingRows ?? []) as Array<{ run_id: string }>).map((r) => r.run_id));
    const missing = runs.filter((r) => !alreadyQueued.has(r.id)).slice(0, limit);

    let enqueued = 0;
    for (const run of missing) {
      const result = await enqueueWebAuditJob({ service, projectId: run.project_id, runId: run.id });
      if (result === "enqueued") {
        enqueued += 1;
        console.warn(`${LOG_PREFIX} backfilled a run whose audit was never queued`, {
          projectId: run.project_id,
          runId: run.id
        });
      }
    }

    return enqueued;
  } catch (error) {
    // Never let recovery break the thing it is recovering: the due-job sweep
    // must still run even if this pass throws.
    console.error(`${LOG_PREFIX} backfill threw`, {
      message: error instanceof Error ? error.message : String(error)
    });
    return 0;
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
    const isStaleReclaim = claimFrom[0] === "running";

    // A reclaim CONSUMES an attempt, and that is not a detail.
    //
    // The ordered finishers (finishAttempt/finishContinuation) are the only
    // other places attempt_count moves, and an invocation killed mid-batch
    // never reaches them. So without this, a job the platform kills
    // systematically is re-claimed every STALE_LOCK_MS forever: real Gemini
    // calls burned on every cycle, attempt_count frozen below max_attempts,
    // finishFailed never reached and therefore the alert email NEVER sent.
    // That is precisely the failure this phase exists to remove — silent,
    // unbounded, unreported — just moved one layer down (data-guardian R1).
    //
    // Charging the attempt here means a job that cannot survive an invocation
    // exhausts its budget like any other failure and alerts the operator:
    // runWebAuditJob refuses a job already at its ceiling and fails it.
    const patch: Record<string, unknown> = {
      status: "running",
      locked_at: now.toISOString(),
      locked_by: "web-audit-runner"
    };
    if (isStaleReclaim) patch.attempt_count = candidate.attempt_count + 1;

    // For a stale reclaim, `locked_at` must ALSO still be old at UPDATE time:
    // between the SELECT and here, the original owner could have come back to
    // life and re-locked it. Filtering on the status alone would then steal a
    // job that is legitimately running.
    let update = service
      .from("jobs")
      .update(patch)
      .eq("id", candidate.id)
      .eq("project_id", candidate.project_id)
      .in("status", claimFrom);

    if (isStaleReclaim) {
      update = update.lt("locked_at", staleBefore);
      console.warn(`${LOG_PREFIX} reclaiming abandoned job`, {
        projectId: candidate.project_id,
        runId: candidate.run_id,
        attemptCount: candidate.attempt_count + 1
      });
    }

    const { data: won } = await update.select("id").maybeSingle();
    // Hand back the attempt_count that actually landed in the row, so the
    // runner's exhaustion check sees the truth rather than the pre-claim value.
    if (won) claimed.push(isStaleReclaim ? { ...candidate, attempt_count: candidate.attempt_count + 1 } : candidate);
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

  // Budget already spent — only reachable via a stale reclaim, which charges
  // an attempt (see claimDueWebAuditJobs). Failing here is what turns "the
  // platform keeps killing this job" into an alert instead of an invisible
  // loop. Runs BEFORE any Gemini call, so an exhausted job costs nothing.
  if (job.attempt_count >= job.max_attempts) {
    console.error(`${LOG_PREFIX} retry budget exhausted by repeated abandonment`, {
      projectId: job.project_id,
      runId: job.run_id,
      attemptCount: job.attempt_count
    });
    return finishFailed(
      service,
      job,
      "abandoned_repeatedly",
      now,
      job.attempt_count,
      `the invocation running this job was killed before it could write back, ${job.attempt_count} times`
    );
  }

  if (continuations >= MAX_AUDIT_CONTINUATIONS) {
    // A campaign that never reports "completed" is a bug in the campaign, not
    // a capacity problem — treat it as a hard failure so it is alerted, not
    // retried forever.
    console.error(`${LOG_PREFIX} continuation cap hit`, {
      projectId: job.project_id,
      runId: job.run_id,
      continuations
    });
    return finishFailed(service, job, "continuation_cap_reached", now, undefined, `cap is ${MAX_AUDIT_CONTINUATIONS}`);
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
    //
    // Only if it genuinely fits. Coverage is already durable at this point,
    // so parking here loses nothing: the next invocation's coverage call is a
    // cache hit and the technical audit gets a full clock.
    if (Date.now() - startedAt > budgetMs - TECHNICAL_RESERVE_MS) {
      return finishContinuation(service, job, continuations + 1, now);
    }

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
    // Stable code in the row, raw text only to the log and the operator: the
    // owner can read `last_error` through RLS (data-guardian R2).
    return finishAttempt(service, job, "unexpected_error", now, message.slice(0, 500));
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

/**
 * A real error: consume an attempt and apply the documented backoff.
 *
 * `code` is a stable identifier, never raw error text. `jobs` carries RLS
 * `jobs_select_owner`, so the project owner can read `last_error` straight
 * out of PostgREST — the same reason the scan executor only ever writes
 * `getSanitizedScanError` output there. `detail` carries the raw text to the
 * places that are not user-readable: the server log and the operator email
 * (data-guardian R2).
 */
async function finishAttempt(
  service: ServiceClient,
  job: WebAuditJobRow,
  code: string,
  now: Date,
  detail?: string
): Promise<WebAuditJobOutcome> {
  const error = code;
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
    return finishFailed(service, job, error, now, state.attemptCount, detail);
  }

  // Unreachable: nextAuditJobState only returns "completed" for a null error.
  return { result: "completed" };
}

/**
 * Retry budget exhausted: mark failed and alert the operator.
 *
 * Same split as finishAttempt — `code` is what lands in the owner-readable
 * `last_error`; `detail` is raw and only reaches the log and the operator.
 */
async function finishFailed(
  service: ServiceClient,
  job: WebAuditJobRow,
  code: string,
  now: Date,
  attemptCount: number = job.attempt_count + 1,
  detail?: string
): Promise<WebAuditJobOutcome> {
  await service
    .from("jobs")
    .update({
      status: "failed",
      attempt_count: attemptCount,
      last_error: code,
      locked_at: null,
      locked_by: null
    })
    .eq("id", job.id)
    .eq("project_id", job.project_id);

  console.error(`${LOG_PREFIX} gave up`, {
    projectId: job.project_id,
    runId: job.run_id,
    attemptCount,
    code,
    detail
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
    // The operator gets the full picture; the owner-readable row gets the code.
    lastError: detail ? `${code}: ${detail}` : code,
    failedAt: now
  });

  return { result: "failed", attemptCount, lastError: code };
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
  limit = SWEEP_BATCH_SIZE,
  budgetMs = SWEEP_BUDGET_MS
}: {
  service: ServiceClient;
  now?: Date;
  limit?: number;
  budgetMs?: number;
}): Promise<{ processed: number; outcomes: WebAuditJobOutcome[]; hasMoreWork: boolean }> {
  const startedAt = Date.now();
  const outcomes: WebAuditJobOutcome[] = [];
  let outOfBudget = false;

  // One job claimed at a time, deliberately. Claiming the whole batch up
  // front and then discovering there is no time left to run it would leave
  // the surplus locked in 'running' until the stale-lock sweep — see
  // SWEEP_BUDGET_MS. A job is only ever claimed once it is certain it can be
  // run now.
  while (outcomes.length < limit) {
    const remainingMs = budgetMs - (Date.now() - startedAt);
    if (remainingMs < MIN_JOB_BUDGET_MS) {
      outOfBudget = true;
      break;
    }

    const [job] = await claimDueWebAuditJobs({ service, now, limit: 1 });
    if (!job) break;

    outcomes.push(
      await runWebAuditJob({ service, job, now, budgetMs: Math.min(INVOCATION_BUDGET_MS, remainingMs) })
    );
  }

  return {
    processed: outcomes.length,
    outcomes,
    // Three independent reasons to chain another invocation: a campaign
    // parked mid-flight, a run that filled the batch limit, or a budget that
    // ran out before the queue did. Without the last two, the daily-sweep
    // safety net would drain a backlog at `limit` jobs PER DAY. When the
    // queue is in fact empty the chained invocation simply finds nothing and
    // stops — one wasted call is the right price for never stranding work.
    hasMoreWork: outcomes.some((o) => o.result === "continue") || outcomes.length >= limit || outOfBudget
  };
}
