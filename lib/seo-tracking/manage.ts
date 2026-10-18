import "server-only";

import { fitUnderCap, seoTrackingCapsFor } from "@/lib/seo-tracking/caps";
import { normalizeKeywordList } from "@/lib/seo-tracking/keyword-text";
import { planCompetitorChange } from "@/lib/seo-tracking/competitors";
import { isMissingTable } from "@/lib/seo-tracking/store";
import type { createServiceClient } from "@/lib/supabase/service";

/**
 * SEO-TRACK-1 (log §341): the writes behind «Posición en Google». Service
 * role, so the CALLER must have verified identity first
 * (`requireActiveProject(projectId)` + `requireUser().user.id`) and pass the
 * plan from the user's own plan read. These functions re-check that the
 * project belongs to that owner and filter every write by `project_id` AND
 * `owner_user_id` (`.claude/rules/seo-tracking.md`). Called from the server
 * actions of the screen (PR B, log §342).
 */

type Service = ReturnType<typeof createServiceClient>;

export type KeywordSource = "search_console" | "competitor_gap" | "keyword_ideas" | "manual";

export type AddKeywordsResult =
  | { status: "ok"; added: string[]; retracked: string[]; duplicates: string[]; overCap: string[] }
  | { status: "unavailable" }
  | { status: "not_found" }
  | { status: "failed" };

async function ownedProjectDomain(service: Service, projectId: string, ownerUserId: string): Promise<string | null> {
  const { data } = await service
    .from("projects")
    .select("domain")
    .eq("id", projectId)
    .eq("owner_user_id", ownerUserId)
    .eq("is_archived", false)
    .maybeSingle();
  return (data?.domain as string | undefined) ?? null;
}

async function ownedTopic(service: Service, projectId: string, ownerUserId: string, topicId: string): Promise<boolean> {
  const { data } = await service
    .from("seo_topics")
    .select("id")
    .eq("id", topicId)
    .eq("project_id", projectId)
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();
  return !!data;
}

/**
 * Tracks keywords under the plan's cap. A keyword the project stopped
 * tracking (`tracked=false`) is tracked again, keeping its history, and counts
 * against the cap like a new one (log §342). One already tracked is reported
 * as a duplicate; with a topic given it moves to that topic.
 */
export async function addTrackedKeywordsCore(
  service: Service,
  input: { projectId: string; ownerUserId: string; planId: string | null | undefined; keywords: string[]; source: KeywordSource; topicId?: string | null }
): Promise<AddKeywordsResult> {
  if (!(await ownedProjectDomain(service, input.projectId, input.ownerUserId))) return { status: "not_found" };
  const wanted = normalizeKeywordList(input.keywords);

  const { data: existing, error } = await service
    .from("seo_keywords")
    .select("id, keyword, tracked")
    .eq("project_id", input.projectId)
    .eq("owner_user_id", input.ownerUserId);
  if (error) return isMissingTable(error) ? { status: "unavailable" } : { status: "failed" };

  if (input.topicId && !(await ownedTopic(service, input.projectId, input.ownerUserId, input.topicId))) return { status: "not_found" };

  const rows = (existing ?? []) as Array<{ id: string; keyword: string; tracked: boolean }>;
  const byKeyword = new Map(rows.map((row) => [row.keyword, row]));
  const duplicates = wanted.filter((keyword) => byKeyword.get(keyword)?.tracked === true);
  const candidates = wanted.filter((keyword) => byKeyword.get(keyword)?.tracked !== true);
  const trackedCount = rows.filter((row) => row.tracked === true).length;
  const { accepted, rejected } = fitUnderCap(trackedCount, seoTrackingCapsFor(input.planId).keywords, candidates);
  const retracked = accepted.filter((keyword) => byKeyword.has(keyword));
  const fresh = accepted.filter((keyword) => !byKeyword.has(keyword));

  if (fresh.length > 0) {
    const { error: insertError } = await service.from("seo_keywords").insert(
      fresh.map((keyword) => ({
        project_id: input.projectId,
        owner_user_id: input.ownerUserId,
        topic_id: input.topicId ?? null,
        keyword,
        source: input.source,
        tracked: true
      }))
    );
    if (insertError) return { status: "failed" };
  }
  const moved = [...retracked, ...(input.topicId ? duplicates : [])];
  if (moved.length > 0) {
    const patch: Record<string, unknown> = { tracked: true };
    if (input.topicId) patch.topic_id = input.topicId;
    const { error: updateError } = await service
      .from("seo_keywords")
      .update(patch)
      .eq("project_id", input.projectId)
      .eq("owner_user_id", input.ownerUserId)
      .in("id", moved.map((keyword) => byKeyword.get(keyword)!.id));
    if (updateError) return { status: "failed" };
  }
  return { status: "ok", added: fresh, retracked, duplicates, overCap: rejected };
}

export type SimpleResult = { status: "ok" } | { status: "unavailable" } | { status: "not_found" } | { status: "failed" };

/** Stops tracking a keyword. Never deletes: the cascade would take its snapshot history (log §341). */
export async function untrackKeywordCore(service: Service, input: { projectId: string; ownerUserId: string; keywordId: string }): Promise<SimpleResult> {
  const { data, error } = await service
    .from("seo_keywords")
    .update({ tracked: false })
    .eq("id", input.keywordId)
    .eq("project_id", input.projectId)
    .eq("owner_user_id", input.ownerUserId)
    .select("id")
    .maybeSingle();
  if (error) return isMissingTable(error) ? { status: "unavailable" } : { status: "failed" };
  return data ? { status: "ok" } : { status: "not_found" };
}

export const MAX_TOPIC_NAME = 80;

