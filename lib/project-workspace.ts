import "server-only";

import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";

export async function requireActiveProject(projectId: string) {
  const { supabase } = await requireUser();
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, brand, domain, country, language, recurring_scans_enabled")
    .eq("id", projectId)
    .eq("is_archived", false)
    .single();

  if (!project) notFound();

  return project;
}

export type WorkspaceProjectSummary = {
  id: string;
  name: string;
  domain: string;
  country: string;
  language: string;
};

export type RecentCompletedRun = {
  runId: string;
  projectId: string;
  projectName: string;
  projectDomain: string;
  finishedAt: string;
};

export type WorkspaceCounters = {
  projects: WorkspaceProjectSummary[];
  promptCountByProject: Record<string, number>;
  competitorCountByProject: Record<string, number>;
  completedRunCountByProject: Record<string, number>;
  recommendationCountByProject: Record<string, number>;
  latestScanStatusByProject: Record<string, string>;
  latestScanDateByProject: Record<string, string | null>;
  latestScoreByProject: Record<string, number | null>;
  scoreDeltaByProject: Record<string, number | null>;
  recentCompletedRuns: RecentCompletedRun[];
};

/**
 * Loads the active projects for the current user along with the counters and
 * status maps shared by the dashboard sidebar/topbar and the Escaneos
 * (domains) grid. Centralized here so both call sites query Supabase once
 * with the same shape instead of duplicating the aggregation logic.
 */
export async function getWorkspaceCounters(): Promise<WorkspaceCounters> {
  const { supabase } = await requireUser();

  const [
    { data: projects },
    { data: runs },
    { data: allPrompts },
    { data: allCompetitors },
    { data: completedRuns },
    { data: allRecs },
    { data: scores },
    { data: recentCompleted }
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, domain, country, language")
      .eq("is_archived", false)
      .order("created_at", { ascending: false }),
    supabase
      .from("scan_runs")
      .select("project_id, status, created_at, finished_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("project_prompts")
      .select("project_id")
      .eq("is_active", true),
    supabase
      .from("project_competitors")
      .select("project_id")
      .eq("is_active", true),
    supabase
      .from("scan_runs")
      .select("project_id, status")
      .eq("status", "completed"),
    supabase
      .from("recommendations")
      .select("project_id")
      .eq("status", "active"),
    supabase
      .from("run_scores")
      .select("project_id, run_id, visibility_score, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("scan_runs")
      .select("id, project_id, finished_at, created_at")
      .eq("status", "completed")
      .order("finished_at", { ascending: false })
      .limit(10)
  ]);

  const latestScanStatusByProject = (runs ?? []).reduce<Record<string, string>>((statuses, run) => {
    if (!statuses[run.project_id]) statuses[run.project_id] = run.status;
    return statuses;
  }, {});

  const latestScanDateByProject = (runs ?? []).reduce<Record<string, string | null>>((dates, run) => {
    if (!(run.project_id in dates)) {
      dates[run.project_id] = run.finished_at ?? run.created_at ?? null;
    }
    return dates;
  }, {});

  const promptCountByProject = (allPrompts ?? []).reduce<Record<string, number>>((acc, p) => {
    acc[p.project_id] = (acc[p.project_id] ?? 0) + 1;
    return acc;
  }, {});

  const competitorCountByProject = (allCompetitors ?? []).reduce<Record<string, number>>((acc, p) => {
    acc[p.project_id] = (acc[p.project_id] ?? 0) + 1;
    return acc;
  }, {});

  const completedRunCountByProject = (completedRuns ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.project_id] = (acc[r.project_id] ?? 0) + 1;
    return acc;
  }, {});

  const recommendationCountByProject = (allRecs ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.project_id] = (acc[r.project_id] ?? 0) + 1;
    return acc;
  }, {});

  const latestScoreByProject: Record<string, number | null> = {};
  const scoreDeltaByProject: Record<string, number | null> = {};
  const seenScoresByProject = new Map<string, number[]>();

  for (const s of scores ?? []) {
    const value = Number(s.visibility_score ?? NaN);
    const rounded = Number.isFinite(value) ? Math.round(value) : null;
    const seen = seenScoresByProject.get(s.project_id) ?? [];
    if (seen.length < 2 && rounded !== null) {
      seen.push(rounded);
      seenScoresByProject.set(s.project_id, seen);
    }
  }

  for (const [projectId, seen] of seenScoresByProject.entries()) {
    latestScoreByProject[projectId] = seen[0] ?? null;
    scoreDeltaByProject[projectId] = seen.length >= 2 ? seen[0] - seen[1] : null;
  }

  const projectById = new Map((projects ?? []).map((p) => [p.id, p]));

  const recentCompletedRuns: RecentCompletedRun[] = (recentCompleted ?? [])
    .map((run) => {
      const project = projectById.get(run.project_id);
      const finishedAt = run.finished_at ?? run.created_at;
      if (!project || !finishedAt) return null;
      return {
        runId: run.id,
        projectId: run.project_id,
        projectName: project.name,
        projectDomain: project.domain,
        finishedAt
      };
    })
    .filter((run): run is RecentCompletedRun => run !== null);

  return {
    projects: projects ?? [],
    promptCountByProject,
    competitorCountByProject,
    completedRunCountByProject,
    recommendationCountByProject,
    latestScanStatusByProject,
    latestScanDateByProject,
    latestScoreByProject,
    scoreDeltaByProject,
    recentCompletedRuns
  };
}
