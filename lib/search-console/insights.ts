/**
 * SEARCH-SEO-1 Fase 3b — what «Posición en Google» reads from Search Console
 * beyond the totals (log §287).
 *
 * Pure model, like `report.ts`: no fetch, no clock, no Supabase. The loader
 * passes Google's rows; this module decides what is said about them. Every
 * benchmark is the site's own data, never an industry curve: "the CTR you
 * usually get in that position" is the CTR of the site's other queries in the
 * same tier, which is a fact about its Search Console and not an estimate.
 */

import type { QueryView } from "@/lib/search-console/report";

/** One Search Analytics row with two dimensions, `query` and `page`. */
export type QueryPageRow = { query: string; page: string; clicks: number; impressions: number; position: number };

export type PageRow = { page: string; clicks: number; impressions: number; position: number };

export type DeviceRow = { device: string; clicks: number; impressions: number; position: number };

// ── Position tiers ──────────────────────────────────────────────────────────

export type TierKey = "top3" | "page1" | "page2" | "beyond";

export const TIERS: Array<{ key: TierKey; label: string; range: string; max: number }> = [
  { key: "top3", label: "Top 3", range: "Puestos 1 a 3", max: 3 },
  { key: "page1", label: "Resto de la página 1", range: "Puestos 4 a 10", max: 10 },
  { key: "page2", label: "Página 2", range: "Puestos 11 a 20", max: 20 },
  { key: "beyond", label: "Más allá", range: "Puesto 21 o peor", max: Number.POSITIVE_INFINITY }
];

export function tierOf(position: number): TierKey {
  return TIERS.find((t) => position <= t.max)!.key;
}

export type TierShare = { key: TierKey; label: string; range: string; count: number; share: number };

/** How many of the site's queries fall in each tier, as a share of all of them. */
export function positionTiers(queries: QueryView[]): TierShare[] {
  const total = queries.length;
  return TIERS.map((tier) => {
    const count = queries.filter((q) => tierOf(q.position) === tier.key).length;
    return { key: tier.key, label: tier.label, range: tier.range, count, share: total > 0 ? count / total : 0 };
  });
}

/** Google returns the property's own http(s) URLs; anything else is never linked or counted. */
export function isWebUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

// ── Which page ranks for each query ─────────────────────────────────────────

function byImpressionsThenClicks<T extends { impressions: number; clicks: number }>(a: T, b: T): number {
  return b.impressions - a.impressions || b.clicks - a.clicks;
}

/** The page Google shows most for each query (most impressions). */
export function topPageByQuery(rows: QueryPageRow[]): Map<string, string> {
  const best = new Map<string, QueryPageRow>();
  for (const row of rows) {
    if (!row.query || !isWebUrl(row.page) || row.impressions <= 0) continue;
    const current = best.get(row.query);
    if (!current || byImpressionsThenClicks(row, current) < 0) best.set(row.query, row);
  }
  return new Map([...best].map(([query, row]) => [query, row.page]));
}

// ── Pages ───────────────────────────────────────────────────────────────────

/** The SEO problems the latest audit found on a page; null when it was fetched but not analyzed. */
export type AuditedPage = { url: string; seoIssues: number | null };

export type PageAuditState = { kind: "issues"; count: number } | { kind: "ok" } | { kind: "unaudited" };

export type PageView = {
  page: string;
  /** Path for display: "/precios", "/" for the home. */
  path: string;
  clicks: number;
  impressions: number;
  position: number;
  /** Distinct queries this page appears for, among the rows Google returned. */
  queryCount: number;
  audit: PageAuditState;
};

export const PAGE_VIEW_LIMIT = 10;