export type TopicResult = { status: "ok"; topicId: string } | { status: "unavailable" } | { status: "not_found" } | { status: "invalid" } | { status: "failed" };

/** Returns the project's topic with that name, creating it when missing. */
export async function ensureTopicCore(
  service: Service,
  input: { projectId: string; ownerUserId: string; name: string; targetUrl?: string | null }
): Promise<TopicResult> {
  const name = input.name.normalize("NFC").trim().replace(/\s+/g, " ");
  if (!name || name.length > MAX_TOPIC_NAME) return { status: "invalid" };
  if (!(await ownedProjectDomain(service, input.projectId, input.ownerUserId))) return { status: "not_found" };
  const { data: found, error } = await service
    .from("seo_topics")
    .select("id")
    .eq("project_id", input.projectId)
    .eq("owner_user_id", input.ownerUserId)
    .eq("name", name)
    .maybeSingle();
  if (error) return isMissingTable(error) ? { status: "unavailable" } : { status: "failed" };
  if (found) return { status: "ok", topicId: found.id as string };
  const { data, error: insertError } = await service
    .from("seo_topics")
    .insert({ project_id: input.projectId, owner_user_id: input.ownerUserId, name, target_url: input.targetUrl ?? null })
    .select("id")
    .single();
  if (insertError || !data) return { status: "failed" };
  return { status: "ok", topicId: data.id as string };
}

/** «Marcar como hecho» / «Deshacer» on a topic step. Only the key is stored; the step is recomputed live. */
export async function setActionDoneCore(
  service: Service,
  input: { projectId: string; ownerUserId: string; topicId: string; actionKey: string; done: boolean }
): Promise<SimpleResult> {
  if (!(await ownedTopic(service, input.projectId, input.ownerUserId, input.topicId))) return { status: "not_found" };
  const query = input.done
    ? service
        .from("seo_action_states")
        .upsert(
          { project_id: input.projectId, owner_user_id: input.ownerUserId, topic_id: input.topicId, action_key: input.actionKey, status: "done" },
          { onConflict: "topic_id,action_key", ignoreDuplicates: true }
        )
    : service
        .from("seo_action_states")
        .delete()
        .eq("project_id", input.projectId)
        .eq("owner_user_id", input.ownerUserId)
        .eq("topic_id", input.topicId)
        .eq("action_key", input.actionKey);
  const { error } = await query;
  if (error) return isMissingTable(error) ? { status: "unavailable" } : { status: "failed" };
  return { status: "ok" };
}

/** Searches of «Descubrir palabras» an account may run per UTC day, across its projects. */
export const DISCOVERY_DAILY_LIMIT = 5;

export async function discoveryRunsToday(service: Service, ownerUserId: string, now: Date): Promise<number | null> {
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const { count, error } = await service
    .from("seo_discovery_runs")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", ownerUserId)
    .gte("created_at", since);
  return error ? null : count ?? 0;
}

export async function recordDiscoveryRun(
  service: Service,
  input: { projectId: string; ownerUserId: string; kind: "seed" | "rivals"; costUsd: number }
): Promise<boolean> {
  const { error } = await service
    .from("seo_discovery_runs")
    .insert({ project_id: input.projectId, owner_user_id: input.ownerUserId, kind: input.kind, cost_usd: input.costUsd });
  return !error;
}

export type SetCompetitorsResult =
  | { status: "ok"; kept: string[]; added: string[]; removed: string[]; rejected: string[] }
  | { status: "unavailable" }
  | { status: "not_found" }
  | { status: "failed" };

/**
 * Replaces the project's rival domains with `domains` (normalized, own domain
 * and duplicates dropped, cut to the plan's cap) and makes sure the `is_own`
 * row exists, so the backlink refresh also measures the project itself.
 */
export async function setCompetitorsCore(
  service: Service,
  input: { projectId: string; ownerUserId: string; planId: string | null | undefined; domains: string[] }
): Promise<SetCompetitorsResult> {
  const ownDomain = await ownedProjectDomain(service, input.projectId, input.ownerUserId);
  if (!ownDomain) return { status: "not_found" };

  const { data, error } = await service
    .from("seo_competitors")
    .select("id, domain, is_own")
    .eq("project_id", input.projectId)
    .eq("owner_user_id", input.ownerUserId);
  if (error) return isMissingTable(error) ? { status: "unavailable" } : { status: "failed" };

  const rows = (data ?? []) as Array<{ id: string; domain: string; is_own: boolean }>;
  const plan = planCompetitorChange({
    ownDomain,
    current: rows.filter((row) => !row.is_own).map((row) => row.domain),
    wanted: input.domains,
    cap: seoTrackingCapsFor(input.planId).competitors
  });

  if (plan.remove.length > 0) {
    const { error: deleteError } = await service
      .from("seo_competitors")
      .delete()
      .eq("project_id", input.projectId)
      .eq("owner_user_id", input.ownerUserId)
      .eq("is_own", false)
      .in("domain", plan.remove);
    if (deleteError) return { status: "failed" };
  }

  const inserts = plan.add.map((domain) => ({ project_id: input.projectId, owner_user_id: input.ownerUserId, domain, is_own: false }));
  if (!rows.some((row) => row.is_own)) inserts.push({ project_id: input.projectId, owner_user_id: input.ownerUserId, domain: plan.own, is_own: true });
  if (inserts.length > 0) {
    const { error: insertError } = await service.from("seo_competitors").insert(inserts);
    if (insertError) return { status: "failed" };
  }
  return { status: "ok", kept: plan.keep, added: plan.add, removed: plan.remove, rejected: plan.rejected };
}
