import "server-only";

import { after } from "next/server";
import { resolvePlan } from "@/lib/billing";
import { createPendingScanRunForCron } from "@/lib/scan/run-creation";
import { canStartAnotherSweepBatch } from "@/lib/scan/drive-budget";
import { executePendingScan, getSiteUrl } from "@/lib/scan/executor";
import { ProjectActionError } from "@/lib/scan/types";
import type { createServiceClient } from "@/lib/supabase/service";
import { serverEnv } from "@/lib/env";

const DAY_MS = 24 * 60 * 60 * 1000;
const FAILURE_STREAK_LIMIT = 3;
const DEFAULT_MAX_PROJECTS_PER_RUN = 5;

/**
 * Hard cap on how many chained sweep invocations a single daily cron firing
 * can produce (ASYNC-SCAN-1a, docs/adr/0016). Bounds the sweep's total work
 * per firing to `MAX_SWEEP_CHAIN_INVOCATIONS × MAX_PROJECTS_PER_CRON_RUN`
 * projects even if the convergence guarantees below were ever violated —
 * with the once-daily Hobby cron that is also the daily bound.
 */
const DEFAULT_MAX_SWEEP_CHAIN_INVOCATIONS = 20;

/**
 * PRELAUNCH-HARDENING-1 Fase R4. Antes era
 * `Number(process.env.MAX_SWEEP_CHAIN_INVOCATIONS ?? 20)`, y con un valor no
 * numérico eso daba `NaN`. Abajo, la condición que decide si el barrido
 * encadena es `chainIndex + 1 < maxChainInvocations`; toda comparación contra
 * `NaN` es `false`, así que el barrido recurrente **dejaba de encadenar del
 * todo** —un disparo en vez de veinte— sin un error y sin un log. El esquema
 * cae al valor por defecto en vez de propagar `NaN`, y `pnpm run check:env`
 * reporta el valor descartado antes de desplegarlo.
 */
export function resolveMaxSweepChainInvocations(): number {
  return serverEnv().MAX_SWEEP_CHAIN_INVOCATIONS;
}

/**
 * PRICING-TRUTH-1 (PR b): recurring-scan cadence by the project owner's plan,
 * replacing the previous single hardcoded 24h interval applied to every
 * project regardless of plan — `/pricing` promises "Semanal" for Starter and
 * "Diario" for Pro/Agencia, but the cron ran every project daily. `free` is
 * listed only for completeness (its interval is never actually reached: a
 * free-plan project cannot have `recurring_scans_enabled=true` in practice —
 * enabling it requires a prior completed scan per
 * `recurring_requires_completed_scan`, and `createPendingScanRunCore` now
 * refuses a second run for a free-plan project outright, see
 * `run-creation.ts`). Kept explicit rather than falling through to a default
 * so a missing branch is a type error, not a silent wrong cadence.
 *
 * In DAYS, not milliseconds, since RECURRING-CADENCE-1: eligibility is now
 * anchored to the cron's own firing schedule (see resolveEligibilityCutoffIso)
 * rather than measured as a rolling window backwards from `Date.now()`.
 */
const RECURRING_INTERVAL_DAYS_BY_PLAN: Record<string, number> = {
  free: 1,
  starter: 7,
  pro: 1,
  agency: 1
};

/**
 * The UTC hour `/api/cron/weekly-scans` is scheduled to fire at. MUST match
 * the `crons` entry in `vercel.json` — `cron-schedule.test.ts` asserts it
 * against that file, because a mismatch here is invisible at runtime and
 * shifts every project's eligibility by the difference.
 */
export const RECURRING_CRON_UTC_HOUR = 6;

/**
 * The most recent scheduled firing of the daily sweep, at or before `now`.
 *
 * Eligibility is anchored to this fixed instant instead of measured backwards
 * from `Date.now()` (RECURRING-CADENCE-1, log §192). The rolling-window form
 * it replaces asked "was the last run less than 24h ago?", which is the wrong
 * question for a job that fires once a day at a fixed hour: any run that
 * happened *off* that schedule — a manual scan, an auto-retry from
 * `reconciliation.ts` — sat inside the window at the next firing and skipped
 * the project for a whole day. A founder-visible instance: a project scanned
 * manually on 27-08 at 13:08 was skipped by the 28-08 firing and next scanned
 * on 29-08, two days apart on a daily plan.
 *
 * A 2h `CRON_DRIFT_SAFETY_MARGIN_MS` used to paper over the same class of
 * problem from the other direction (a firing whose own scan lands minutes
 * after the fixed cron time, drifting the next comparison to the wrong side of
 * an exact 24h boundary). The anchor removes the need for a margin at all: the
 * question is now "has this project been scanned since the last firing?",
 * which no amount of drift, and no off-schedule run, can answer wrongly.
 */
