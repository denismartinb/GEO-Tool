import { describe, expect, it } from "vitest";
import type { PageCheckResult } from "@/lib/web-audit/page-checks";
import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";
import { auditedPagesFromSnapshot } from "./audited-pages";

function check(overrides: Partial<PageCheckResult> = {}): PageCheckResult {
  return {
    structuredData: { pass: false, matchedTypes: [] },
    answerFormat: { points: 15, hasOneH1: true, hasTwoH2: true, hasAnswerFirstIntro: false, h1Count: 1, h2Count: 2 },
    metadata: { points: 15, titleOk: true, descriptionOk: true, ogOk: true, titleLength: 40, descriptionLength: 100 },
    freshness: { status: "stale", points: 0, date: null },
    indexability: { points: 20, canonicalPresent: true, canonicalOk: true, canonicalUrl: null, noindex: false, hreflangPresent: true },
    citability: { points: 0, hasListOrTable: false, wordCount: 50, contentOk: false },
    pageScore: 50,
    ...overrides
  } as PageCheckResult;
}

function entry(url: string, c: PageCheckResult | null, status: PageAuditEntry["status"] = "analyzed"): PageAuditEntry {
  return { url, contextLabel: "verificada", status, check: c, fetchMs: 1, htmlBytes: 1 };
}

describe("auditedPagesFromSnapshot", () => {
  it("counts only the page's SEO-block problems, not the GEO ones", () => {
    // structured data, intro, list and freshness fail here, but they are GEO.
    const [page] = auditedPagesFromSnapshot([entry("https://acme.com/", check())]);
    expect(page).toEqual({ url: "https://acme.com/", seoIssues: 0 });
  });
  it("counts each failing SEO check once", () => {
    const [page] = auditedPagesFromSnapshot([
      entry(
        "https://acme.com/precios",
        check({
          metadata: { points: 0, titleOk: false, descriptionOk: false, ogOk: true, titleLength: 90, descriptionLength: 0 },
          seo: { viewportOk: false, imageCount: 2, imagesMissingAlt: 0, localBusiness: false, titleKey: "t", descriptionKey: null, pageKey: "p" }
        })
      )
    ]);
    expect(page.seoIssues).toBe(3);
  });
  it("a page that was not analyzed is null, and non-http urls are dropped", () => {
    const out = auditedPagesFromSnapshot([entry("https://acme.com/x", null, "skipped_budget"), entry("ftp://acme.com", check())]);
    expect(out).toEqual([{ url: "https://acme.com/x", seoIssues: null }]);
  });
});
