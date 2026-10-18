import { describe, expect, it } from "vitest";
import {
  readBacklinkSummary,
  readCompetitors,
  readEnvelope,
  readKeywordGap,
  readKeywordIdeas,
  readRankedKeywords,
  readSerp
} from "./dataforseo-parse";

const ok = (result: unknown, cost = 0.01) => ({ status_code: 20000, cost, tasks: [{ status_code: 20000, cost, result: [result] }] });

describe("readEnvelope", () => {
  it("returns the first result and the task cost", () => {
    expect(readEnvelope(ok({ a: 1 }, 0.0125))).toEqual({ ok: true, cost: 0.0125, result: { a: 1 } });
  });

  it("fails on an envelope error and keeps its code", () => {
    expect(readEnvelope({ status_code: 40100, status_message: "Not authorized", cost: 0 })).toEqual({
      ok: false,
      cost: 0,
      code: 40100,
      message: "Not authorized"
    });
  });

  it("fails when the task inside an OK envelope failed", () => {
    const body = { status_code: 20000, cost: 0, tasks: [{ status_code: 40204, status_message: "Access denied", cost: 0 }] };
    expect(readEnvelope(body)).toMatchObject({ ok: false, code: 40204, message: "Access denied" });
  });

  it("does not throw on garbage", () => {
    expect(readEnvelope(null)).toMatchObject({ ok: false, code: null });
  });
});

describe("readers", () => {
  it("ranked keywords keep missing values as null, never 0", () => {
    const parsed = readRankedKeywords({
      total_count: 2,
      items: [
        {
          keyword_data: { keyword: "herramienta geo", keyword_info: { search_volume: 90 }, keyword_properties: { keyword_difficulty: 12 } },
          ranked_serp_element: { serp_item: { rank_group: 14, url: "https://genscore.es/" } }
        },
        { keyword_data: { keyword: "geo" } },
        { keyword_data: {} }
      ]
    });
    expect(parsed.total).toBe(2);
    expect(parsed.items).toEqual([
      { keyword: "herramienta geo", volume: 90, difficulty: 12, position: 14, url: "https://genscore.es/", intent: null },
      { keyword: "geo", volume: null, difficulty: null, position: null, url: null, intent: null }
    ]);
  });

  it("competitors, gap and ideas read their own shapes", () => {
    expect(readCompetitors({ items: [{ domain: "peec.ai", intersections: 30, avg_position: 8.5, full_domain_metrics: { organic: { count: 900, etv: 1200 } } }] })).toEqual([
      { domain: "peec.ai", sharedKeywords: 30, avgPosition: 8.5, keywords: 900, traffic: 1200 }
    ]);
    expect(readKeywordGap({ items: [{ keyword_data: { keyword: "ai visibility", keyword_info: { search_volume: 50 } }, first_domain_serp_element: { rank_group: 3 } }] })).toEqual([
      { keyword: "ai visibility", volume: 50, difficulty: null, competitorPosition: 3 }
    ]);
    expect(readKeywordIdeas({ items: [{ keyword: "seo ia", keyword_info: { search_volume: 320 }, search_intent_info: { main_intent: "informational" } }] })).toEqual([
      { keyword: "seo ia", volume: 320, difficulty: null, intent: "informational" }
    ]);
  });

  it("serp finds the own domain (with www or subdomain), the map and the questions", () => {
    const serp = readSerp(
      {
        items: [
          { type: "local_pack", title: "x" },
          { type: "organic", rank_group: 1, domain: "www.semrush.com", url: "https://www.semrush.com/", title: "Semrush" },
          { type: "people_also_ask", items: [{ title: "¿Qué es GEO?" }] },
          { type: "organic", rank_group: 2, domain: "www.genscore.es", url: "https://www.genscore.es/geo", title: "GEO" }
        ]
      },
      "qué es geo",
      "genscore.es"
    );
    expect(serp.ownPosition).toBe(2);
    expect(serp.hasLocalPack).toBe(true);
    expect(serp.questions).toEqual(["¿Qué es GEO?"]);
    expect(serp.organic).toHaveLength(2);
    expect(readSerp({ items: [] }, "x", "genscore.es")).toMatchObject({ ownPosition: null, hasLocalPack: false });
  });

  it("does not take a lookalike domain as the own one", () => {
    const serp = readSerp({ items: [{ type: "organic", rank_group: 1, domain: "notgenscore.es", url: "https://notgenscore.es/" }] }, "x", "genscore.es");
    expect(serp.ownPosition).toBeNull();
  });

  it("backlink summary", () => {
    expect(readBacklinkSummary({ backlinks: 40, referring_domains: 12, rank: 80 })).toEqual({ backlinks: 40, referringDomains: 12, rank: 80 });
    expect(readBacklinkSummary(null)).toEqual({ backlinks: null, referringDomains: null, rank: null });
  });
});