export function mostRecentCronFiringAt(now: number): number {
  const at = new Date(now);
  const todaysFiring = Date.UTC(
    at.getUTCFullYear(),
    at.getUTCMonth(),
    at.getUTCDate(),
    RECURRING_CRON_UTC_HOUR
  );

  return todaysFiring <= now ? todaysFiring : todaysFiring - DAY_MS;
}

/**
 * The instant a project's latest run must predate to be eligible this firing.
 *
 * For a daily plan that is the firing itself. For Starter's weekly cadence it
 * is `intervalDays - 1` days earlier, so the comparison still lands on a fixed
 * firing instant: a project scanned 7 days ago qualifies whatever time of day
 * that scan happened, and one scanned 6 days ago does not.
 */
export function resolveEligibilityCutoffIso({ planId, now }: { planId: string; now: number }): string {
  const intervalDays = RECURRING_INTERVAL_DAYS_BY_PLAN[planId] ?? 1;
  return new Date(mostRecentCronFiringAt(now) - (intervalDays - 1) * DAY_MS).toISOString();
}

/**
 * How many projects are scanned concurrently within a single cron
 * invocation. Each individual scan already parallelizes its own per-prompt
 * Gemini calls (see ADR 0003 addendum), so this is a second, smaller layer
 * of concurrency across *projects* — it lets the 60s Vercel maxDuration
 * ceiling (Hobby plan) cover more projects per run than fully sequential
 * execution would, without raising Gemini concurrency unboundedly.
 */
const BATCH_CONCURRENCY = 2;

export type CronResult = {
  projectId: string;
  status:
    | "scanned"
    | "skipped_active_run"
    | "skipped_recent"
    | "skipped_failure_streak"
    | "skipped_budget"
    | "skipped_plan_ineligible"
    | "failed";
};

type RecentRun = { status: string; created_at: string };
type Candidate = { id: string; recentRuns: RecentRun[]; cutoffIso: string };

/**
 * A project whose latest run is pending/running is not skipped outright on
 * that stale snapshot alone: createPendingScanRunForCron reconciles stuck
 * runs (timeout-based, see reconciliation.ts) before checking for an active
 * run again with a fresh read. So a run that *looks* active here but was
 * actually killed mid-execution (e.g. by the Vercel maxDuration cutoff)
 * gets cleared and the project scans normally instead of being skipped
 * forever — the cron never reached this call before, which is exactly why
 * a project with a genuinely stuck run never recovered on its own.
 * Only a still-genuinely-active run results in `skipped_active_run`.
 */
async function attemptScan({
  projectId,
  service
}: {
  projectId: string;
  service: ReturnType<typeof createServiceClient>;
}): Promise<CronResult> {
  try {
    const runId = await createPendingScanRunForCron({ projectId, service });
    await executePendingScan({ projectId, runId, supabase: service });
    return { projectId, status: "scanned" };
  } catch (error) {
    if (error instanceof ProjectActionError && error.code === "active_run_exists") {
      return { projectId, status: "skipped_active_run" };
    }

    console.error("[geo:scan:cron] scan execution failed", {
      projectId,
      message: error instanceof Error ? error.message : "unknown_error"
    });
    return { projectId, status: "failed" };
  }
}

async function processCandidate({
  candidate,
  service
}: {
  candidate: Candidate;
  service: ReturnType<typeof createServiceClient>;
}): Promise<CronResult> {
  const { id: projectId, recentRuns, cutoffIso } = candidate;
  const latestRun = recentRuns[0];
  const latestLooksActive = Boolean(latestRun && (latestRun.status === "pending" || latestRun.status === "running"));

  if (!latestLooksActive && latestRun && latestRun.created_at > cutoffIso) {
    return { projectId, status: "skipped_recent" };
  }

  if (
    !latestLooksActive &&
    recentRuns.length === FAILURE_STREAK_LIMIT &&
    recentRuns.every((run) => run.status === "failed")
  ) {
    return { projectId, status: "skipped_failure_streak" };
  }

  return attemptScan({ projectId, service });
}

/**
 * Fires the next link of a multi-invocation daily sweep (ASYNC-SCAN-1a,
 * docs/adr/0016) without making the caller wait for it: called from inside
 * `after()`, mirroring `triggerScanContinuation` in `executor.ts`
 * (docs/adr/0014). Errors are swallowed (logged only): if this dispatch is
 * lost, the deferred projects simply wait for the next day's cron firing —
 * candidate ordering (oldest-last-scan-first) guarantees they are
 * prioritized then, same starvation protection as before this mechanism
 * existed.
 */
