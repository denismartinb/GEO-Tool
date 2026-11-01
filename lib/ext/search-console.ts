import { urlKey } from "@/lib/search-console/insights";
import type { SearchConsoleScreen } from "@/lib/search-console/load";

/**
 * EXT-GSC-1/2 (log §409, §411): the Search Console state of one project, as
 * the Chrome panel shows it. The same data «Posición en Google» reads
 * (`loadSearchConsoleScreen`: our database first, then Google with the
 * 30-minute cache, without the indexing inspections), reduced to what the
 * panel paints. A figure Google did not give is never invented; a feature
 * that cannot work ("off") paints nothing.
 *
 * `clicks`, `position` and `nearPage1` keep their first (§409) flat shape so
 * a panel that only knows them still reads them; the richer figures travel in
 * `trend` and `page`.
 */
export type ExtGscQuery = { query: string; position: number; movement: number | null; clicks: number; impressions: number };

export type ExtSearchConsole =
  | {
      state: "connected";
      clicks: number;
      position: number | null;
      nearPage1: number;
      empty: boolean;
      trend: {
        clicksDeltaPct: number | null;
        impressions: number;
        impressionsDeltaPct: number | null;
        /** previous − current: positive means the site moved up. */
        positionDelta: number | null;
        daily: { date: string; clicks: number; impressions: number; position: number | null }[];
        /** The queries with the most clicks. */
        queries: ExtGscQuery[];
        /** Positions 11–20, most impressions first. */
        near: ExtGscQuery[];
      };
      /** The open page, when it is one of the pages Google returned. */
      page: { clicks: number; impressions: number; position: number; queries: ExtGscQuery[] } | null;
    }
  | { state: "disconnected" | "reconnect" | "pick_property" | "error" | "off" };

const TOP_QUERIES = 4;
const NEAR_QUERIES = 3;
const PAGE_QUERIES = 3;

const view = (q: { query: string; position: number; movement: number | null; clicks: number; impressions: number }): ExtGscQuery => ({
  query: q.query,
  position: q.position,
  movement: q.movement,
  clicks: q.clicks,
  impressions: q.impressions
});

export function toExtSearchConsole(screen: SearchConsoleScreen | null, ownUrl: string | null = null): ExtSearchConsole {
  if (!screen) return { state: "error" };
  switch (screen.kind) {
    case "ready": {
      const { report: r, insights } = screen;
      const key = ownUrl ? urlKey(ownUrl) : null;
      const pageView = key ? insights.pages.find((p) => urlKey(p.page) === key) : undefined;
      const pageQueries = key
        ? r.queries.filter((q) => {
            const page = insights.pageByQuery[q.query];
            return page ? urlKey(page) === key : false;
          })
        : [];
      return {
        state: "connected",
        clicks: r.clicks.value,
        position: r.position.value,
        nearPage1: r.nearPage1.length,
        empty: r.empty,
        trend: {
          clicksDeltaPct: r.clicks.deltaPct,
          impressions: r.impressions.value,
          impressionsDeltaPct: r.impressions.deltaPct,
          positionDelta: r.position.delta,
          daily: r.daily.map((d) => ({
            date: d.date,
            clicks: d.clicks,
            impressions: d.impressions,
            // A day without impressions has no position, never a 0.
            position: d.impressions > 0 && d.position && d.position > 0 ? Math.round(d.position * 10) / 10 : null
          })),
          queries: r.queries.filter((q) => q.clicks > 0).slice(0, TOP_QUERIES).map(view),
          near: r.nearPage1.slice(0, NEAR_QUERIES).map(view)
        },
        page: pageView
          ? {
              clicks: pageView.clicks,
              impressions: pageView.impressions,
              position: Math.round(pageView.position * 10) / 10,
              queries: pageQueries.slice(0, PAGE_QUERIES).map(view)
            }
          : null
      };
    }
    case "disconnected":
    case "reconnect":
    case "pick_property":
    case "error":
      return { state: screen.kind };
    default:
      return { state: "off" };
  }
}
