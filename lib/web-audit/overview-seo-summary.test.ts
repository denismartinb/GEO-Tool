import { describe, expect, it } from "vitest";
import { buildTechnicalIssuesReport } from "@/lib/web-audit/issues";
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
    expect(summary).toEqual({ analyzedPageCount: 1, counts: { critical: 0, warning: 0, improvement: 0 }, top: [] });
  });

  it("counts and orders issues exactly as the Auditoría SEO screen's report does", () => {
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
    const snapshot = { pages, bots: bots({ sitemapFound: false }) };
    const summary = buildOverviewSeoSummary(snapshot)!;
    const report = buildTechnicalIssuesReport(pages, snapshot.bots);

    expect(summary.analyzedPageCount).toBe(report.analyzedPageCount);
    expect(summary.top).toEqual(report.issues.slice(0, OVERVIEW_SEO_TOP_ISSUES));
    const total = summary.counts.critical + summary.counts.warning + summary.counts.improvement;
    expect(total).toBe(report.issues.length);
    for (const sev of ["critical", "warning", "improvement"] as const) {
      expect(summary.counts[sev]).toBe(report.issues.filter((i) => i.severity === sev).length);
    }
    // A hard blocker (noindex) is critical, so it leads the list.
    expect(summary.top[0].severity).toBe("critical");
    expect(summary.top.some((i) => i.check === "noindex")).toBe(true);
  });
});
