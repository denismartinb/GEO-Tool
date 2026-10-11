import { describe, expect, it } from "vitest";
import type { PageView } from "@/lib/search-console/insights";
import type { QueryView } from "@/lib/search-console/report";
import { buildGoogleRecommendations, googleRecKey } from "@/lib/search-console/recommendations";

const q = (query: string, position: number, impressions: number): QueryView => ({
  query,
  position,
  movement: null,
  clicks: 0,
  impressions,
  ctr: 0,
  nearPage1: position > 10 && position <= 20
});

const page = (url: string, position: number, clicks: number): PageView => ({
  page: url,
  path: new URL(url).pathname,
  clicks,
  impressions: clicks * 10,
  position,
  queryCount: 1,
  audit: { kind: "unaudited" }
});

const base = {
  report: { nearPage1: [] as QueryView[], empty: false },
  pageByQuery: {} as Record<string, string>,
  pages: [] as PageView[],
  ctr: [],
  questions: []
};

describe("buildGoogleRecommendations", () => {
  it("returns nothing when Google has no impressions", () => {
    expect(
      buildGoogleRecommendations({ ...base, report: { nearPage1: [q("a", 12, 100)], empty: true } })
    ).toEqual([]);
  });

  it("pushes the page-2 query Google shows most, linking from other page-1 pages", () => {
    const [card] = buildGoogleRecommendations({
      ...base,
      report: { nearPage1: [q("aparecer en chatgpt", 12.4, 2210), q("otra", 15, 300)], empty: false },
      pageByQuery: { "aparecer en chatgpt": "https://ex.com/blog/aparecer" },
      pages: [
        page("https://ex.com/", 3, 90),
        page("https://ex.com/blog/aparecer", 12, 5),
        page("https://ex.com/blog/que-es-geo", 6, 40),
        page("https://ex.com/precios", 4, 10),
        page("https://ex.com/lejos", 30, 99)
      ]
    });
    expect(card).toEqual({
      kind: "push_page_one",
      query: "aparecer en chatgpt",
      position: 12.4,
      impressions: 2210,
      page: "https://ex.com/blog/aparecer",
      linkFrom: ["https://ex.com/", "https://ex.com/blog/que-es-geo"]
    });
  });

  it("never links a page to itself and drops a non-web page", () => {
    const [card] = buildGoogleRecommendations({
      ...base,
      report: { nearPage1: [q("x", 14, 80)], empty: false },
      pageByQuery: { x: "javascript:alert(1)" },
      pages: [page("https://ex.com/a", 2, 5)]
    });
    expect(card).toMatchObject({ page: null, linkFrom: ["https://ex.com/a"] });
  });

  it("takes the strongest CTR opportunity and the first untracked question, in the design's order", () => {
    const cards = buildGoogleRecommendations({
      ...base,
      ctr: [
        { query: "precio", position: 3.2, impressions: 1240, ctr: 0.008, benchmark: 0.1, page: "https://ex.com/precios" },
        { query: "otra", position: 5, impressions: 200, ctr: 0.01, benchmark: 0.1, page: null }
      ],
      questions: [
        { query: "qué es geo", position: 4, impressions: 500, tracked: true },
        { query: "cuál es la mejor herramienta geo", position: 9.1, impressions: 300, tracked: false }
      ]
    });
    expect(cards.map((c) => c.kind)).toEqual(["improve_snippet", "watch_in_ai"]);
    expect(cards[0]).toMatchObject({ query: "precio", page: "https://ex.com/precios", benchmark: 0.1 });
    expect(cards[1]).toMatchObject({ query: "cuál es la mejor herramienta geo", position: 9.1 });
  });

  it("asks nothing when every question is already tracked", () => {
    expect(
      buildGoogleRecommendations({ ...base, questions: [{ query: "qué es geo", position: 4, impressions: 5, tracked: true }] })
    ).toEqual([]);
  });

  it("skips a card the customer already handled and offers the next one of the same kind (log §294)", () => {
    const cards = buildGoogleRecommendations({
      ...base,
      report: { nearPage1: [q("primera", 12, 900), q("segunda", 14, 400)], empty: false },
      ctr: [
        { query: "precio", position: 3, impressions: 1000, ctr: 0.01, benchmark: 0.1, page: null },
        { query: "plan", position: 4, impressions: 500, ctr: 0.01, benchmark: 0.1, page: null }
      ],
      questions: [
        { query: "qué es geo", position: 4, impressions: 500, tracked: false },
        { query: "cómo medir geo", position: 6, impressions: 200, tracked: false }
      ],
      hidden: new Set([
        googleRecKey("push_page_one", "primera"),
        googleRecKey("improve_snippet", "precio"),
        googleRecKey("watch_in_ai", "qué es geo")
      ])
    });
    expect(cards.map((c) => c.query)).toEqual(["segunda", "plan", "cómo medir geo"]);
  });

  it("only hides the same advice: a query handled under one kind still shows under another", () => {
    const cards = buildGoogleRecommendations({
      ...base,
      report: { nearPage1: [q("geo", 12, 900)], empty: false },
      hidden: new Set([googleRecKey("improve_snippet", "geo")])
    });
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ kind: "push_page_one", query: "geo" });
  });
});
