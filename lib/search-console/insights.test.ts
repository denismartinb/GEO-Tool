import { describe, expect, it } from "vitest";
import type { QueryView } from "./report";
import {
  CANNIBAL_LIMIT,
  buildDeviceViews,
  buildPageViews,
  findCannibalization,
  findCtrOpportunities,
  findQuestionQueries,
  isQuestionQuery,
  isTrackedQuestion,
  positionTiers,
  tierOf,
  topPageByQuery,
  urlKey,
  type QueryPageRow
} from "./insights";

function q(query: string, position: number, impressions: number, clicks: number): QueryView {
  return {
    query,
    position,
    movement: null,
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    nearPage1: position > 10 && position <= 20
  };
}

function qp(query: string, page: string, impressions: number, position = 5, clicks = 0): QueryPageRow {
  return { query, page, impressions, position, clicks };
}

describe("tierOf / positionTiers", () => {
  it("puts each position in its tier, borders included", () => {
    expect(tierOf(1)).toBe("top3");
    expect(tierOf(3)).toBe("top3");
    expect(tierOf(3.1)).toBe("page1");
    expect(tierOf(10)).toBe("page1");
    expect(tierOf(20)).toBe("page2");
    expect(tierOf(20.5)).toBe("beyond");
  });
  it("shares add up to one and are zero without queries", () => {
    const tiers = positionTiers([q("a", 2, 10, 1), q("b", 12, 10, 0), q("c", 15, 10, 0), q("d", 40, 10, 0)]);
    expect(tiers.map((t) => t.count)).toEqual([1, 0, 2, 1]);
    expect(tiers.reduce((s, t) => s + t.share, 0)).toBeCloseTo(1);
    expect(positionTiers([]).every((t) => t.share === 0)).toBe(true);
  });
});

describe("topPageByQuery", () => {
  it("keeps the page with most impressions for each query", () => {
    const map = topPageByQuery([qp("geo", "https://a.com/x", 10), qp("geo", "https://a.com/y", 30), qp("seo", "https://a.com/z", 5)]);
    expect(map.get("geo")).toBe("https://a.com/y");
    expect(map.get("seo")).toBe("https://a.com/z");
  });
});

describe("urlKey", () => {
  it("ignores scheme, www, query and trailing slash", () => {
    expect(urlKey("https://www.Acme.com/precios/?utm=1")).toBe("acme.com/precios");
    expect(urlKey("http://acme.com")).toBe("acme.com/");
    expect(urlKey("not a url")).toBeNull();
  });
});

describe("buildPageViews", () => {
  it("crosses each page with the audit by URL and counts its queries", () => {
    const views = buildPageViews(
      [
        { page: "https://acme.com/precios", clicks: 5, impressions: 100, position: 4.26 },
        { page: "https://acme.com/", clicks: 20, impressions: 300, position: 2 },
        { page: "https://acme.com/blog", clicks: 1, impressions: 50, position: 9 }
      ],
      [qp("precio", "https://acme.com/precios", 50), qp("tarifa", "https://acme.com/precios", 50), qp("acme", "https://acme.com/", 300)],
      [
        { url: "https://www.acme.com/precios/", seoIssues: 2 },
        { url: "https://acme.com", seoIssues: 0 }
      ]
    );
    expect(views.map((v) => v.path)).toEqual(["/", "/precios", "/blog"]);
    expect(views[0].audit).toEqual({ kind: "ok" });
    expect(views[1].audit).toEqual({ kind: "issues", count: 2 });
    expect(views[1].queryCount).toBe(2);
    expect(views[1].position).toBe(4.3);
    expect(views[2].audit).toEqual({ kind: "unaudited" });
  });
  it("a page fetched but not analyzed reads as unaudited, never as correct", () => {
    const [view] = buildPageViews([{ page: "https://acme.com/a", clicks: 1, impressions: 1, position: 1 }], [], [
      { url: "https://acme.com/a", seoIssues: null }
    ]);
    expect(view.audit).toEqual({ kind: "unaudited" });
  });
});

