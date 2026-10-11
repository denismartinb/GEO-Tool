import { describe, expect, it } from "vitest";
import { buildTechnicalIssuesReport, type IssueCheckKey } from "@/lib/web-audit/issues";
import { ISSUE_CHECK_META } from "@/lib/web-audit/issue-labels";
import type { PageCheckResult } from "@/lib/web-audit/page-checks";
import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";
import { TRACKED_BOT_AGENTS, type BotAccessReport } from "@/lib/web-audit/robots";
import {
  AUDIT_BLOCKS,
  AUDIT_BLOCK_ORDER,
  auditBlockOf,
  buildAuditBlock,
  formatBlockPoints,
  pageBlockScore,
  parseAuditBlock
} from "@/lib/web-audit/audit-blocks";

type Overrides = {
  structured?: boolean;
  h1?: boolean;
  h2?: boolean;
  intro?: boolean;
  title?: boolean;
  description?: boolean;
  og?: boolean;
  noindex?: boolean;
  canonical?: boolean;
  hreflang?: boolean;
  list?: boolean;
  content?: boolean;
  freshness?: "fresh" | "aging" | "stale" | "unknown";
};

/** A page check with a pageScore computed the way page-checks.ts does. */
function check(o: Overrides = {}): PageCheckResult {
  const v = { structured: true, h1: true, h2: true, intro: true, title: true, description: true, og: true, noindex: false, canonical: true, hreflang: true, list: true, content: true, freshness: "fresh" as const, ...o };
  const baseline =
    (v.structured ? 15 : 0) +
    (v.h1 ? 5 : 0) + (v.h2 ? 5 : 0) + (v.intro ? 5 : 0) +
    (v.title ? 5 : 0) + (v.description ? 5 : 0) + (v.og ? 5 : 0) +
    (v.noindex ? 0 : 10) + (v.canonical ? 5 : 0) + (v.hreflang ? 5 : 0) +
    (v.list ? 10 : 0) + (v.content ? 10 : 0);
  const fresh = v.freshness === "fresh" ? 15 : v.freshness === "aging" ? 8 : 0;
  const pageScore = v.freshness === "unknown" ? Math.round((baseline / 85) * 100) : baseline + fresh;
  return {
    structuredData: { pass: v.structured, matchedTypes: v.structured ? ["Article"] : [] },
    answerFormat: { points: 0, hasOneH1: v.h1, hasTwoH2: v.h2, hasAnswerFirstIntro: v.intro, h1Count: v.h1 ? 1 : 0, h2Count: v.h2 ? 2 : 0 },
    metadata: { points: 0, titleOk: v.title, descriptionOk: v.description, ogOk: v.og, titleLength: 40, descriptionLength: 100 },
    freshness: { status: v.freshness, points: fresh, date: v.freshness === "unknown" ? null : "2026-07-01T00:00:00.000Z" },
    indexability: { points: 0, canonicalPresent: v.canonical, canonicalOk: v.canonical, canonicalUrl: null, noindex: v.noindex, hreflangPresent: v.hreflang },
    citability: { points: 0, hasListOrTable: v.list, wordCount: v.content ? 500 : 50, contentOk: v.content },
    pageScore
  } as PageCheckResult;
}

function page(url: string, c: PageCheckResult): PageAuditEntry {
  return { url, contextLabel: "verificada", status: "analyzed", check: c, fetchMs: 100, htmlBytes: 1000 };
}

function bots(overrides: Partial<BotAccessReport> = {}): BotAccessReport {
  return {
    robotsFound: true,
    bots: TRACKED_BOT_AGENTS.map((agent) => ({ agent, allowed: true })),
    llmsTxtFound: true,
    llmsTxtBytes: 200,
    sitemapFound: true,
    ...overrides
  };
}

function blocks(pages: PageAuditEntry[], b = bots()) {
  const report = buildTechnicalIssuesReport(pages, b);
  return { report, geo: buildAuditBlock("geo", pages, report), seo: buildAuditBlock("seo", pages, report) };
}

describe("AUDIT_BLOCKS", () => {
  it("puts every check in exactly one block", () => {
    const all = AUDIT_BLOCK_ORDER.flatMap((k) => AUDIT_BLOCKS[k].checks);
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual(Object.keys(ISSUE_CHECK_META).sort());
  });

  it("files AI access under GEO and Google indexing under SEO", () => {
    expect(auditBlockOf("bot_blocked")).toBe("geo");
    expect(auditBlockOf("llms_txt_missing")).toBe("geo");
    expect(auditBlockOf("noindex")).toBe("seo");
    expect(auditBlockOf("sitemap_missing")).toBe("seo");
  });
});

