import "server-only";

import type { AuthenticatedContext } from "@/lib/auth";
import { seoTrackingCapsFor, type SeoTrackingCaps } from "@/lib/seo-tracking/caps";
import { DISCOVERY_DAILY_LIMIT } from "@/lib/seo-tracking/manage";
import { actionRank, buildTopicActions, type CtrSignal, type TopicAction } from "@/lib/seo-tracking/topic-actions";
import {
  buildTrackingView,
  HISTORY_WEEKS,
  NO_TOPIC_ID,
  weekSeries,
  type CompetitorRow,
  type KeywordRow,
  type SnapshotRow,
  type TopicRow,
  type TopicView
} from "@/lib/seo-tracking/view-model";
import { weekStartUtc } from "@/lib/seo-tracking/week";

/**
 * SEO-TRACK-1 PR B (log §341): what «Posición en Google» reads of the tracked
 * keywords. Reads go through the user's own client (RLS: the owner reads its
 * rows), filtered by project too. Writes never happen here.
 */

type Supabase = AuthenticatedContext["supabase"];

export type TopicActionView = TopicAction & { done: boolean };
export type TopicWithActions = TopicView & { actions: TopicActionView[] };

export type SeoTrackingData =
  /** Migration 0044 not applied: the screen stays as it was. */
  | { kind: "unavailable" }
  /** Switched off for this project in /debug. */
  | { kind: "off" }
  /** The plan has no keyword tracking (read-only account). */
  | { kind: "no_plan" }
  | {
      kind: "setup" | "ready";
      caps: SeoTrackingCaps;
      trackedCount: number;
      latestWeek: string | null;
      weeks: string[];
      topics: TopicWithActions[];
      rivals: Array<{ domain: string; referringDomains: number | null }>;
      own: { referringDomains: number | null } | null;
      discoveryLeft: number;
    };

export async function loadSeoTracking(
  supabase: Supabase,
  input: { projectId: string; ownerUserId: string; ownDomain: string; planId: string | null | undefined; ctr: CtrSignal[]; now?: Date }
): Promise<SeoTrackingData> {
  const now = input.now ?? new Date();
  const { projectId, ownerUserId } = input;

  const { data: flag, error: flagError } = await supabase.from("projects").select("seo_tracking_enabled").eq("id", projectId).maybeSingle();
  // A missing column means 0044 is not applied, and with it no tables either.
  if (flagError) return { kind: "unavailable" };
  if (flag?.seo_tracking_enabled === false) return { kind: "off" };

  const caps = seoTrackingCapsFor(input.planId);
  const currentWeek = weekStartUtc(now);
  const since = weekSeries(currentWeek, HISTORY_WEEKS + 1)[0];
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();

  const [topics, keywords, snapshots, competitors, states, runs] = await Promise.all([
    supabase.from("seo_topics").select("id, name, target_url, created_at").eq("project_id", projectId).eq("owner_user_id", ownerUserId).order("created_at"),
    supabase.from("seo_keywords").select("id, keyword, topic_id, tracked, created_at").eq("project_id", projectId).eq("owner_user_id", ownerUserId).order("created_at"),
    supabase
      .from("seo_serp_snapshots")
      .select("keyword_id, week_start, status, own_position, own_url, own_title, top10, has_local_pack, questions")
      .eq("project_id", projectId)
      .eq("owner_user_id", ownerUserId)
      .gte("week_start", since),
    supabase.from("seo_competitors").select("domain, is_own, referring_domains, created_at").eq("project_id", projectId).eq("owner_user_id", ownerUserId).order("created_at"),
    supabase.from("seo_action_states").select("topic_id, action_key").eq("project_id", projectId).eq("owner_user_id", ownerUserId),
    supabase.from("seo_discovery_runs").select("id", { count: "exact", head: true }).eq("owner_user_id", ownerUserId).gte("created_at", dayStart)
  ]);
  const errors = [topics.error, keywords.error, snapshots.error, competitors.error, states.error, runs.error];
  // Missing tables (0044 not applied) or a failed read: the screen stays as it was.
  if (errors.some(Boolean)) return { kind: "unavailable" };
  if (caps.keywords === 0) return { kind: "no_plan" };

  const view = buildTrackingView({
    topics: (topics.data ?? []) as TopicRow[],
    keywords: (keywords.data ?? []) as KeywordRow[],
    snapshots: (snapshots.data ?? []) as SnapshotRow[],
    currentWeek
  });

  const competitorRows = (competitors.data ?? []) as CompetitorRow[];
  const ownRow = competitorRows.find((c) => c.is_own) ?? null;
  const rivals = competitorRows
    .filter((c) => !c.is_own)
    .slice(0, caps.competitors)
    .map((c) => ({ domain: c.domain, referringDomains: c.referring_domains }));
  const done = new Set(((states.data ?? []) as Array<{ topic_id: string; action_key: string }>).map((s) => `${s.topic_id}|${s.action_key}`));

  const withActions: TopicWithActions[] = view.topics.map((topic) => {
    const actions =
      topic.id === NO_TOPIC_ID
        ? []
        : buildTopicActions({ topic, ownDomain: input.ownDomain, rivals, ownReferringDomains: ownRow?.referring_domains ?? null, ctr: input.ctr });
    return { ...topic, actions: actions.map((a) => ({ ...a, done: done.has(`${topic.id}|${a.key}`) })) };
  });

  return {
    kind: view.keywords.length ? "ready" : "setup",
    caps,
    trackedCount: view.keywords.length,
    latestWeek: view.latestWeek,
    weeks: view.weeks,
    topics: withActions,
    rivals,
    own: ownRow ? { referringDomains: ownRow.referring_domains } : null,
    discoveryLeft: Math.max(0, DISCOVERY_DAILY_LIMIT - (runs.count ?? 0))
  };
}

/** The first open step of up to three topics, best rule first: the «Qué hacer esta semana» of the Resumen. */
export function weeklyTodo(topics: TopicWithActions[], limit = 3) {
  return topics
    .flatMap((topic) => {
      const open = topic.actions.filter((a) => !a.done);
      return open.length ? [{ topicId: topic.id, topicName: topic.name, action: open[0], openCount: open.length }] : [];
    })
    .sort((a, b) => actionRank(a.action) - actionRank(b.action))
    .slice(0, limit);
}
