import "server-only";

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createPendingScanRunForCron, executePendingScan } from "@/lib/scan/scan-runner";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const RECURRING_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const TIME_BUDGET_MS = 45_000;
const FAILURE_STREAK_LIMIT = 3;
const DEFAULT_MAX_PROJECTS_PER_RUN = 5;

type CronResult = {
  projectId: string;
  status: "scanned" | "skipped_active_run" | "skipped_recent" | "skipped_failure_streak" | "skipped_budget" | "failed";
};

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (process.env.CRON_SCANS_ENABLED !== "true") {
    return NextResponse.json({ skipped: "cron_scans_disabled" });
  }

  const startedAt = Date.now();
  const service = createServiceClient();
  const maxProjects = Number(process.env.MAX_PROJECTS_PER_CRON_RUN ?? DEFAULT_MAX_PROJECTS_PER_RUN);
  const cutoffIso = new Date(Date.now() - RECURRING_INTERVAL_MS).toISOString();

  const { data: candidateProjects, error: projectsError } = await service
    .from("projects")
    .select("id")
    .eq("recurring_scans_enabled", true)
    .eq("is_archived", false);

  if (projectsError) {
    console.error("[geo:scan:cron] failed to load candidate projects", { message: projectsError.message });
    return NextResponse.json({ processed: 0, error: "query_failed" }, { status: 500 });
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

    if (latestRun && (latestRun.status === "pending" || latestRun.status === "running")) {
      results.push({ projectId: project.id, status: "skipped_active_run" });
      continue;
    }

    if (latestRun && latestRun.created_at > cutoffIso) {
      results.push({ projectId: project.id, status: "skipped_recent" });
      continue;
    }

    if (
      recentRuns &&
      recentRuns.length === FAILURE_STREAK_LIMIT &&
      recentRuns.every((run) => run.status === "failed")
    ) {
      results.push({ projectId: project.id, status: "skipped_failure_streak" });
      continue;
    }

    try {
      const runId = await createPendingScanRunForCron({ projectId: project.id, service });
      await executePendingScan({ projectId: project.id, runId, supabase: service });
      results.push({ projectId: project.id, status: "scanned" });
      scannedCount += 1;
    } catch (error) {
      console.error("[geo:scan:cron] scan execution failed", {
        projectId: project.id,
        message: error instanceof Error ? error.message : "unknown_error"
      });
      results.push({ projectId: project.id, status: "failed" });
    }
  }

  console.info("[geo:scan:cron] weekly scan run summary", {
    elapsedMs: Date.now() - startedAt,
    candidates: candidateProjects?.length ?? 0,
    scanned: scannedCount,
    results
  });

  return NextResponse.json({ processed: results.length, scanned: scannedCount, results });
}
