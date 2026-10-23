/**
 * SEO-DIAG-0 (log §338): pure readers for DataForSEO responses. They keep only
 * what the operator diagnosis shows and never invent a value: a field the
 * response does not carry stays `null`, so the page prints «—» instead of 0.
 *
 * Every DataForSEO reply has the same envelope: `status_code` 20000 means OK,
 * `cost` is what the call charged in USD, and `tasks[0].result[0]` holds the
 * data. A task can fail inside an OK envelope, so both levels are checked.
 */

/** Bounds of one diagnosis, so its worst-case cost is known before pressing. */
export const MAX_SERP = 10;
export const MAX_SEEDS = 5;
export const MAX_GAP_COMPETITORS = 3;

export type DfsEnvelope = { ok: true; cost: number; result: Record<string, unknown> | null } | { ok: false; cost: number; code: number | null; message: string };

type Obj = Record<string, unknown>;
const obj = (value: unknown): Obj | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as Obj) : null);
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);

export function readEnvelope(body: unknown): DfsEnvelope {
  const root = obj(body);
  const cost = num(root?.cost) ?? 0;
  if (!root || root.status_code !== 20000) {
    return { ok: false, cost, code: num(root?.status_code), message: str(root?.status_message) ?? "respuesta no válida" };
  }
  const task = obj(arr(root.tasks)[0]);
  if (!task || task.status_code !== 20000) {
    return { ok: false, cost, code: num(task?.status_code), message: str(task?.status_message) ?? "tarea sin resultado" };
  }
  return { ok: true, cost: num(task.cost) ?? cost, result: obj(arr(task.result)[0]) };
}

export type RankedKeyword = { keyword: string; volume: number | null; difficulty: number | null; position: number | null; url: string | null; intent: string | null };

/** dataforseo_labs/google/ranked_keywords: what the domain already ranks for. */
export function readRankedKeywords(result: Obj | null): { total: number | null; items: RankedKeyword[] } {
  const items = arr(result?.items).flatMap((raw) => {
    const item = obj(raw);
    const data = obj(item?.keyword_data);
    const keyword = str(data?.keyword);
    if (!keyword) return [];
    const serp = obj(obj(item?.ranked_serp_element)?.serp_item);
    return [
      {
        keyword,
        volume: num(obj(data?.keyword_info)?.search_volume),
        difficulty: num(obj(data?.keyword_properties)?.keyword_difficulty),
        position: num(serp?.rank_group),
        url: str(serp?.url),
        intent: str(obj(data?.search_intent_info)?.main_intent)
      }
    ];
  });
  return { total: num(result?.total_count), items };
}

export type OrganicCompetitor = { domain: string; sharedKeywords: number | null; avgPosition: number | null; keywords: number | null; traffic: number | null };

/** dataforseo_labs/google/competitors_domain: who ranks for the same searches. */
export function readCompetitors(result: Obj | null): OrganicCompetitor[] {
  return arr(result?.items).flatMap((raw) => {
    const item = obj(raw);
    const domain = str(item?.domain);
    if (!domain) return [];
    const organic = obj(obj(item?.full_domain_metrics)?.organic) ?? obj(obj(item?.metrics)?.organic);
    return [
      {
        domain,
        sharedKeywords: num(item?.intersections),
        avgPosition: num(item?.avg_position),
        keywords: num(organic?.count),
        traffic: num(organic?.etv)
      }
    ];
  });
}

export type GapKeyword = { keyword: string; volume: number | null; difficulty: number | null; competitorPosition: number | null };

/** dataforseo_labs/google/domain_intersection with intersections=false: the competitor ranks, we don't. */
export function readKeywordGap(result: Obj | null): GapKeyword[] {
  return arr(result?.items).flatMap((raw) => {
    const item = obj(raw);
    const data = obj(item?.keyword_data);
    const keyword = str(data?.keyword);
    if (!keyword) return [];
    return [
      {
        keyword,
        volume: num(obj(data?.keyword_info)?.search_volume),
        difficulty: num(obj(data?.keyword_properties)?.keyword_difficulty),
        competitorPosition: num(obj(item?.first_domain_serp_element)?.rank_group)
      }
    ];
  });
}

export type KeywordIdea = { keyword: string; volume: number | null; difficulty: number | null; intent: string | null };

/** dataforseo_labs/google/keyword_ideas: related searches for a topic. */
export function readKeywordIdeas(result: Obj | null): KeywordIdea[] {
  return arr(result?.items).flatMap((raw) => {
    const item = obj(raw);
    const keyword = str(item?.keyword);
    if (!keyword) return [];
    return [
      {
        keyword,
        volume: num(obj(item?.keyword_info)?.search_volume),
        difficulty: num(obj(item?.keyword_properties)?.keyword_difficulty),
        intent: str(obj(item?.search_intent_info)?.main_intent)
      }
    ];
  });
}

export type SerpResult = {
  keyword: string;
  organic: { position: number; domain: string; url: string; title: string | null }[];
  ownPosition: number | null;
  /** The page of the own domain that ranks, when it is in the results. */
  ownUrl: string | null;
  /** The title Google shows for that page, as DataForSEO saw it. */
  ownTitle: string | null;
  hasLocalPack: boolean;
  questions: string[];
};

/** serp/google/organic/live/advanced: the real Top results for one search. */
export function readSerp(result: Obj | null, keyword: string, ownDomain: string): SerpResult {
  const items = arr(result?.items).map(obj).filter((item): item is Obj => item !== null);
  const organic = items.flatMap((item) => {
    const position = num(item.rank_group);
    const domain = str(item.domain);
    const url = str(item.url);
    return item.type === "organic" && position !== null && domain && url ? [{ position, domain, url, title: str(item.title) }] : [];
  });
  const own = ownDomain.replace(/^www\./, "");
  const mine = organic.find((row) => row.domain.replace(/^www\./, "") === own || row.domain.endsWith(`.${own}`));
  const questions = items
    .filter((item) => item.type === "people_also_ask")
    .flatMap((item) => arr(item.items).flatMap((q) => str(obj(q)?.title) ?? []));
  return {
    keyword,
    organic,
    ownPosition: mine?.position ?? null,
    ownUrl: mine?.url ?? null,
    ownTitle: mine?.title ?? null,
    hasLocalPack: items.some((item) => item.type === "local_pack" || item.type === "map"),
    questions
  };
}

export type BacklinkSummary = { backlinks: number | null; referringDomains: number | null; rank: number | null };

/** backlinks/summary: how many sites link to a domain. */
export function readBacklinkSummary(result: Obj | null): BacklinkSummary {
  return { backlinks: num(result?.backlinks), referringDomains: num(result?.referring_domains), rank: num(result?.rank) };
}