describe("parseAuditBlock", () => {
  it("opens SEO only when asked, GEO otherwise", () => {
    expect(parseAuditBlock("seo")).toBe("seo");
    expect(parseAuditBlock(["seo", "geo"])).toBe("seo");
    expect(parseAuditBlock("geo")).toBe("geo");
    expect(parseAuditBlock("otra")).toBe("geo");
    expect(parseAuditBlock(undefined)).toBe("geo");
  });
});

describe("buildAuditBlock", () => {
  it("scores 100 in both blocks for a page that passes everything", () => {
    const { geo, seo } = blocks([page("https://acme.com/", check())]);
    expect(geo.score).toBe(100);
    expect(seo.score).toBe(100);
    expect(geo.issues).toEqual([]);
  });

  it("weighs the two blocks back into the same technical score (55 GEO + 45 SEO)", () => {
    const pages = [
      page("https://acme.com/", check({ structured: false, hreflang: false })),
      page("https://acme.com/a", check({ freshness: "aging", h2: false, list: false })),
      page("https://acme.com/b", check({ freshness: "stale", description: false }))
    ];
    const { report, geo, seo } = blocks(pages);
    // Earned GEO points: 40 + 38 + 40 = 118 of 165; SEO: 40 + 40 + 40 = 120 of 135.
    expect(geo.score).toBe(Math.round((118 / 165) * 100));
    expect(seo.score).toBe(Math.round((120 / 135) * 100));
    const combined = (118 + 120) / 3;
    expect(report.actualReadinessScore).toBe(Math.round(combined));
  });

  it("gives each issue the block points that fixing it alone adds", () => {
    const pages = [
      page("https://acme.com/", check({ structured: false })),
      page("https://acme.com/a", check()),
      page("https://acme.com/b", check()),
      page("https://acme.com/c", check()),
      page("https://acme.com/d", check())
    ];
    const { geo, seo } = blocks(pages);
    const structured = geo.issues.find((i) => i.issue.check === "structured_data");
    // 15 of 275 GEO points.
    expect(structured?.blockPoints).toBe(5.5);
    expect(geo.score).toBe(95);
    expect(geo.projectedScore).toBe(100);
    expect(geo.scoredIssueCount).toBe(1);
    expect(seo.issues).toEqual([]);
  });

  it("counts partial freshness credit and the full gain from fresh content", () => {
    const { geo } = blocks([page("https://acme.com/", check({ freshness: "aging" }))]);
    expect(geo.score).toBe(Math.round((48 / 55) * 100));
    expect(geo.issues.find((i) => i.issue.check === "freshness")?.blockPoints).toBe(12.7);
  });

  it("leaves an undated page's freshness out of the maximum, like pageScore does, and still prices dating it", () => {
    const { geo } = blocks([
      page("https://acme.com/", check({ freshness: "unknown", structured: false })),
      page("https://acme.com/a", check())
    ]);
    // Undated page: 25 of 40. Dated: 55 of 55. Together 80 of 95.
    expect(geo.score).toBe(84);
    const freshness = geo.issues.find((i) => i.issue.check === "freshness");
    // Dated too: 95 of 110 = 86.36, from 84.21.
    expect(freshness?.blockPoints).toBe(2.2);
    expect(geo.projectedScore).toBe(100);
  });

  it("keeps bots, llms.txt and sitemap unscored, in their own block", () => {
    const blocked = bots({
      bots: TRACKED_BOT_AGENTS.map((agent, i) => ({ agent, allowed: i !== 0 })),
      probes: { llmsTxt: "absent", sitemap: "absent" }
    } as Partial<BotAccessReport>);
    const { geo, seo } = blocks([page("https://acme.com/", check())], blocked);
    expect(geo.issues.map((i) => [i.issue.check, i.blockPoints])).toEqual([
      ["bot_blocked", null],
      ["llms_txt_missing", null]
    ]);
    expect(seo.issues.map((i) => [i.issue.check, i.blockPoints])).toEqual([["sitemap_missing", null]]);
    expect(geo.score).toBe(100);
    expect(geo.scoredIssueCount).toBe(0);
  });

  it("lists as passing only the checks every measured instance passes", () => {
    const { seo } = blocks([page("https://acme.com/", check({ h1: false })), page("https://acme.com/a", check())]);
    const passing = seo.passing.map((p) => p.check);
    expect(passing).not.toContain("single_h1" satisfies IssueCheckKey);
    expect(passing).toContain("title_length");
  });

  it("has no score without an analyzed page", () => {
    const { geo } = blocks([]);
    expect(geo.score).toBeNull();
    expect(geo.projectedScore).toBeNull();
  });
});

