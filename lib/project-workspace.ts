import "server-only";

import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { NOTIFICATIONS_BELL_LIMIT, NOTIFICATIONS_PAGE_LIMIT } from "@/lib/notifications/types";

export { NOTIFICATIONS_BELL_LIMIT, NOTIFICATIONS_PAGE_LIMIT };

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

/**
 * A row from the `notifications` table (NOTIF-SERVER-1a,
 * supabase/migrations/0021_notifications.sql), written server-side at the
 * moment each event happens — see lib/notifications/emit.ts. Rendered into
 * copy by lib/notifications/render.ts, which needs the raw `payloadJson`
 * plus `projectId` (to resolve the project's domain from `projects`, already
 * loaded below, at zero extra query cost).
 */
export type WorkspaceNotification = {
  id: string;
  type: string;
  severity: string;
  projectId: string | null;
  payloadJson: unknown;
  readAt: string | null;
  createdAt: string;
};

/**
 * The bell only ever shows the most recent NOTIFICATIONS_BELL_LIMIT
 * notifications — a deliberate one-query-or-nothing tradeoff (docs/specs/
 * notifications/notifications-v1.md section 5.1), not an oversight. The
 * unread count is derived from these same rows, so if all
 * NOTIFICATIONS_BELL_LIMIT are unread the badge reads "15+" instead of the
 * true count — see components/notification-bell.tsx.
 */
type NotificationSelectRow = {
  id: string;
  type: string;
  severity: string;
  project_id: string | null;
  payload_json: unknown;
  read_at: string | null;
  created_at: string;
};

function mapNotificationRow(n: NotificationSelectRow): WorkspaceNotification {
  return {
    id: n.id,
    type: n.type,
    severity: n.severity,
    projectId: n.project_id,
    payloadJson: n.payload_json,
    readAt: n.read_at,
    createdAt: n.created_at
  };
}

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
  notifications: WorkspaceNotification[];
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
    { data: notificationRows }
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
    // No .eq("owner_user_id", ...) — the notifications_select_owner RLS
    // policy (migration 0021) already scopes this to the current user, same
    // as every other query in this function relies on RLS for scoping.
    supabase
      .from("notifications")
      .select("id, type, severity, project_id, payload_json, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(NOTIFICATIONS_BELL_LIMIT)
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

  const notifications: WorkspaceNotification[] = (notificationRows ?? []).map(mapNotificationRow);

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
    notifications
  };
}

/**
 * Data for the full `/dashboard/notifications` page (NOTIF-SERVER-1b) — a
 * separate, lighter query than getWorkspaceCounters (just projects +
 * notifications, no counters), since the page shows up to
 * NOTIFICATIONS_PAGE_LIMIT rows rather than the bell's 15.
 */
export async function getNotificationsPageData(): Promise<{
  projects: WorkspaceProjectSummary[];
  notifications: WorkspaceNotification[];
}> {
  const { supabase } = await requireUser();

  const [{ data: projects }, { data: notificationRows }] = await Promise.all([
    supabase.from("projects").select("id, name, domain, country, language").eq("is_archived", false),
    // No .eq("owner_user_id", ...) — notifications_select_owner RLS scopes this already.
    supabase
      .from("notifications")
      .select("id, type, severity, project_id, payload_json, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(NOTIFICATIONS_PAGE_LIMIT)
  ]);

  return {
    projects: projects ?? [],
    notifications: (notificationRows ?? []).map(mapNotificationRow)
  };
}
