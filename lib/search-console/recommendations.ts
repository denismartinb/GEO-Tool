import { isWebUrl, urlKey, type CtrOpportunity, type PageView, type QuestionQuery } from "@/lib/search-console/insights";
import { PAGE_ONE_MAX_POSITION, type SearchConsoleReport } from "@/lib/search-console/report";

/**
 * Recommendations from the customer's own Search Console (SEARCH-SEO-1 Fase 3d,
 * log §293, design in docs/design-reference/search-seo-1/fase-3b/Recs.dc.html).
 *
 * Computed live on every load from the rows `loadSearchConsoleScreen` already
 * read: a card exists because Google says so today, and goes away by itself
 * when the number improves. Only what the customer did with a card is stored
 * (`hidden`, log §294). Each card carries the Google
 * figures that justify it; the copy is built from them in the component.
 */

/** A page-2 query worth pushing: the one Google shows most among positions 11–20. */
export type PushToPageOne = {
  kind: "push_page_one";
  query: string;
  position: number;
  impressions: number;
  /** The page Google shows for it, when it is a real web URL. */
  page: string | null;
  /** Up to two other pages of the site already on page 1, to link from. */
  linkFrom: string[];
};

/** A query on page 1 that many people see and few click (`findCtrOpportunities`). */
export type ImproveSnippet = {
  kind: "improve_snippet";
  query: string;
  position: number;
  impressions: number;
  ctr: number;
  /** The site's own CTR on its other queries of the same tier. */
  benchmark: number;
  page: string | null;
};

/** A question people already ask Google that the AI scan does not track yet. */
export type WatchInAi = {
  kind: "watch_in_ai";
  query: string;
  position: number;
  impressions: number;
};

export type GoogleRecommendation = PushToPageOne | ImproveSnippet | WatchInAi;

export type GoogleRecKind = GoogleRecommendation["kind"];

/**
 * Identity of a card across loads: the same kind for the same query is the
 * same advice. The key of a «Marcar como hecho» / «Ahora no» row (log §294).
 */
export function googleRecKey(kind: GoogleRecKind, query: string): string {
  return `${kind}\u0000${query}`;
}

export const LINK_FROM_LIMIT = 2;

function pagesOnPageOne(pages: PageView[], exclude: string | null): string[] {
  const excludeKey = exclude ? urlKey(exclude) : null;
  return pages
    .filter((p) => p.position <= PAGE_ONE_MAX_POSITION && isWebUrl(p.page) && urlKey(p.page) !== excludeKey)
    .sort((a, b) => b.clicks - a.clicks || a.position - b.position)
    .slice(0, LINK_FROM_LIMIT)
    .map((p) => p.page);
}

/**
 * One card per kind at most, in the design's order. Each kind takes its single
 * strongest case: the screen already lists the rest, and three cards that
 * repeat the same advice would bury the AI recommendations below them.
 */
export function buildGoogleRecommendations(input: {
  report: Pick<SearchConsoleReport, "nearPage1" | "empty">;
  pageByQuery: Record<string, string>;
  pages: PageView[];
  ctr: CtrOpportunity[];
  questions: QuestionQuery[];
  /** `googleRecKey`s the customer already marked done or set aside (log §294). */
  hidden?: ReadonlySet<string>;
}): GoogleRecommendation[] {
  if (input.report.empty) return [];
  const out: GoogleRecommendation[] = [];
  const hidden = input.hidden ?? new Set<string>();
  const visible = (kind: GoogleRecKind, query: string) => !hidden.has(googleRecKey(kind, query));

  // `nearPage1` is already sorted by impressions, highest first. A card the
  // customer already handled gives way to the next case of the same kind.
  const push = input.report.nearPage1.find((q) => visible("push_page_one", q.query));
  if (push) {
    const raw = input.pageByQuery[push.query] ?? null;
    const page = raw && isWebUrl(raw) ? raw : null;
    out.push({
      kind: "push_page_one",
      query: push.query,
      position: push.position,
      impressions: push.impressions,
      page,
      linkFrom: pagesOnPageOne(input.pages, page)
    });
  }

  const snippet = input.ctr.find((o) => visible("improve_snippet", o.query));
  if (snippet) {
    out.push({
      kind: "improve_snippet",
      query: snippet.query,
      position: snippet.position,
      impressions: snippet.impressions,
      ctr: snippet.ctr,
      benchmark: snippet.benchmark,
      page: snippet.page && isWebUrl(snippet.page) ? snippet.page : null
    });
  }

  const question = input.questions.find((q) => !q.tracked && visible("watch_in_ai", q.query));
  if (question) {
    out.push({ kind: "watch_in_ai", query: question.query, position: question.position, impressions: question.impressions });
  }

  return out;
}