describe("pageBlockScore", () => {
  it("scores one page within one block", () => {
    const c = check({ structured: false, title: false });
    expect(pageBlockScore(c, "geo")).toBe(Math.round((40 / 55) * 100));
    expect(pageBlockScore(c, "seo")).toBe(Math.round((40 / 45) * 100));
  });
});

describe("formatBlockPoints", () => {
  it("rounds to whole points and never shows +0", () => {
    expect(formatBlockPoints(21.8)).toBe("+22 pt");
    expect(formatBlockPoints(0.4)).toBe("<1 pt");
  });
});

describe("Salud SEO (SEARCH-SEO-1 Fase 2, log §281)", () => {
  const seoFields = { viewportOk: true, imageCount: 2, imagesMissingAlt: 0, localBusiness: false, titleKey: "t", descriptionKey: "d", pageKey: "home" };
  const speedySite = {
    googlebotAllowed: true,
    https: "ok" as const,
    pageSpeed: { measuredAt: "2026-10-10T00:00:00Z", mobile: { source: "field" as const, lcpMs: 3400, inpMs: 100, cls: 0.01 }, desktop: null }
  };

  it("labels the SEO score «Salud SEO» and keeps «Nota GEO»", () => {
    expect(AUDIT_BLOCKS.seo.scoreLabel).toBe("Salud SEO");
    expect(AUDIT_BLOCKS.geo.scoreLabel).toBe("Nota GEO");
  });

  it("never moves the Salud técnica, the GEO block or a page's pageScore", () => {
    const plain = [page("https://acme.com/", check({ description: false }))];
    const withSeo = [page("https://acme.com/", { ...check({ description: false }), seo: { ...seoFields, viewportOk: false, imagesMissingAlt: 2 } })];
    const before = blocks(plain);
    const b = bots({ site: { ...speedySite, googlebotAllowed: false, https: "missing" } });
    const report = buildTechnicalIssuesReport(withSeo, b);
    expect(report.actualReadinessScore).toBe(before.report.actualReadinessScore);
    expect(report.issues).toEqual(before.report.issues);
    expect(buildAuditBlock("geo", withSeo, report, b)).toEqual(before.geo);
    expect(withSeo[0].check!.pageScore).toBe(plain[0].check!.pageScore);
  });

  it("adds the new checks to the SEO block with their own weights, out of 100", () => {
    // Page: 40 of 45 old SEO points (no description), viewport 5, alt 5,
    // speed 20 × 5/6 (LCP mejorable), Googlebot 10, HTTPS 10. Duplicates
    // need two pages, so they are not measured here.
    const pages = [page("https://acme.com/", { ...check({ description: false }), seo: seoFields })];
    const b = bots({ site: speedySite });
    const report = buildTechnicalIssuesReport(pages, b);
    const seo = buildAuditBlock("seo", pages, report, b);
    const earned = 40 + 5 + 5 + 20 * (5 / 6) + 10 + 10;
    expect(seo.score).toBe(Math.round((earned / 95) * 100));
    expect(seo.projectedScore).toBe(100);
    const speed = seo.issues.find((i) => i.issue.check === "page_speed")!;
    expect(speed.blockPoints).toBeCloseTo((20 / 6 / 95) * 100, 1);
    expect(seo.passing.map((p) => p.check)).toEqual(expect.arrayContaining(["googlebot_blocked", "https_redirect", "viewport_missing"]));
  });

  it("is the old SEO score when nothing new was measured", () => {
    const pages = [page("https://acme.com/", check({ description: false }))];
    const { seo, report } = blocks(pages);
    expect(buildAuditBlock("seo", pages, report, bots())).toEqual(seo);
    expect(seo.score).toBe(Math.round((40 / 45) * 100));
  });

  it("sorts the SEO block by severity, then by its own points", () => {
    const pages = [page("https://acme.com/", { ...check({ hreflang: false }), seo: { ...seoFields, viewportOk: false } })];
    const b = bots({ site: { https: "missing" } });
    const report = buildTechnicalIssuesReport(pages, b);
    const order = buildAuditBlock("seo", pages, report, b).issues.map((i) => i.issue.check);
    expect(order[0]).toBe("https_redirect");
    expect(order.indexOf("viewport_missing")).toBeGreaterThan(-1);
  });

  it("scores a page with its own new checks only, never the site facts", () => {
    const c = { ...check({ description: false }), seo: { ...seoFields, imagesMissingAlt: 1 } };
    expect(pageBlockScore(c, "seo")).toBe(Math.round(((40 + 5) / 55) * 100));
    expect(pageBlockScore(c, "geo")).toBe(pageBlockScore(check({ description: false }), "geo"));
  });
});