async function triggerSweepContinuation({ chainIndex }: { chainIndex: number }): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[geo:scan:cron] cannot self-chain sweep: CRON_SECRET is not configured", { chainIndex });
    return;
  }

  const url = `${getSiteUrl()}/api/cron/sweep-continue`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ chainIndex })
    });

    // `fetch` only rejects on a transport failure: a 401 from Vercel's
    // deployment protection, a 404 from a stale `getSiteUrl()`, a 400 from a
    // chainIndex the callee's schema rejects, a 500 — every one of them
    // resolves, and without this check reads exactly like a dispatch that
    // worked, while `continuationScheduled: true` goes into the summary log.
    // The chain then ends after one link and the sweep serves at most
    // MAX_PROJECTS_PER_CRON_RUN projects a day, with nothing anywhere saying
    // so. `triggerScanContinuation` learned this one level down in
    // docs/adr/0037 and the sweep was never revisited (RECURRING-CADENCE-1).
    //
    // The await itself may not survive: this runs inside `after()`, and the
    // callee only responds once its own whole sweep is done, so a slow link
    // can outlive this invocation. That is harmless — the callee is an
    // independent invocation and keeps going — and it does not weaken the
    // check, because every rejection above returns immediately.
    if (!response.ok) {
      console.error("[geo:scan:cron] sweep continuation was rejected", {
        chainIndex,
        status: response.status,
        url
      });
    }
  } catch (error) {
    console.error("[geo:scan:cron] failed to dispatch sweep continuation", {
      chainIndex,
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Runs the daily recurring-scan sweep.
 *
 * Candidates are ordered oldest-last-scan-first (a project with no prior run
 * sorts first) before processing, so a project skipped one day because the
 * per-run budget ran out is prioritized the next day instead of the same
 * handful of projects always winning the budget race — without this, a
 * project could be starved indefinitely (see PR description / founder
 * report: a project with `recurring_scans_enabled=true` whose daily scan
 * never actually ran).
 *
 * Candidates are then processed in small concurrent batches
 * (BATCH_CONCURRENCY) rather than strictly sequentially, so more projects
 * fit inside the 60s Vercel maxDuration per invocation — a batch is only
 * started while a whole worst-case `executePendingScan` still fits under
 * SWEEP_SAFE_CEILING_MS (canStartAnotherSweepBatch).
 *
 * A candidate whose latest run looks pending/running from this snapshot is
 * not skipped outright: it still goes through attemptScan (via
 * processCandidate), which reconciles stuck runs and only reports
 * skipped_active_run if a fresh check confirms the run is genuinely still
 * active.
 *
 * Self-chaining (ASYNC-SCAN-1a, docs/adr/0016): candidates left over when
 * the per-invocation cap (`maxProjects`) or the time budget is hit are
 * *deferred*, and — instead of silently waiting for the next day, which
 * capped the whole system at `MAX_PROJECTS_PER_CRON_RUN` recurring projects
 * per day on Vercel Hobby's once-daily cron — the next sweep invocation is
 * dispatched via `after()` + `/api/cron/sweep-continue`, which repeats this
 * same function with `chainIndex + 1`. Convergence: every scanned project's
 * fresh run makes it `skipped_recent` (or `skipped_active_run`) for every
 * later link, so the eligible set strictly shrinks; a link that scans
 * nothing does not chain (progress guard), and `maxChainInvocations` bounds
 * the chain regardless.
 */
export async function runDailyCronScan({
  service,
  // Mismo motivo que `resolveMaxSweepChainInvocations` arriba (Fase R4): un
  // valor no numérico daba `NaN`, y `slice(0, NaN)` no devuelve ningún
  // proyecto — el barrido corría sin escanear nada.
  maxProjects = serverEnv().MAX_PROJECTS_PER_CRON_RUN,
  chainIndex = 0,
  scheduleContinuation = true,
  maxChainInvocations = resolveMaxSweepChainInvocations()
}: {
  service: ReturnType<typeof createServiceClient>;
  maxProjects?: number;
  /** 0 for the daily cron firing itself; ≥1 for chained continuation invocations. */
  chainIndex?: number;
  /** Set false to run a single invocation with no self-chaining (tests, manual ops). */
  scheduleContinuation?: boolean;
  maxChainInvocations?: number;
}): Promise<{
  processed: number;
  scanned: number;
  results: CronResult[];
  deferred: number;
  continuationScheduled: boolean;
}> {
  const startedAt = Date.now();

  const { data: candidateProjects, error: projectsError } = await service
    .from("projects")
    .select("id, owner_user_id")
    .eq("recurring_scans_enabled", true)
    .eq("is_archived", false);

  if (projectsError) {
    console.error("[geo:scan:cron] failed to load candidate projects", { message: projectsError.message });
    throw new Error("query_failed");
  }

  const ownerIds = Array.from(new Set((candidateProjects ?? []).map((project) => project.owner_user_id as string)));
  const { data: profileRows } = ownerIds.length
    ? await service.from("profiles").select("id, current_plan").in("id", ownerIds)
    : { data: [] as Array<{ id: string; current_plan: string | null }> };
  const planIdByOwnerId = new Map(
    (profileRows ?? []).map((row) => [row.id, resolvePlan(row.current_plan as string | undefined).id])
  );

  const results: CronResult[] = [];

  // Fetched up front (for every candidate, not just the ones that end up
  // processed) so candidates can be sorted by last-scan recency before the
  // budget-constrained loop runs. Free-plan projects are filtered out here
  // rather than left to fail inside attemptScan: in practice a free-plan
  // project can't reach `recurring_scans_enabled=true` (it requires a prior
  // completed scan, and a free-plan project can only ever have one), but
  // this keeps the invariant explicit and visible in the result summary
  // instead of relying on that indirect chain.
  const eligibleProjects = (candidateProjects ?? []).filter((project) => {
    const planId = planIdByOwnerId.get(project.owner_user_id as string) ?? "pro";
    if (planId === "free") {
      results.push({ projectId: project.id, status: "skipped_plan_ineligible" });
      return false;
    }
    return true;
  });

  const candidates: Candidate[] = await Promise.all(
    eligibleProjects.map(async (project) => {
      const { data: recentRuns } = await service
        .from("scan_runs")
        .select("status, created_at")
        .eq("project_id", project.id)
        .order("created_at", { ascending: false })
        .limit(FAILURE_STREAK_LIMIT);

      const planId = planIdByOwnerId.get(project.owner_user_id as string) ?? "pro";
      const cutoffIso = resolveEligibilityCutoffIso({ planId, now: Date.now() });

      return { id: project.id, recentRuns: recentRuns ?? [], cutoffIso };
    })
  );

  candidates.sort((a, b) => {
    const aLatest = a.recentRuns[0]?.created_at ?? "";
    const bLatest = b.recentRuns[0]?.created_at ?? "";
    return aLatest.localeCompare(bLatest);
  });

  let scannedCount = 0;
  let index = 0;

  while (index < candidates.length) {
    if (scannedCount >= maxProjects) break;

    // Asked BEFORE the batch, about that batch's worst case — never after one
    // about the past. See canStartAnotherSweepBatch / SWEEP_SAFE_CEILING_MS.
    if (!canStartAnotherSweepBatch({ elapsedMs: Date.now() - startedAt })) {
      for (const remaining of candidates.slice(index)) {
        results.push({ projectId: remaining.id, status: "skipped_budget" });
      }
      break;
    }

    const batchSize = Math.min(BATCH_CONCURRENCY, candidates.length - index, maxProjects - scannedCount);
    const batch = candidates.slice(index, index + batchSize);
    index += batch.length;

    const batchResults = await Promise.all(
      batch.map((candidate) => processCandidate({ candidate, service }))
    );

    for (const result of batchResults) {
      results.push(result);
      if (result.status === "scanned") scannedCount += 1;
    }
  }

  // Candidates the loop never reached (per-invocation cap) or explicitly
  // marked skipped_budget (time budget) — both leave `index` behind
  // `candidates.length`. Skips decided inside the loop (recent, streak,
  // active run) advance `index` and are NOT deferred: they resolved for
  // today, chaining again would not change them.
  const deferredCount = candidates.length - index;

  const continuationScheduled =
    scheduleContinuation && deferredCount > 0 && scannedCount > 0 && chainIndex + 1 < maxChainInvocations;

  if (continuationScheduled) {
    const nextChainIndex = chainIndex + 1;
    after(() => triggerSweepContinuation({ chainIndex: nextChainIndex }));
  }

  console.info("[geo:scan:cron] daily scan run summary", {
    elapsedMs: Date.now() - startedAt,
    chainIndex,
    candidates: (candidateProjects ?? []).length,
    scanned: scannedCount,
    deferred: deferredCount,
    continuationScheduled,
    results
  });

  return {
    processed: results.length,
    scanned: scannedCount,
    results,
    deferred: deferredCount,
    continuationScheduled
  };
}
