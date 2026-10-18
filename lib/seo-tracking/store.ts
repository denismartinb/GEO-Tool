import "server-only";

import { resolveSystemPlanId, SYSTEM_PLAN_COLUMNS } from "@/lib/billing";
import { seoTrackingCapsFor } from "@/lib/seo-tracking/caps";
import type { SeoErrorCategory } from "@/lib/seo-tracking/errors";
import type { PendingKeyword, SnapshotRow } from "@/lib/seo-tracking/serp-pass";
import type { createServiceClient } from "@/lib/supabase/service";

/**
 * SEO-TRACK-1 (log §340): the cron's reads and writes, service role, system
 * code with no user session. Every row read is re-checked against its
 * project's real owner and effective plan here; nothing trusts a column the
 * customer could have influenced.
 */

type Service = ReturnType<typeof createServiceClient>;

const PAGE = 1000;
const LOG_PREFIX = "[seo-tracking]";

export function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205" || error?.code === "PGRST200";
}

function isMissingColumn(error: { code?: string } | null): boolean {
  return error?.code === "42703" || error?.code === "PGRST204";
}

type KeywordRow = { id: string; project_id: string; owner_user_id: string; keyword: string; created_at: string };
type ProjectRow = { id: string; owner_user_id: string; domain: string; is_archived: boolean };

/** A project the pass served, with the owner and competitor cap the cron resolved. */
export type EligibleProject = { id: string; ownerUserId: string; competitorCap: number };

export type PendingLoad =
  | { available: false }
  | { available: true; pending: PendingKeyword[]; overCap: number; notEligible: number; eligibleProjects: EligibleProject[] };

function nothingPending(): PendingLoad {
  return { available: true, pending: [], overCap: 0, notEligible: 0, eligibleProjects: [] };
}

async function readAll<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { code?: string; message?: string } | null }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1);
    if (error) return { rows, error };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return { rows, error: null };
  }
}

/**
 * Projects whose switch is off. Own query, so a missing column (migration not
 * applied) never breaks the main read. Only a missing column fails toward ON,
 * like the engine switches (log §54), because the tables it would gate don't
 * exist either. Any other error returns null and the pass fetches nothing:
 * ON here means paying for what the operator switched off.
 */
async function disabledProjectIds(service: Service, projectIds: string[]): Promise<Set<string> | null> {
  if (projectIds.length === 0) return new Set();
  const { data, error } = await service.from("projects").select("id").in("id", projectIds).eq("seo_tracking_enabled", false);
  if (error) {
    if (isMissingColumn(error)) return new Set();
    console.error(`${LOG_PREFIX} switch read failed`, { code: error.code });
    return null;
  }
  return new Set((data ?? []).map((row) => row.id as string));
}

/**
 * Tracked keywords with no snapshot for `weekStart`, only from projects that
 * are live, switched on, owned by the same user the keyword row names, and
 * whose owner's effective plan still covers them. A downgraded plan keeps
 * the oldest keywords up to its cap; the rest are counted, not fetched.
 */
export async function loadPendingKeywords(service: Service, weekStart: string): Promise<PendingLoad> {
  const keywords = await readAll<KeywordRow>((from, to) =>
    service
      .from("seo_keywords")
      .select("id, project_id, owner_user_id, keyword, created_at")
      .eq("tracked", true)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)
  );
  if (keywords.error) {
    if (isMissingTable(keywords.error)) return { available: false };
    console.error(`${LOG_PREFIX} keywords read failed`, { code: keywords.error.code });
    return nothingPending();
  }
  if (keywords.rows.length === 0) return nothingPending();

  const done = await readAll<{ keyword_id: string }>((from, to) =>
    service.from("seo_serp_snapshots").select("keyword_id").eq("week_start", weekStart).range(from, to)
  );
  if (done.error) {
    console.error(`${LOG_PREFIX} snapshots read failed`, { code: done.error.code });
    return nothingPending();
  }
  const doneIds = new Set(done.rows.map((row) => row.keyword_id));

  const projectIds = [...new Set(keywords.rows.map((row) => row.project_id))];
  const { data: projects, error: projectsError } = await service
    .from("projects")
    .select("id, owner_user_id, domain, is_archived")
    .in("id", projectIds);
  if (projectsError) {
    console.error(`${LOG_PREFIX} projects read failed`, { code: projectsError.code });
    return nothingPending();
  }
  const projectById = new Map((projects as ProjectRow[]).map((row) => [row.id, row]));
  const disabled = await disabledProjectIds(service, projectIds);
  if (!disabled) return nothingPending();

  const ownerIds = [...new Set((projects as ProjectRow[]).map((row) => row.owner_user_id))];
  const { data: profiles } = await service.from("profiles").select(`id, ${SYSTEM_PLAN_COLUMNS}`).in("id", ownerIds);
  const planByOwner = new Map(
    ((profiles ?? []) as unknown as Array<{ id: string } & Parameters<typeof resolveSystemPlanId>[0]>).map((row) => [
      (row as { id: string }).id,
      resolveSystemPlanId(row)
    ])
  );

  const usedByProject = new Map<string, number>();
  const pending: PendingKeyword[] = [];
  const eligible = new Map<string, EligibleProject>();
  let overCap = 0;
  let notEligible = 0;

  for (const row of keywords.rows) {
    const project = projectById.get(row.project_id);
    if (!project || project.is_archived || project.owner_user_id !== row.owner_user_id || disabled.has(project.id)) {
      notEligible += 1;
      continue;
    }
    const caps = seoTrackingCapsFor(planByOwner.get(project.owner_user_id));
    const cap = caps.keywords;
    if (cap === 0) {
      notEligible += 1;
      continue;
    }
    // The cap counts every tracked keyword in creation order, done or not, so
    // the same oldest N are the ones fetched on every pass of the week.
    const used = (usedByProject.get(project.id) ?? 0) + 1;
    usedByProject.set(project.id, used);
    if (used > cap) {
      overCap += 1;
      continue;
    }
    eligible.set(project.id, { id: project.id, ownerUserId: project.owner_user_id, competitorCap: caps.competitors });
    if (doneIds.has(row.id)) continue;
    pending.push({ keywordId: row.id, projectId: project.id, ownerUserId: project.owner_user_id, keyword: row.keyword, ownDomain: project.domain });
  }

  return { available: true, pending, overCap, notEligible, eligibleProjects: [...eligible.values()] };
}