/** host + path, without scheme, `www.`, query, hash or trailing slash. */
export function urlKey(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${host}${path}`;
  } catch {
    return null;
  }
}

export function displayPath(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname || "/";
  } catch {
    return url;
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function buildPageViews(pages: PageRow[], queryPages: QueryPageRow[], audited: AuditedPage[]): PageView[] {
  const queriesByPage = new Map<string, Set<string>>();
  for (const row of queryPages) {
    const key = urlKey(row.page);
    if (!key || !row.query) continue;
    const set = queriesByPage.get(key) ?? new Set<string>();
    set.add(row.query);
    queriesByPage.set(key, set);
  }
  const auditByKey = new Map<string, AuditedPage>();
  for (const page of audited) {
    const key = urlKey(page.url);
    if (key && !auditByKey.has(key)) auditByKey.set(key, page);
  }
  return pages
    .filter((p) => isWebUrl(p.page) && p.impressions > 0 && p.position > 0)
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, PAGE_VIEW_LIMIT)
    .map((p) => {
      const key = urlKey(p.page);
      const audit = key ? auditByKey.get(key) : undefined;
      const state: PageAuditState =
        !audit || audit.seoIssues === null
          ? { kind: "unaudited" }
          : audit.seoIssues > 0
            ? { kind: "issues", count: audit.seoIssues }
            : { kind: "ok" };
      return {
        page: p.page,
        path: displayPath(p.page),
        clicks: p.clicks,
        impressions: p.impressions,
        position: round1(p.position),
        queryCount: key ? (queriesByPage.get(key)?.size ?? 0) : 0,
        audit: state
      };
    });
}

// ── «Te ven, pero no entran» ────────────────────────────────────────────────

export type CtrOpportunity = {
  query: string;
  position: number;
  impressions: number;
  ctr: number;
  /** The site's own CTR on its other queries of the same tier. */
  benchmark: number;
  page: string | null;
};

/** Below this, a low CTR is noise: a handful of impressions decides nothing. */
export const CTR_MIN_IMPRESSIONS = 50;
/** Flag a query getting less than half of the site's own CTR for its tier. */
export const CTR_SHORTFALL_RATIO = 0.5;
/** The benchmark needs a few other queries in the tier to mean anything. */
const CTR_MIN_PEERS = 3;
export const CTR_OPPORTUNITY_LIMIT = 5;

/**
 * Queries already on page 1 that many people see and few click. Fixing the
 * title and description is the cheapest win there: no position to gain.
 */
export function findCtrOpportunities(queries: QueryView[], pageByQuery: Map<string, string>): CtrOpportunity[] {
  const out: CtrOpportunity[] = [];
  for (const tier of ["top3", "page1"] as const) {
    const inTier = queries.filter((q) => tierOf(q.position) === tier);
    for (const q of inTier) {
      if (q.impressions < CTR_MIN_IMPRESSIONS) continue;
      const peers = inTier.filter((p) => p.query !== q.query);
      if (peers.length < CTR_MIN_PEERS) continue;
      const peerImpressions = peers.reduce((sum, p) => sum + p.impressions, 0);
      const peerClicks = peers.reduce((sum, p) => sum + p.clicks, 0);
      if (peerImpressions <= 0 || peerClicks <= 0) continue;
      const benchmark = peerClicks / peerImpressions;
      if (q.ctr >= benchmark * CTR_SHORTFALL_RATIO) continue;
      out.push({
        query: q.query,
        position: q.position,
        impressions: q.impressions,
        ctr: q.ctr,
        benchmark,
        page: pageByQuery.get(q.query) ?? null
      });
    }
  }
  const missed = (o: CtrOpportunity) => o.impressions * o.benchmark - o.impressions * o.ctr;
  return out.sort((a, b) => missed(b) - missed(a)).slice(0, CTR_OPPORTUNITY_LIMIT);
}

// ── Questions people ask Google ─────────────────────────────────────────────

const QUESTION_START =
  /^(?:¿\s*)?(?:qué|que|cómo|como|cuál|cual|cuáles|cuales|cuánto|cuanto|cuánta|cuanta|cuántos|cuantos|cuántas|cuantas|dónde|donde|cuándo|cuando|quién|quien|quiénes|quienes|por qué|porque|para qué|es|son|se puede|puedo|hay|merece|vale la pena|what|how|which|why|where|who|is|can|does)(?=[\s?]|$)/iu;

export function isQuestionQuery(query: string): boolean {
  const q = query.trim().toLowerCase();
  return q.includes("?") || QUESTION_START.test(q);
}

const STOPWORDS = new Set(
  "a al con de del el en es la las lo los mi mis me para por que qué se su sus un una uno y o como cómo cual cuál cuales cuáles mejor mejores hay son the of to in for and or is are what how best".split(
    " "
  )
);

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

/**
 * True when every meaningful word of the query is in one tracked prompt:
 * «mejor herramienta geo» is covered by «¿Cuál es la mejor herramienta GEO
 * para pymes?». A query with no meaningful word is never «already tracked».
 */
export function isTrackedQuestion(query: string, prompts: string[]): boolean {
  const words = normalizeWords(query);
  if (words.length === 0) return false;
  return prompts.some((prompt) => {
    const promptWords = new Set(normalizeWords(prompt));
    return words.every((w) => promptWords.has(w));
  });
}

export type QuestionQuery = {
  query: string;
  position: number;
  impressions: number;
  tracked: boolean;
};

export const QUESTION_LIMIT = 6;

export function findQuestionQueries(queries: QueryView[], prompts: string[]): QuestionQuery[] {
  return queries
    .filter((q) => isQuestionQuery(q.query))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, QUESTION_LIMIT)
    .map((q) => ({ query: q.query, position: q.position, impressions: q.impressions, tracked: isTrackedQuestion(q.query, prompts) }));
}

// ── Devices ─────────────────────────────────────────────────────────────────

export type DeviceKey = "mobile" | "desktop" | "tablet";

export type DeviceView = {
  device: DeviceKey;
  label: string;
  position: number;
  ctr: number;
  impressionShare: number;
};

const DEVICE_LABELS: Record<DeviceKey, string> = { mobile: "Móvil", desktop: "Ordenador", tablet: "Tableta" };

/** Mobile and desktop always, tablet only when Google has data for it. */
export function buildDeviceViews(rows: DeviceRow[]): DeviceView[] {
  const total = rows.reduce((sum, r) => sum + r.impressions, 0);
  if (total <= 0) return [];
  return (["mobile", "desktop", "tablet"] as const)
    .map((device) => {
      const row = rows.find((r) => r.device.toLowerCase() === device);
      if (!row || row.impressions <= 0) return null;
      return {
        device,
        label: DEVICE_LABELS[device],
        position: round1(row.position),
        ctr: row.clicks / row.impressions,
        impressionShare: row.impressions / total
      };
    })
    .filter((d): d is DeviceView => d !== null);
}

// ── Two pages competing for one query ───────────────────────────────────────

export type CompetingPage = { page: string; path: string; position: number; share: number };

export type Cannibalization = { query: string; impressions: number; pages: CompetingPage[] };

export const CANNIBAL_MIN_IMPRESSIONS = 20;
/** Each competing page must hold at least this share of the query's impressions. */
export const CANNIBAL_MIN_SHARE = 0.2;
export const CANNIBAL_LIMIT = 4;

export function findCannibalization(rows: QueryPageRow[]): Cannibalization[] {
  const byQuery = new Map<string, QueryPageRow[]>();
  for (const row of rows) {
    if (!row.query || !isWebUrl(row.page) || row.impressions <= 0) continue;
    byQuery.set(row.query, [...(byQuery.get(row.query) ?? []), row]);
  }
  const out: Cannibalization[] = [];
  for (const [query, group] of byQuery) {
    const total = group.reduce((sum, r) => sum + r.impressions, 0);
    if (total < CANNIBAL_MIN_IMPRESSIONS) continue;
    const pages = group
      .filter((r) => r.impressions / total >= CANNIBAL_MIN_SHARE)
      .sort(byImpressionsThenClicks)
      .map((r) => ({ page: r.page, path: displayPath(r.page), position: round1(r.position), share: r.impressions / total }));
    if (pages.length >= 2) out.push({ query, impressions: total, pages });
  }
  return out.sort((a, b) => b.impressions - a.impressions).slice(0, CANNIBAL_LIMIT);
}
