import "server-only";

import { createPendingScanRunForCron } from "@/lib/scan/run-creation";
import { executePendingScan } from "@/lib/scan/executor";
import { ProjectActionError } from "@/lib/scan/types";
import type { createServiceClient } from "@/lib/supabase/service";

const RECURRING_INTERVAL_MS = 24 * 60 * 60 * 1000;
const TIME_BUDGET_MS = 45_000;
const FAILURE_STREAK_LIMIT = 3;
const DEFAULT_MAX_PROJECTS_PER_RUN = 5;

export type CronResult = {
  projectId: string;
  status: "scanned" | "skipped_active_run" | "skipped_recent" | "skipped_failure_streak" | "skipped_budget" | "failed";
};

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

/**
 * Runs the daily recurring-scan sweep: loads candidate projects
 * (recurring_scans_enabled=true, not archived) and, for each, either scans
 * it or records why it was skipped.
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

  const results: CronResult[] = [];
  let scannedCount = 0;

  for (const project of candidateProjects ?? []) {
    if (scannedCount >= maxProjects) break;

    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      results.push({ projectId: project.id, status: "skipped_budget" });
      continue;
    }

    const { data: recentRuns } = await service
      .from("scan_runs")
      .select("status, created_at")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false })
      .limit(FAILURE_STREAK_LIMIT);

    const latestRun = recentRuns?.[0];
    const latestLooksActive = Boolean(latestRun && (latestRun.status === "pending" || latestRun.status === "running"));

    if (!latestLooksActive && latestRun && latestRun.created_at > cutoffIso) {
      results.push({ projectId: project.id, status: "skipped_recent" });
      continue;
    }

    if (
      !latestLooksActive &&
      recentRuns &&
      recentRuns.length === FAILURE_STREAK_LIMIT &&
      recentRuns.every((run) => run.status === "failed")
    ) {
      results.push({ projectId: project.id, status: "skipped_failure_streak" });
      continue;
    }

    const result = await attemptScan({ projectId: project.id, service });
    results.push(result);
    if (result.status === "scanned") scannedCount += 1;
  }

  console.info("[geo:scan:cron] daily scan run summary", {
    elapsedMs: Date.now() - startedAt,
    candidates: candidateProjects?.length ?? 0,
    scanned: scannedCount,
    results
  });

  return { processed: results.length, scanned: scannedCount, results };
}