/** Idempotent: a second pass that reaches the same keyword and week changes nothing. */
export async function saveSnapshot(service: Service, row: SnapshotRow): Promise<boolean> {
  const { error } = await service.from("seo_serp_snapshots").upsert(row, { onConflict: "keyword_id,week_start", ignoreDuplicates: true });
  if (error) {
    console.error(`${LOG_PREFIX} snapshot write failed`, { code: error.code });
    return false;
  }
  return true;
}

/**
 * Operator categories already alerted this week. The marker is written only
 * after the email went out (`markOperatorAlerted`), so a failed send is retried
 * by the next pass (`.claude/rules/scan.md`). If the read fails, nothing counts
 * as alerted: a repeated email beats a lost one.
 */
export async function operatorCategoriesAlertedThisWeek(service: Service, weekStart: string): Promise<Set<SeoErrorCategory>> {
  const { data, error } = await service.from("seo_tracking_alerts").select("category").eq("week_start", weekStart);
  if (error) {
    if (!isMissingTable(error)) console.error(`${LOG_PREFIX} alerts read failed`, { code: error.code });
    return new Set();
  }
  return new Set((data ?? []).map((row) => row.category as SeoErrorCategory));
}

export async function markOperatorAlerted(service: Service, weekStart: string, category: SeoErrorCategory): Promise<void> {
  const { error } = await service
    .from("seo_tracking_alerts")
    .upsert({ week_start: weekStart, category }, { onConflict: "week_start,category", ignoreDuplicates: true });
  if (error) console.error(`${LOG_PREFIX} alert mark failed`, { code: error.code });
}

export type DueCompetitor = { id: string; projectId: string; ownerUserId: string; domain: string };

/** Backlink summaries are monthly: rows never checked or checked 28+ days ago. */
export const LINKS_REFRESH_DAYS = 28;

/**
 * Rows due for their monthly backlink summary, only within what each project's
 * plan still covers: the `is_own` row plus the oldest rivals up to the cap
 * (a downgrade or two racing saves can leave more rows than the plan pays
 * for). A row whose owner is not the project's real owner is skipped.
 */
export async function loadCompetitorsDue(service: Service, projects: EligibleProject[], now: Date): Promise<DueCompetitor[]> {
  if (projects.length === 0) return [];
  const byId = new Map(projects.map((project) => [project.id, project]));
  const cutoff = Date.parse(new Date(now.getTime() - LINKS_REFRESH_DAYS * 86_400_000).toISOString());
  const { data, error } = await service
    .from("seo_competitors")
    .select("id, project_id, owner_user_id, domain, is_own, links_checked_at, created_at")
    .in("project_id", [...byId.keys()])
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) {
    if (!isMissingTable(error)) console.error(`${LOG_PREFIX} competitors read failed`, { code: error.code });
    return [];
  }

  type Row = { id: string; project_id: string; owner_user_id: string; domain: string; is_own: boolean; links_checked_at: string | null };
  const rivalsSeen = new Map<string, number>();
  const due: Array<DueCompetitor & { checkedAt: number }> = [];
  for (const row of (data ?? []) as Row[]) {
    const project = byId.get(row.project_id);
    if (!project || row.owner_user_id !== project.ownerUserId) continue;
    if (!row.is_own) {
      const seen = (rivalsSeen.get(project.id) ?? 0) + 1;
      rivalsSeen.set(project.id, seen);
      if (seen > project.competitorCap) continue;
    }
    const checkedAt = row.links_checked_at ? Date.parse(row.links_checked_at) : 0;
    if (checkedAt >= cutoff) continue;
    due.push({ id: row.id, projectId: row.project_id, ownerUserId: row.owner_user_id, domain: row.domain, checkedAt });
  }
  // Never-checked first, then the stalest.
  return due.sort((a, b) => a.checkedAt - b.checkedAt).map(({ checkedAt: _checkedAt, ...competitor }) => competitor);
}

export async function saveBacklinks(
  service: Service,
  competitor: DueCompetitor,
  summary: { referringDomains: number | null; backlinks: number | null },
  now: Date
): Promise<void> {
  const { error } = await service
    .from("seo_competitors")
    .update({ referring_domains: summary.referringDomains, backlinks: summary.backlinks, links_checked_at: now.toISOString() })
    .eq("id", competitor.id)
    .eq("project_id", competitor.projectId)
    .eq("owner_user_id", competitor.ownerUserId);
  if (error) console.error(`${LOG_PREFIX} backlinks write failed`, { code: error.code });
}
