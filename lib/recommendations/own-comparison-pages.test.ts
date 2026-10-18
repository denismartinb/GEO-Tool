import { describe, expect, it } from "vitest";
import {
  comparisonPageFor,
  findOwnComparisonPages,
  matchComparisonPages,
  sitemapLocsFromBots,
  slugify
} from "./own-comparison-pages";
import { comparisonFieldsFromEvidence, computeComparisonOverlay, overlayCopy } from "./coverage-overlay";

// genscore.es's real comparison URLs (app/sitemap.ts), the case of the real
// test: three cards asked for comparisons that already existed (P1, P28, P34).
const GENSCORE_SITEMAP = [
  "https://www.genscore.es/",
  "https://www.genscore.es/blog",
  "https://www.genscore.es/blog/que-es-el-geo",
  "https://www.genscore.es/comparativas",
  "https://www.genscore.es/comparativas/genscore-vs-peec-ai",
  "https://www.genscore.es/comparativas/alternativas-a-peec-ai",
  "https://www.genscore.es/comparativas/genscore-vs-otterly",
  "https://www.genscore.es/comparativas/profound-vs-peec-ai-vs-otterly",
  "https://www.genscore.es/comparativas/genscore-vs-rankscale"
];

describe("findOwnComparisonPages", () => {
  it("keeps pages under a comparison section and vs/alternatives slugs, never the section index", () => {
    const pages = findOwnComparisonPages(
      [...GENSCORE_SITEMAP, "https://acme.es/blog/acme-vs-rival", "https://acme.es/alternativas-a-rival"],
      "genscore.es"
    );
    expect(pages).toContain("https://www.genscore.es/comparativas/genscore-vs-peec-ai");
    expect(pages).not.toContain("https://www.genscore.es/comparativas");
    expect(pages).not.toContain("https://www.genscore.es/blog/que-es-el-geo");
    // Another domain's comparison is never the brand's own page.
    expect(pages.some((p) => p.includes("acme.es"))).toBe(false);
  });

  it("never matches a lookalike domain", () => {
    expect(findOwnComparisonPages(["https://notgenscore.es/comparativas/x-vs-y"], "genscore.es")).toEqual([]);
  });
});

describe("comparisonPageFor", () => {
  const pages = findOwnComparisonPages(GENSCORE_SITEMAP, "genscore.es");

  it("finds the comparison that names the competitor, whatever its spelling", () => {
    expect(comparisonPageFor("Peec AI", pages)).toBe("https://www.genscore.es/comparativas/genscore-vs-peec-ai");
    expect(comparisonPageFor("Otterly", pages)).toBe("https://www.genscore.es/comparativas/genscore-vs-otterly");
    expect(comparisonPageFor("RankScale", pages)).toBe("https://www.genscore.es/comparativas/genscore-vs-rankscale");
  });

  it("matches whole words only", () => {
    expect(comparisonPageFor("Otter", pages)).toBeNull();
    expect(comparisonPageFor("Peec", pages)).toBe("https://www.genscore.es/comparativas/genscore-vs-peec-ai");
    expect(comparisonPageFor("Semrush", pages)).toBeNull();
    expect(comparisonPageFor("A", pages)).toBeNull();
  });

  it("slugifies accents and symbols", () => {
    expect(slugify("Peec.AI ")).toBe("peec-ai");
    expect(slugify("Clínica Sonrisa")).toBe("clinica-sonrisa");
  });
});

describe("matchComparisonPages", () => {
  const pages = findOwnComparisonPages(GENSCORE_SITEMAP, "genscore.es");

  it("a per-competitor card needs its own competitor; a generic one any competitor it saw", () => {
    const out = matchComparisonPages(
      [
        { id: "a", recommendationType: "close_competitor_gap", competitor: "Otterly", mentionedCompetitors: ["Peec AI"] },
        { id: "b", recommendationType: "close_competitor_gap", competitor: "Semrush", mentionedCompetitors: ["Peec AI"] },
        { id: "c", recommendationType: "add_comparison_content", competitor: null, mentionedCompetitors: ["Semrush", "Peec AI"] },
        { id: "d", recommendationType: "increase_brand_visibility", competitor: null, mentionedCompetitors: ["Peec AI"] }
      ],
      pages
    );
    expect(out.get("a")).toBe("https://www.genscore.es/comparativas/genscore-vs-otterly");
    // Semrush has no comparison: the Peec AI page does not stand in for it.
    expect(out.has("b")).toBe(false);
    expect(out.get("c")).toBe("https://www.genscore.es/comparativas/genscore-vs-peec-ai");
    expect(out.has("d")).toBe(false);
  });
});

describe("sitemapLocsFromBots", () => {
  it("reads a urlset and tolerates old or odd snapshots", () => {
    expect(sitemapLocsFromBots({ sitemap: { kind: "urlset", locs: ["https://a.es/x", 3] } })).toEqual(["https://a.es/x"]);
    expect(sitemapLocsFromBots({ sitemap: { kind: "index", locs: ["https://a.es/s.xml"] } })).toEqual([]);
    expect(sitemapLocsFromBots({})).toEqual([]);
    expect(sitemapLocsFromBots(null)).toEqual([]);
  });
});

describe("computeComparisonOverlay", () => {
  it("turns a covered comparison card into «refuerza la que tienes», linking the page", () => {
    const overlay = computeComparisonOverlay({
      recommendations: [
        {
          id: "rec-1",
          recommendationType: "close_competitor_gap",
          confidence: "medium",
          ...comparisonFieldsFromEvidence({ dominant_competitor: "Peec AI", mentioned_competitors: ["Peec AI"] })
        },
        {
          id: "rec-2",
          recommendationType: "close_competitor_gap",
          confidence: "medium",
          ...comparisonFieldsFromEvidence({ dominant_competitor: "Semrush" })
        }
      ],
      siteUrls: GENSCORE_SITEMAP,
      projectDomain: "genscore.es"
    });
    expect(overlay.get("rec-1")).toEqual({
      state: "confirmed_surfacing_gap",
      verifiedPage: { url: "https://www.genscore.es/comparativas/genscore-vs-peec-ai", title: "" },
      confidenceOverride: "high"
    });
    expect(overlay.has("rec-2")).toBe(false);
  });

  it("its copy never asks to publish a new comparison", () => {
    for (const type of ["close_competitor_gap", "add_comparison_content"]) {
      const copy = overlayCopy(type, "confirmed_surfacing_gap");
      expect(copy?.whatToDo).toMatch(/^no publiques otra/);
      expect(copy?.firstStep).toMatch(/^Refuerza tu comparativa/);
      expect(`${copy?.whatWeFound}${copy?.whatToDo}${copy?.firstStep}`).not.toContain("—");
    }
  });
});