describe("findCtrOpportunities", () => {
  const peers = [q("p1", 5, 200, 20), q("p2", 6, 200, 20), q("p3", 7, 200, 20)];
  it("flags a page-1 query far below the site's own CTR for its tier", () => {
    const out = findCtrOpportunities([...peers, q("precio geo", 5, 1000, 5)], new Map([["precio geo", "https://acme.com/precios"]]));
    expect(out).toHaveLength(1);
    expect(out[0].query).toBe("precio geo");
    expect(out[0].benchmark).toBeCloseTo(0.1);
    expect(out[0].page).toBe("https://acme.com/precios");
  });
  it("stays silent with too few impressions or too few peers to compare", () => {
    expect(findCtrOpportunities([...peers, q("raro", 5, 20, 0)], new Map())).toEqual([]);
    expect(findCtrOpportunities([q("p1", 5, 200, 20), q("x", 5, 1000, 0)], new Map())).toEqual([]);
  });
  it("never flags page 2: there the fix is position, not the title", () => {
    const page2 = [q("a", 12, 200, 20), q("b", 13, 200, 20), q("c", 14, 200, 20), q("d", 15, 1000, 0)];
    expect(findCtrOpportunities(page2, new Map())).toEqual([]);
  });
});

describe("questions", () => {
  it("recognises questions in Spanish, with or without accents or marks", () => {
    expect(isQuestionQuery("¿qué es geo?")).toBe(true);
    expect(isQuestionQuery("como aparecer en chatgpt")).toBe(true);
    expect(isQuestionQuery("cuál es la mejor herramienta")).toBe(true);
    expect(isQuestionQuery("herramienta geo precio")).toBe(false);
    expect(isQuestionQuery("comparativa geo")).toBe(false);
  });
  it("a question is tracked only if one prompt holds all its meaningful words", () => {
    const prompts = ["¿Cuál es la mejor herramienta GEO para pymes?"];
    expect(isTrackedQuestion("cual es la mejor herramienta geo", prompts)).toBe(true);
    expect(isTrackedQuestion("como aparecer en chatgpt", prompts)).toBe(false);
    expect(isTrackedQuestion("¿qué es?", prompts)).toBe(false);
  });
  it("lists questions by impressions and marks the tracked ones", () => {
    const out = findQuestionQueries([q("precio geo", 3, 900, 9), q("como aparecer en chatgpt", 9, 500, 5), q("que es geo", 4, 800, 8)], [
      "Qué es GEO"
    ]);
    expect(out.map((x) => [x.query, x.tracked])).toEqual([
      ["que es geo", true],
      ["como aparecer en chatgpt", false]
    ]);
  });
});

describe("buildDeviceViews", () => {
  it("labels devices in Spanish and splits impressions", () => {
    const out = buildDeviceViews([
      { device: "MOBILE", clicks: 10, impressions: 300, position: 8.04 },
      { device: "DESKTOP", clicks: 10, impressions: 100, position: 4 }
    ]);
    expect(out.map((d) => d.label)).toEqual(["Móvil", "Ordenador"]);
    expect(out[0].impressionShare).toBeCloseTo(0.75);
    expect(out[0].position).toBe(8);
  });
  it("is empty without impressions", () => {
    expect(buildDeviceViews([])).toEqual([]);
  });
});

describe("findCannibalization", () => {
  it("reports a query where two pages each hold a real share", () => {
    const out = findCannibalization([
      qp("que es geo", "https://acme.com/blog/geo", 60, 8),
      qp("que es geo", "https://acme.com/glosario/geo", 40, 14),
      qp("solo una", "https://acme.com/a", 95),
      qp("solo una", "https://acme.com/b", 5)
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].query).toBe("que es geo");
    expect(out[0].pages.map((p) => p.path)).toEqual(["/blog/geo", "/glosario/geo"]);
  });
  it("ignores queries with too few impressions and caps the list", () => {
    expect(findCannibalization([qp("x", "https://a.com/1", 5), qp("x", "https://a.com/2", 5)])).toEqual([]);
    const many = Array.from({ length: 10 }, (_, i) => [qp(`q${i}`, "https://a.com/1", 50), qp(`q${i}`, "https://a.com/2", 50)]).flat();
    expect(findCannibalization(many)).toHaveLength(CANNIBAL_LIMIT);
  });
});
