/**
 * SEARCH-SEO-1 Fase 3 — «Posición en Google».
 *
 * Pure model: turns the raw Search Console answers (Search Analytics rows and
 * URL Inspection verdicts) into what the screen and the Overview card show.
 * No fetch, no clock, no Supabase — the loader decides which windows and which
 * pages, this module decides what is said about them.
 *
 * Positions are Google's own averages (1 = top). A position "delta" is
 * expressed so that positive means better (moved up), which is how the screen
 * colours it.
 */

export type SearchTotals = {
  clicks: number;
  impressions: number;
  /** Google's impression-weighted average position; 0 when there is no data. */
  position: number;
};

export type DailyPoint = {
  date: string;
  clicks: number;
  impressions: number;
  /** Google's average position that day; absent where the caller did not read it. */
  position?: number;
};

export type QueryRow = {
  query: string;
  clicks: number;
  impressions: number;
  position: number;
};

/** One URL Inspection answer, reduced to the two fields we read. */
export type InspectionVerdict = {
  url: string;
  /** `inspectionResult.indexStatusResult.verdict`: PASS / NEUTRAL / FAIL / … */
  verdict: string | null;
  /** `inspectionResult.indexStatusResult.coverageState`, Google's own text. */
  coverageState: string | null;
};

export type SearchConsoleInput = {
  current: SearchTotals;
  previous: SearchTotals | null;
  daily: DailyPoint[];
  queries: QueryRow[];
  previousQueries: QueryRow[];
  inspections: InspectionVerdict[] | null;
};

export type Kpi = { value: number; deltaPct: number | null };

export type PositionKpi = {
  /** Average position, or null when Google returned no impressions at all. */
  value: number | null;
  /** previous − current: positive means the site moved up. */
  delta: number | null;
};

export type QueryView = {
  query: string;
  position: number;
  /** previous − current position; null when the query is new in the window. */
  movement: number | null;
  clicks: number;
  impressions: number;
  /** clicks / impressions, 0..1. */
  ctr: number;
  /** Page 2 of Google: positions 11–20, the cheapest wins. */
  nearPage1: boolean;
};

export type IndexSummary = {
  indexed: number;
  crawledNotIndexed: number;
  excludedNoindex: number;
  other: number;
  total: number;
};

export type SearchConsoleReport = {
  clicks: Kpi;
  impressions: Kpi;
  position: PositionKpi;
  daily: DailyPoint[];
  queries: QueryView[];
  nearPage1: QueryView[];
  index: IndexSummary | null;
  /** True when Google has no impressions for the property in the window. */
  empty: boolean;
};

export const PAGE_ONE_MAX_POSITION = 10;
export const NEAR_PAGE_ONE_MAX_POSITION = 20;

/** Percentage change, null when there is nothing to compare against. */
export function percentDelta(current: number, previous: number | null | undefined): number | null {
  if (previous == null || !Number.isFinite(previous) || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function isNearPageOne(position: number): boolean {
  return position > PAGE_ONE_MAX_POSITION && position <= NEAR_PAGE_ONE_MAX_POSITION;
}

export function buildQueryViews(current: QueryRow[], previous: QueryRow[]): QueryView[] {
  const prevByQuery = new Map<string, number>();
  for (const row of previous) {
    if (row.impressions > 0 && row.position > 0) prevByQuery.set(row.query, row.position);
  }
  return current
    .filter((row) => row.query.trim().length > 0 && row.impressions > 0 && row.position > 0)
    .map((row) => {
      const prev = prevByQuery.get(row.query);
      return {
        query: row.query,
        position: round1(row.position),
        movement: prev == null ? null : round1(prev - row.position),
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.impressions > 0 ? row.clicks / row.impressions : 0,
        nearPage1: isNearPageOne(row.position)
      };
    })
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions || a.position - b.position);
}

/**
 * Buckets URL Inspection answers. Google's `coverageState` is free text in
 * English ("Crawled - currently not indexed", "Excluded by 'noindex' tag"), so
 * only the two buckets the screen names are matched; everything else that is
 * not indexed is "other", never guessed into one of them.
 */
export function summarizeIndex(inspections: InspectionVerdict[] | null): IndexSummary | null {
  if (!inspections || inspections.length === 0) return null;
  const summary: IndexSummary = { indexed: 0, crawledNotIndexed: 0, excludedNoindex: 0, other: 0, total: 0 };
  for (const item of inspections) {
    summary.total += 1;
    const state = (item.coverageState ?? "").toLowerCase();
    if (item.verdict === "PASS") summary.indexed += 1;
    else if (state.includes("noindex")) summary.excludedNoindex += 1;
    else if (state.includes("crawled")) summary.crawledNotIndexed += 1;
    else summary.other += 1;
  }
  return summary;
}

export function buildSearchConsoleReport(input: SearchConsoleInput): SearchConsoleReport {
  const { current, previous } = input;
  const hasCurrent = current.impressions > 0;
  const hasPrevious = previous != null && previous.impressions > 0;
  const queries = buildQueryViews(input.queries, input.previousQueries);

  return {
    clicks: { value: current.clicks, deltaPct: percentDelta(current.clicks, previous?.clicks) },
    impressions: { value: current.impressions, deltaPct: percentDelta(current.impressions, previous?.impressions) },
    position: {
      value: hasCurrent ? round1(current.position) : null,
      delta: hasCurrent && hasPrevious ? round1(previous.position - current.position) : null
    },
    daily: [...input.daily].sort((a, b) => a.date.localeCompare(b.date)),
    queries,
    nearPage1: queries.filter((q) => q.nearPage1).sort((a, b) => b.impressions - a.impressions),
    index: summarizeIndex(input.inspections),
    empty: !hasCurrent
  };
}

/**
 * The 28-day window Search Console itself shows, ending 3 days ago because
 * Google's data lags 2–3 days. Dates are UTC `YYYY-MM-DD`, which is what the
 * API takes. `today` is injected so this stays pure.
 */
export function searchWindows(today: Date): {
  current: { startDate: string; endDate: string };
  previous: { startDate: string; endDate: string };
} {
  const day = 24 * 60 * 60 * 1000;
  const base = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const end = base - 3 * day;
  const start = end - 27 * day;
  const prevEnd = start - day;
  const prevStart = prevEnd - 27 * day;
  return {
    current: { startDate: iso(start), endDate: iso(end) },
    previous: { startDate: iso(prevStart), endDate: iso(prevEnd) }
  };
}
