import "server-only";

import { createPendingScanRunForCron } from "@/lib/scan/run-creation";
import { executePendingScan } from "@/lib/scan/executor";
import { ProjectActionError } from "@/lib/scan/types";
import type { createServiceClient } from "@/lib/supabase/service";

const RECURRING_INTERVAL_MS = 24 * 60 * 60 * 1000;
const TIME_BUDGET_MS = 45_000;
const FAILURE_STREAK_LIMIT = 3;
const DEFAULT_MAX_PROJECTS_PER_RUN = 5;

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
  status: "scanned" | "skipped_active_run" | "skipped_recent" | "skipped_failure_streak" | "skipped_budget" | "failed";
};

type RecentRun = { status: string; created_at: string };
type Candidate = { id: string; recentRuns: RecentRun[] };

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
  service,
  cutoffIso
}: {
  candidate: Candidate;
  service: ReturnType<typeof createServiceClient>;
  cutoffIso: string;
}): Promise<CronResult> {
  const { id: projectId, recentRuns } = candidate;
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
 * fit inside the 45s soft budget / 60s Vercel maxDuration per invocation.
 *
 * A candidate whose latest run looks pending/running from this snapshot is
 * not skipped outright: it still goes through attemptScan (via
 * processCandidate), which reconciles stuck runs and only reports
 * skipped_active_run if a fresh check confirms the run is genuinely still
 * active.
 */
export async function runDailyCronScan({
  service,
  maxProjects = Number(process.env.MAX_PROJECTS_PER_CRON_RUN ?? DEFAULT_MAX_PROJECTS_PER_RUN)
}: {
  service: ReturnType<typeof createServiceClient>;
  maxProjects?: number;
}): Promise<{ processed: number; scanned: number; results: CronResult[] }> {
  const startedAt = Date.now();
  const cutoffIso = new Date(Date.now() - RECURRING_INTERVAL_MS).toISOString();

  const { data: candidateProjects, error: projectsError } = await service
    .from("projects")
    .select("id")
    .eq("recurring_scans_enabled", true)
    .eq("is_archived", false);

  if (projectsError) {
    console.error("[geo:scan:cron] failed to load candidate projects", { message: projectsError.message });
    throw new Error("query_failed");
  }

  // Fetched up front (for every candidate, not just the ones that end up
  // processed) so candidates can be sorted by last-scan recency before the
  // budget-constrained loop runs.
  const candidates: Candidate[] = await Promise.all(
    (candidateProjects ?? []).map(async (project) => {
      const { data: recentRuns } = await service
        .from("scan_runs")
        .select("status, created_at")
        .eq("project_id", project.id)
        .order("created_at", { ascending: false })
        .limit(FAILURE_STREAK_LIMIT);

      return { id: project.id, recentRuns: recentRuns ?? [] };
    })
  );

  candidates.sort((a, b) => {
    const aLatest = a.recentRuns[0]?.created_at ?? "";
    const bLatest = b.recentRuns[0]?.created_at ?? "";
    return aLatest.localeCompare(bLatest);
  });

  const results: CronResult[] = [];
  let scannedCount = 0;
  let index = 0;

  while (index < candidates.length) {
    if (scannedCount >= maxProjects) break;

    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      for (const remaining of candidates.slice(index)) {
        results.push({ projectId: remaining.id, status: "skipped_budget" });
      }
      break;
    }

    const batchSize = Math.min(BATCH_CONCURRENCY, candidates.length - index, maxProjects - scannedCount);
    const batch = candidates.slice(index, index + batchSize);
    index += batch.length;

    const batchResults = await Promise.all(
      batch.map((candidate) => processCandidate({ candidate, service, cutoffIso }))
    );

    for (const result of batchResults) {
      results.push(result);
      if (result.status === "scanned") scannedCount += 1;
    }
  }

  console.info("[geo:scan:cron] daily scan run summary", {
    elapsedMs: Date.now() - startedAt,
    candidates: candidates.length,
    scanned: scannedCount,
    results
  });

  return { processed: results.length, scanned: scannedCount, results };
}
