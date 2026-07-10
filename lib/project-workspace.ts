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
  domain: string;
  finishedAt: string;
  promptsProcessed: number;
};

/**
 * One notification entry per distinct `project_prompts.created_at` timestamp
 * (i.e. per insert statement) — `now()` is stable for the whole statement in
 * a single Postgres transaction, so every row from one batched insert (the
 * "Añadir prompts" flow, or the plain single-prompt form) shares the exact
 * same value, letting us recover "N prompts added at once" without a schema
 * change or a dedicated notifications table.
 */
export type RecentPromptsAdded = {
  projectId: string;
  domain: string;
  addedAt: string;
  count: number;
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
  recentPromptsAdded: RecentPromptsAdded[];
};

/**
 * Interim cap (PERF-4a, docs/architecture-audit-2026-07.md section 2.1) on the
 * two `getWorkspaceCounters` queries that only ever need the *most recent*
 * row(s) per project, not an exact total: the latest scan status/date, and
 * the latest 2 scores (for the score + its delta). Ordered `created_at`
 * descending, so a project's most recent row always sorts before this cap
 * unless the user has more than WORKSPACE_RECENCY_QUERY_LIMIT more-recent
 * rows across *other* projects — at current beta scale this is generous
 * headroom, not a real limit. If a project's data ever ages out of this
 * window, that project's status/date/score just reads as unknown (graceful
 * degradation), not wrong — unlike a count, which must stay exact. This is a
 * stopgap, not the fix: the correct version is a Postgres aggregate
 * (RPC/view) returning one row per project directly, which needs a schema
 * migration and its own explicit approval.
 *
 * `completedRunCountByProject` below is deliberately NOT capped — it's a
 * displayed count ("N escaneos completados"), and capping it would make that
 * count silently wrong past the cap instead of gracefully stale.
 */
const WORKSPACE_RECENCY_QUERY_LIMIT = 1000;

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
    { data: recentRuns },
    { data: recentPromptRows }
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, domain, country, language")
      .eq("is_archived", false)
      .order("created_at", { ascending: false }),
    supabase
      .from("scan_runs")
      .select("project_id, status, created_at, finished_at")
      .order("created_at", { ascending: false })
      .limit(WORKSPACE_RECENCY_QUERY_LIMIT),
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
      .order("created_at", { ascending: false })
      .limit(WORKSPACE_RECENCY_QUERY_LIMIT),
    supabase
      .from("scan_runs")
      .select("id, project_id, finished_at, successful_prompts")
      .eq("status", "completed")
      .order("finished_at", { ascending: false })
      .limit(5),
    supabase
      .from("project_prompts")
      .select("project_id, created_at")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(50)
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

  const domainByProject = (projects ?? []).reduce<Record<string, string>>((acc, p) => {
    acc[p.id] = p.domain;
    return acc;
  }, {});

  const recentCompletedRuns: RecentCompletedRun[] = (recentRuns ?? [])
    .filter((r) => r.finished_at && domainByProject[r.project_id])
    .map((r) => ({
      runId: r.id,
      projectId: r.project_id,
      domain: domainByProject[r.project_id],
      finishedAt: r.finished_at as string,
      promptsProcessed: r.successful_prompts ?? 0
    }));

  const promptBatchCounts = new Map<string, number>();
  for (const p of recentPromptRows ?? []) {
    const key = `${p.project_id}|${p.created_at}`;
    promptBatchCounts.set(key, (promptBatchCounts.get(key) ?? 0) + 1);
  }

  const recentPromptsAdded: RecentPromptsAdded[] = Array.from(promptBatchCounts.entries())
    .map(([key, count]) => {
      const separatorIndex = key.indexOf("|");
      const projectId = key.slice(0, separatorIndex);
      const addedAt = key.slice(separatorIndex + 1);
      return { projectId, domain: domainByProject[projectId], addedAt, count };
    })
    .filter((p) => p.domain)
    .sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1))
    .slice(0, 5);

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
    recentCompletedRuns,
    recentPromptsAdded
  };
}
