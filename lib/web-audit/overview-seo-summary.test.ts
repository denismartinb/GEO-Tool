import { describe, expect, it } from "vitest";
import { buildTechnicalIssuesReport } from "@/lib/web-audit/issues";
import { buildAuditBlock } from "@/lib/web-audit/audit-blocks";
import { buildOverviewSeoSummary, OVERVIEW_SEO_TOP_ISSUES } from "@/lib/web-audit/overview-seo-summary";
import type { PageCheckResult } from "@/lib/web-audit/page-checks";
import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";
import { TRACKED_BOT_AGENTS, type BotAccessReport } from "@/lib/web-audit/robots";

function check(overrides: Partial<PageCheckResult> = {}): PageCheckResult {
  return {
    structuredData: { pass: true, matchedTypes: ["Article"] },
    answerFormat: { points: 15, hasOneH1: true, hasTwoH2: true, hasAnswerFirstIntro: true, h1Count: 1, h2Count: 2 },
    metadata: { points: 15, titleOk: true, descriptionOk: true, ogOk: true, titleLength: 40, descriptionLength: 100 },
    freshness: { status: "fresh", points: 15, date: "2026-07-01T00:00:00.000Z" },
    indexability: {
      points: 20,
      canonicalPresent: true,
      canonicalOk: true,
      canonicalUrl: "https://acme.com/page",
      noindex: false,
      hreflangPresent: true
    },
    citability: { points: 20, hasListOrTable: true, wordCount: 500, contentOk: true },
    pageScore: 100,
    ...overrides
  };
}

function page(url: string, c: PageCheckResult | null, status: PageAuditEntry["status"] = "analyzed"): PageAuditEntry {
  return { url, contextLabel: "verificada", status, check: c, fetchMs: 120, htmlBytes: 8000 };
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

describe("buildOverviewSeoSummary", () => {
  it("returns null without a snapshot, without either half, or without an analyzed page", () => {
    expect(buildOverviewSeoSummary(null)).toBeNull();
    expect(buildOverviewSeoSummary({ pages: null, bots: bots() })).toBeNull();
    expect(buildOverviewSeoSummary({ pages: [page("https://acme.com/", check())], bots: null })).toBeNull();
    expect(buildOverviewSeoSummary({ pages: [page("https://acme.com/", null, "skipped_offsite")], bots: bots() })).toBeNull();
  });

  it("reports a clean site as zero issues, not as missing data", () => {
    const summary = buildOverviewSeoSummary({ pages: [page("https://acme.com/", check())], bots: bots() });
    expect(summary).toEqual({
      analyzedPageCount: 1,
      saludScore: 100,
      counts: { critical: 0, warning: 0, improvement: 0 },
      top: [],
      speed: null
    });
  });

  it("is the Auditoría SEO screen's SEO block: same score, counts and order", () => {
    const pages = [
      page(
        "https://acme.com/a",
        check({
          structuredData: { pass: false, matchedTypes: [] },
          indexability: {
            points: 0,
            canonicalPresent: true,
            canonicalOk: true,
            canonicalUrl: "https://acme.com/a",
            noindex: true,
            hreflangPresent: true
          },
          pageScore: 55
        })
      ),
      page("https://acme.com/b", check({ citability: { points: 10, hasListOrTable: false, wordCount: 500, contentOk: true }, pageScore: 90 }))
    ];
    const snapshot = {
      pages,
      bots: bots({
        sitemapFound: false,
        site: { pageSpeed: { measuredAt: "2026-10-10T00:00:00Z", mobile: { source: "field", lcpMs: 3400, inpMs: 150, cls: 0.02 }, desktop: null } }
      })
    };
    const summary = buildOverviewSeoSummary(snapshot)!;
    const report = buildTechnicalIssuesReport(pages, snapshot.bots);
    const block = buildAuditBlock("seo", pages, report, snapshot.bots);

    expect(summary.analyzedPageCount).toBe(report.analyzedPageCount);
    expect(summary.saludScore).toBe(block.score);
    expect(summary.top).toEqual(block.issues.slice(0, OVERVIEW_SEO_TOP_ISSUES));
    const total = summary.counts.critical + summary.counts.warning + summary.counts.improvement;
    expect(total).toBe(block.issues.length);
    // GEO problems (structured data, lists) stay out of the card.
    expect(summary.top.some((i) => i.issue.check === "structured_data")).toBe(false);
    // A hard blocker (noindex) is critical, so it leads the list.
    expect(summary.top[0].issue.check).toBe("noindex");
    expect(summary.speed).toEqual({ vital: "lcp", value: 3400, rating: "needs_improvement" });
  });

  it("names LCP when every vital is good", () => {
    const summary = buildOverviewSeoSummary({
      pages: [page("https://acme.com/", check())],
      bots: bots({ site: { pageSpeed: { measuredAt: "2026-10-10T00:00:00Z", mobile: { source: "lab", lcpMs: 1800, inpMs: null, cls: 0.01 }, desktop: null } } })
    })!;
    expect(summary.speed).toEqual({ vital: "lcp", value: 1800, rating: "good" });
  });
});
