import "server-only";

import { callDataForSeo, SPAIN } from "@/lib/seo-data/dataforseo";
import { readKeywordGap, readKeywordIdeas } from "@/lib/seo-data/dataforseo-parse";
import { cleanSeed, mergeRivalGaps, shapeSeedIdeas, type DiscoveredKeyword } from "@/lib/seo-tracking/discover-pure";
import { DISCOVERY_DAILY_LIMIT, discoveryRunsToday, recordDiscoveryRun } from "@/lib/seo-tracking/manage";
import type { createServiceClient } from "@/lib/supabase/service";

/**
 * SEO-TRACK-1 PR B (log §346): the two searches of «Descubrir palabras».
 * Five a day per account, shared by both. A search counts once it reached
 * DataForSEO (it may have cost money), so a provider failure still uses one;
 * a refusal before calling (no rivals, bad seed, limit reached) does not.
 * Same service-role contract as `manage.ts`: ids already verified by the
 * caller, every read and write filtered by project and owner.
 */

type Service = ReturnType<typeof createServiceClient>;

/** Two server-action calls must fit well inside the function's time. */
const CALL_TIMEOUT_MS = 25_000;

export type DiscoverResult =
  | { status: "ok"; items: DiscoveredKeyword[]; left: number }
  | { status: "limit" }
  | { status: "no_rivals" }
  | { status: "invalid" }
  | { status: "unavailable" }
  | { status: "provider"; left: number };

async function trackedKeywords(service: Service, projectId: string, ownerUserId: string): Promise<Set<string> | null> {
  const { data, error } = await service
    .from("seo_keywords")
    .select("keyword")
    .eq("project_id", projectId)
    .eq("owner_user_id", ownerUserId)
    .eq("tracked", true);
  if (error) return null;
  return new Set((data ?? []).map((row) => row.keyword as string));
}

async function quota(service: Service, ownerUserId: string): Promise<number | null> {
  const used = await discoveryRunsToday(service, ownerUserId, new Date());
  return used === null ? null : Math.max(0, DISCOVERY_DAILY_LIMIT - used);
}

export async function discoverFromSeedCore(service: Service, input: { projectId: string; ownerUserId: string; seed: string }): Promise<DiscoverResult> {
  const seed = cleanSeed(input.seed);
  if (!seed) return { status: "invalid" };
  const tracked = await trackedKeywords(service, input.projectId, input.ownerUserId);
  const left = await quota(service, input.ownerUserId);
  if (tracked === null || left === null) return { status: "unavailable" };
  if (left <= 0) return { status: "limit" };

  const reply = await callDataForSeo(
    "dataforseo_labs/google/keyword_suggestions/live",
    { keyword: seed, ...SPAIN, limit: 100, include_seed_keyword: true, order_by: ["keyword_info.search_volume,desc"] },
    CALL_TIMEOUT_MS
  );
  await recordDiscoveryRun(service, { projectId: input.projectId, ownerUserId: input.ownerUserId, kind: "seed", costUsd: reply.cost });
  if (!reply.ok) return { status: "provider", left: left - 1 };
  return { status: "ok", items: shapeSeedIdeas(readKeywordIdeas(reply.result), tracked, seed), left: left - 1 };
}

export async function discoverFromRivalsCore(
  service: Service,
  input: { projectId: string; ownerUserId: string; ownDomain: string; rivalCap: number }
): Promise<DiscoverResult> {
  const { data: rivals, error } = await service
    .from("seo_competitors")
    .select("domain, created_at")
    .eq("project_id", input.projectId)
    .eq("owner_user_id", input.ownerUserId)
    .eq("is_own", false)
    .order("created_at", { ascending: true });
  if (error) return { status: "unavailable" };
  const domains = (rivals ?? []).slice(0, input.rivalCap).map((row) => row.domain as string);
  if (!domains.length) return { status: "no_rivals" };
  const tracked = await trackedKeywords(service, input.projectId, input.ownerUserId);
  const left = await quota(service, input.ownerUserId);
  if (tracked === null || left === null) return { status: "unavailable" };
  if (left <= 0) return { status: "limit" };

  const replies = await Promise.all(
    domains.map(async (domain) => ({
      domain,
      reply: await callDataForSeo(
        "dataforseo_labs/google/domain_intersection/live",
        { target1: domain, target2: input.ownDomain, intersections: false, ...SPAIN, limit: 50, order_by: ["keyword_data.keyword_info.search_volume,desc"] },
        CALL_TIMEOUT_MS
      )
    }))
  );
  const cost = replies.reduce((sum, r) => sum + r.reply.cost, 0);
  await recordDiscoveryRun(service, { projectId: input.projectId, ownerUserId: input.ownerUserId, kind: "rivals", costUsd: cost });
  const ok = replies.filter((r) => r.reply.ok);
  if (!ok.length) return { status: "provider", left: left - 1 };
  const items = mergeRivalGaps(
    ok.map((r) => ({ domain: r.domain, items: r.reply.ok ? readKeywordGap(r.reply.result) : [] })),
    tracked
  );
  return { status: "ok", items, left: left - 1 };
}
