import { describe, expect, it } from "vitest";
import { buildPageFix, buildPageFixes, type PageFixContext } from "./page-fixes";
import type { PageAuditEntry } from "./technical-audit";
import type { PageCheckResult } from "./page-checks";

const ctx: PageFixContext = { projectName: "Movistar", domainNormalized: "movistar.es" };

function check(overrides: Partial<PageCheckResult> = {}): PageCheckResult {
  return {
    structuredData: { pass: false, matchedTypes: [] },
    answerFormat: { points: 0, hasOneH1: true, hasTwoH2: true, hasAnswerFirstIntro: true, h1Count: 1, h2Count: 2 },
    metadata: { points: 0, titleOk: true, descriptionOk: true, ogOk: true, titleLength: 40, descriptionLength: 120 },
    freshness: { status: "fresh", points: 10, date: "2026-07-14T09:00:00.000Z" },
    indexability: {
      points: 0,
      canonicalPresent: true,
      canonicalOk: true,
      canonicalUrl: "https://movistar.es/fibra",
      noindex: false,
      hreflangPresent: true
    },
    citability: { points: 0, hasListOrTable: true, wordCount: 900, contentOk: true },
    pageScore: 70,
    ...overrides
  };
}

function page(overrides: Partial<PageAuditEntry> = {}): PageAuditEntry {
  return {
    url: "https://movistar.es/fibra",
    contextLabel: "Página de producto",
    status: "analyzed",
    check: check(),
    fetchMs: 120,
    htmlBytes: 40_000,
    ...overrides
  };
}

describe("buildPageFix", () => {
  it("fills the JSON-LD block with the page's real URL, brand and detected date", () => {
    const fix = buildPageFix("structured_data", page(), ctx);
    expect(fix).not.toBeNull();
    expect(fix!.snippet).toContain('"url": "https://movistar.es/fibra"');
    expect(fix!.snippet).toContain('"name": "Movistar"');
    // Calendar day only — dateModified wants a date, not a timestamp.
    expect(fix!.snippet).toContain('"dateModified": "2026-07-14"');
    expect(fix!.snippet).not.toContain("09:00:00");
  });

  it("declares the page title as a placeholder, because the audit never stores the real text", () => {
    const fix = buildPageFix("structured_data", page(), ctx);
    expect(fix!.placeholders).toContain("TÍTULO DE LA PÁGINA");
    expect(fix!.snippet).toContain("TÍTULO DE LA PÁGINA");
  });

  it("reuses the @type the page already declares instead of imposing one", () => {
    const fix = buildPageFix(
      "structured_data",
      page({ check: check({ structuredData: { pass: true, matchedTypes: ["Product", "Offer"] } }) }),
      ctx
    );
    expect(fix!.snippet).toContain('"@type": "Product"');
  });

  it("falls back to WebPage when the page declares no type", () => {
    const fix = buildPageFix("structured_data", page(), ctx);
    expect(fix!.snippet).toContain('"@type": "WebPage"');
  });

  it("marks the date as a placeholder when no freshness date was detected", () => {
    const fix = buildPageFix(
      "structured_data",
      page({ check: check({ freshness: { status: "unknown", points: 0, date: null } }) }),
      ctx
    );
    expect(fix!.snippet).toContain("AAAA-MM-DD");
    expect(fix!.placeholders).toContain("AAAA-MM-DD");
  });

  it("emits a canonical fix that needs no editing at all", () => {
    const fix = buildPageFix("canonical", page(), ctx);
    expect(fix!.snippet).toBe('<link rel="canonical" href="https://movistar.es/fibra" />');
    expect(fix!.placeholders).toEqual([]);
  });

  it("quotes the measured length so the user knows what to change", () => {
    const fix = buildPageFix(
      "description_length",
      page({ check: check({ metadata: { points: 0, titleOk: true, descriptionOk: false, ogOk: true, titleLength: 40, descriptionLength: 210 } }) }),
      ctx
    );
    expect(fix!.where).toContain("210");
  });

  it("returns null for checks whose fix is the user's own prose", () => {
    for (const key of ["single_h1", "two_h2", "answer_first_intro", "list_or_table", "content_length"] as const) {
      expect(buildPageFix(key, page(), ctx)).toBeNull();
    }
  });

  it("returns null for site-wide checks that are not per-page", () => {
    for (const key of ["llms_txt_missing", "sitemap_missing", "bot_blocked"] as const) {
      expect(buildPageFix(key, page(), ctx)).toBeNull();
    }
  });

  it("returns null for a page that was never analyzed", () => {
    expect(buildPageFix("canonical", page({ status: "skipped_budget", check: null }), ctx)).toBeNull();
  });

  it("never emits a snippet containing an unreplaced token that is not declared", () => {
    for (const key of ["structured_data", "canonical", "open_graph", "description_length", "title_length", "hreflang", "freshness"] as const) {
      const fix = buildPageFix(key, page(), ctx);
      if (!fix) continue;
      const shouty = fix.snippet.match(/\b[A-ZÁÉÍÓÚÑ]{3,}(?:\s[A-ZÁÉÍÓÚÑ0-9]{2,})*\b/g) ?? [];
      for (const token of shouty) {
        // Anything screaming in caps inside a snippet is either a declared
        // placeholder or a legitimate constant — never an undeclared blank.
        const declared = fix.placeholders.some((p) => p.includes(token) || token.includes(p));
        const known = ["MM", "DD", "AAAA"].some((k) => token.includes(k));
        expect(declared || known, `undeclared placeholder "${token}" in ${key}`).toBe(true);
      }
    }
  });
});

describe("buildPageFixes", () => {
  it("keeps the order of the failing checks and drops the ones without a snippet", () => {
    const fixes = buildPageFixes(["single_h1", "canonical", "structured_data"], page(), ctx);
    expect(fixes.map((f) => f.check)).toEqual(["canonical", "structured_data"]);
  });

  it("never repeats a check", () => {
    const fixes = buildPageFixes(["canonical", "canonical"], page(), ctx);
    expect(fixes).toHaveLength(1);
  });

  it("returns nothing for a page with no analyzable data", () => {
    expect(buildPageFixes(["canonical", "structured_data"], page({ status: "skipped_timeout", check: null }), ctx)).toEqual([]);
  });
});
