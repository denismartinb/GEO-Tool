import { describe, expect, it } from "vitest";
import { buildTechnicalIssuesReport, type TechnicalIssue } from "@/lib/web-audit/issues";
import { buildPageCheckResult, type PageCheckResult } from "@/lib/web-audit/page-checks";
import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";
import { TRACKED_BOT_AGENTS, type BotAccessReport } from "@/lib/web-audit/robots";

function passingCheck(pageScore = 100): PageCheckResult {
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
    pageScore
  };
}

function page(url: string, check: PageCheckResult): PageAuditEntry {
  return { url, contextLabel: "verificada", status: "analyzed", check, fetchMs: 120, htmlBytes: 8000 };
}

function skippedPage(url: string, status: PageAuditEntry["status"] = "skipped_offsite"): PageAuditEntry {
  return { url, contextLabel: "verificada", status, check: null, fetchMs: null, htmlBytes: null };
}

function botsReport(overrides: Partial<BotAccessReport> = {}): BotAccessReport {
  return {
    robotsFound: true,
    bots: TRACKED_BOT_AGENTS.map((agent) => ({ agent, allowed: true })),
    llmsTxtFound: true,
    llmsTxtBytes: 200,
    sitemapFound: true,
    ...overrides
  };
}

function findIssue(issues: TechnicalIssue[], check: string): TechnicalIssue | undefined {
  return issues.find((i) => i.check === check);
}

describe("buildTechnicalIssuesReport — empty / fully-passing input", () => {
  it("returns an empty report with null scores when no page was analyzed", () => {
    const report = buildTechnicalIssuesReport([skippedPage("https://acme.com/a")], botsReport());
    expect(report.analyzedPageCount).toBe(0);
    expect(report.actualReadinessScore).toBeNull();
    expect(report.projectedReadinessScore).toBeNull();
    expect(report.totalPointPotential).toBe(0);
    // Bots and llms.txt/sitemap are still project-level facts, independent of pages.
    expect(report.issues).toEqual([]);
  });

  it("produces zero issues and a full passing list when every page and bot check passes", () => {
    const report = buildTechnicalIssuesReport([page("https://acme.com/a", passingCheck(100))], botsReport());
    expect(report.issues).toEqual([]);
    expect(report.actualReadinessScore).toBe(100);
    expect(report.projectedReadinessScore).toBe(100);
    expect(report.totalPointPotential).toBe(0);

    const passingKeys = report.passing.map((p) => p.check).sort();
    expect(passingKeys).toEqual(
      [
        "answer_first_intro",
        "bot_blocked",
        "canonical",
        "content_length",
        "description_length",
        "freshness",
        "hreflang",
        "list_or_table",
        "llms_txt_missing",
        "noindex",
        "open_graph",
        "single_h1",
        "sitemap_missing",
        "structured_data",
        "title_length",
        "two_h2"
      ].sort()
    );
    for (const p of report.passing) {
      expect(p.passedCount).toBe(p.applicableCount);
    }
  });

  it("ignores non-analyzed pages entirely — never counted, never asserted about", () => {
    const report = buildTechnicalIssuesReport(
      [page("https://acme.com/ok", passingCheck(100)), skippedPage("https://acme.com/broken", "skipped_error")],
      botsReport()
    );
    expect(report.analyzedPageCount).toBe(1);
    expect(report.actualReadinessScore).toBe(100);
  });
});

describe("buildTechnicalIssuesReport — individual page-level checks", () => {
  it("flags structured_data with the full weight as the point delta on a single failing page", () => {
    const check = { ...passingCheck(85), structuredData: { pass: false, matchedTypes: [] } };
    const report = buildTechnicalIssuesReport([page("https://acme.com/a", check)], botsReport());
    const issue = findIssue(report.issues, "structured_data")!;
    expect(issue.affectedCount).toBe(1);
    expect(issue.applicableCount).toBe(1);
    expect(issue.pointDelta).toBe(15);
    expect(issue.severity).toBe("critical"); // 15 >= 5
    expect(issue.affectedLabels).toEqual(["https://acme.com/a"]);
    expect(findIssue(report.passing as unknown as TechnicalIssue[], "structured_data")).toBeUndefined();
  });

  it("flags single_h1 / two_h2 / answer_first_intro independently, each worth 5 pt on one page out of one", () => {
    const check = {
      ...passingCheck(85),
      answerFormat: { points: 0, hasOneH1: false, hasTwoH2: false, hasAnswerFirstIntro: false, h1Count: 0, h2Count: 0 }
    };
    const report = buildTechnicalIssuesReport([page("https://acme.com/a", check)], botsReport());
    for (const key of ["single_h1", "two_h2", "answer_first_intro"]) {
      const issue = findIssue(report.issues, key)!;
      expect(issue.pointDelta).toBe(5);
      expect(issue.severity).toBe("critical"); // 5 pt on a single analyzed page hits the >= 5 critical threshold exactly
    }
  });

  it("computes title_length / description_length / open_graph at 5 pt each, open_graph excluded when unmeasured", () => {
    const measured = { ...passingCheck(85), metadata: { points: 0, titleOk: false, descriptionOk: false, ogOk: false, titleLength: 2, descriptionLength: 10 } };
    const unmeasuredOg = { ...passingCheck(90), metadata: { points: 10, titleOk: false, descriptionOk: false, titleLength: 2, descriptionLength: 10 } };

    const reportMeasured = buildTechnicalIssuesReport([page("https://acme.com/a", measured)], botsReport());
    expect(findIssue(reportMeasured.issues, "title_length")?.pointDelta).toBe(5);
    expect(findIssue(reportMeasured.issues, "description_length")?.pointDelta).toBe(5);
    expect(findIssue(reportMeasured.issues, "open_graph")?.pointDelta).toBe(5);

    const reportUnmeasured = buildTechnicalIssuesReport([page("https://acme.com/b", unmeasuredOg)], botsReport());
    expect(findIssue(reportUnmeasured.issues, "open_graph")).toBeUndefined();
    expect(reportUnmeasured.passing.find((p) => p.check === "open_graph")).toBeUndefined();
  });

  it("forces noindex to critical severity regardless of its point delta, and computes it at 10 pt", () => {
    const check = {
      ...passingCheck(90),
      indexability: { points: 10, canonicalPresent: true, canonicalOk: true, canonicalUrl: "x", noindex: true, hreflangPresent: true }
    };
    const report = buildTechnicalIssuesReport([page("https://acme.com/a", check)], botsReport());
    const issue = findIssue(report.issues, "noindex")!;
    expect(issue.pointDelta).toBe(10);
    expect(issue.severity).toBe("critical");
  });

  it("computes canonical and hreflang at 5 pt each, and excludes both when indexability is unmeasured (legacy snapshot)", () => {
    const check = {
      ...passingCheck(90),
      indexability: { points: 10, canonicalPresent: false, canonicalOk: false, canonicalUrl: null, noindex: false, hreflangPresent: false }
    };
    const report = buildTechnicalIssuesReport([page("https://acme.com/a", check)], botsReport());
    expect(findIssue(report.issues, "canonical")?.pointDelta).toBe(5);
    expect(findIssue(report.issues, "hreflang")?.pointDelta).toBe(5);

    const legacy = { ...passingCheck(80), indexability: undefined };
    const legacyReport = buildTechnicalIssuesReport([page("https://acme.com/legacy", legacy)], botsReport());
    expect(findIssue(legacyReport.issues, "canonical")).toBeUndefined();
    expect(findIssue(legacyReport.issues, "hreflang")).toBeUndefined();
    expect(findIssue(legacyReport.issues, "noindex")).toBeUndefined();
  });

  it("computes list_or_table and content_length at 10 pt each, and excludes both when citability is unmeasured", () => {
    const check = { ...passingCheck(80), citability: { points: 0, hasListOrTable: false, wordCount: 40, contentOk: false } };
    const report = buildTechnicalIssuesReport([page("https://acme.com/a", check)], botsReport());
    expect(findIssue(report.issues, "list_or_table")?.pointDelta).toBe(10);
    expect(findIssue(report.issues, "content_length")?.pointDelta).toBe(10);

    const legacy = { ...passingCheck(80), citability: undefined };
    const legacyReport = buildTechnicalIssuesReport([page("https://acme.com/legacy", legacy)], botsReport());
    expect(findIssue(legacyReport.issues, "list_or_table")).toBeUndefined();
    expect(findIssue(legacyReport.issues, "content_length")).toBeUndefined();
  });
});

describe("buildTechnicalIssuesReport — freshness", () => {
  it("gives aging pages a 7 pt delta (15 fresh - 8 aging) and stale pages a 15 pt delta", () => {
    const aging = { ...passingCheck(93), freshness: { status: "aging" as const, points: 8, date: "2025-01-01T00:00:00.000Z" } };
    const stale = { ...passingCheck(85), freshness: { status: "stale" as const, points: 0, date: "2020-01-01T00:00:00.000Z" } };

    const agingReport = buildTechnicalIssuesReport([page("https://acme.com/aging", aging)], botsReport());
    expect(findIssue(agingReport.issues, "freshness")?.pointDelta).toBe(7);
    expect(findIssue(agingReport.issues, "freshness")?.severity).toBe("critical"); // 7 >= 5

    const staleReport = buildTechnicalIssuesReport([page("https://acme.com/stale", stale)], botsReport());
    expect(findIssue(staleReport.issues, "freshness")?.pointDelta).toBe(15);
    expect(findIssue(staleReport.issues, "freshness")?.severity).toBe("critical");
  });

  it("reports unknown freshness as an issue with a null (uncomputable) point delta, defaulting to warning severity", () => {
    const unknown = { ...passingCheck(85), freshness: { status: "unknown" as const, points: 0, date: null } };
    const report = buildTechnicalIssuesReport([page("https://acme.com/a", unknown)], botsReport());
    const issue = findIssue(report.issues, "freshness")!;
    expect(issue.pointDelta).toBeNull();
    expect(issue.severity).toBe("warning");
    // Unknown-freshness pages are excluded from totalPointPotential's freshness contribution,
    // but OTHER checks on that same page still contribute via the rescale-aware gain.
    expect(report.projectedReadinessScore).not.toBeNull();
  });

  it("rescales the gain of OTHER checks correctly on an unknown-freshness page instead of using the flat weight", () => {
    // baseline=0 (every additive sub-check fails), freshness unknown → pageScore = round(0/85*100) = 0.
    const empty: PageCheckResult = {
      structuredData: { pass: false, matchedTypes: [] },
      answerFormat: { points: 0, hasOneH1: false, hasTwoH2: false, hasAnswerFirstIntro: false, h1Count: 0, h2Count: 0 },
      metadata: { points: 0, titleOk: false, descriptionOk: false, ogOk: false, titleLength: 2, descriptionLength: 2 },
      freshness: { status: "unknown", points: 0, date: null },
      indexability: { points: 0, canonicalPresent: false, canonicalOk: false, canonicalUrl: null, noindex: true, hreflangPresent: false },
      citability: { points: 0, hasListOrTable: false, wordCount: 10, contentOk: false },
      pageScore: 0
    };
    const report = buildTechnicalIssuesReport([page("https://acme.com/a", empty)], botsReport());
    // Flat weight would be 15; the real rescaled gain (round(15/85*100) - round(0/85*100)) is 18.
    expect(findIssue(report.issues, "structured_data")?.pointDelta).toBe(18);
  });

  it("falls back to a null gain on an unknown-freshness page whose baseline can't be fully determined (legacy fields missing)", () => {
    const legacyUnknown: PageCheckResult = {
      structuredData: { pass: false, matchedTypes: [] },
      answerFormat: { points: 0, hasOneH1: false, hasTwoH2: false, hasAnswerFirstIntro: false, h1Count: 0, h2Count: 0 },
      metadata: { points: 0, titleOk: false, descriptionOk: false, titleLength: 2, descriptionLength: 2 }, // ogOk undefined
      freshness: { status: "unknown", points: 0, date: null },
      pageScore: 0
      // indexability / citability undefined
    };
    const report = buildTechnicalIssuesReport([page("https://acme.com/a", legacyUnknown)], botsReport());
    const issue = findIssue(report.issues, "structured_data")!;
    expect(issue.pointDelta).toBeNull();
    expect(issue.severity).toBe("warning");
  });
});

describe("buildTechnicalIssuesReport — bots, llms.txt, sitemap", () => {
  it("flags a single blocked bot as critical with no point delta, and lists the rest as passing", () => {
    const bots = botsReport({ bots: TRACKED_BOT_AGENTS.map((agent) => ({ agent, allowed: agent !== "GPTBot" })) });
    const report = buildTechnicalIssuesReport([page("https://acme.com/a", passingCheck(100))], bots);
    const issue = findIssue(report.issues, "bot_blocked")!;
    expect(issue.severity).toBe("critical");
    expect(issue.pointDelta).toBeNull();
    expect(issue.affectedCount).toBe(1);
    expect(issue.applicableCount).toBe(TRACKED_BOT_AGENTS.length);
    expect(issue.affectedLabels).toEqual(["GPTBot"]);
    const passingBots = report.passing.find((p) => p.check === "bot_blocked")!;
    expect(passingBots.passedCount).toBe(TRACKED_BOT_AGENTS.length - 1);
  });

  it("produces no bot_blocked issue and a full passing entry when every tracked bot is allowed", () => {
    const report = buildTechnicalIssuesReport([page("https://acme.com/a", passingCheck(100))], botsReport());
    expect(findIssue(report.issues, "bot_blocked")).toBeUndefined();
    expect(report.passing.find((p) => p.check === "bot_blocked")?.passedCount).toBe(TRACKED_BOT_AGENTS.length);
  });

  it("flags missing llms.txt and sitemap.xml as warning-severity issues with no point delta", () => {
    const bots = botsReport({ llmsTxtFound: false, sitemapFound: false });
    const report = buildTechnicalIssuesReport([page("https://acme.com/a", passingCheck(100))], bots);
    expect(findIssue(report.issues, "llms_txt_missing")?.severity).toBe("warning");
    expect(findIssue(report.issues, "llms_txt_missing")?.pointDelta).toBeNull();
    expect(findIssue(report.issues, "sitemap_missing")?.severity).toBe("warning");
  });

  it("reports issues for bots even when zero pages were analyzed — bot access is project-level, not page-level", () => {
    const bots = botsReport({ llmsTxtFound: false });
    const report = buildTechnicalIssuesReport([skippedPage("https://acme.com/a")], bots);
    expect(findIssue(report.issues, "llms_txt_missing")).toBeDefined();
    expect(report.analyzedPageCount).toBe(0);
  });
});

describe("buildTechnicalIssuesReport — severity thresholds", () => {
  it("classifies exactly 5.0 pt as critical and 4.9 pt as warning", () => {
    // Two pages so a 10-point weight (list_or_table) splits into 5.0 pt/page-avg when only one of two fails... use direct construction instead for exact control.
    const fivePt = { ...passingCheck(85), citability: { points: 10, hasListOrTable: false, wordCount: 500, contentOk: true } }; // 10 / 2 pages = 5.0
    const twoPages = [page("https://acme.com/a", fivePt), page("https://acme.com/b", passingCheck(100))];
    const report = buildTechnicalIssuesReport(twoPages, botsReport());
    const issue = findIssue(report.issues, "list_or_table")!;
    expect(issue.pointDelta).toBe(5);
    expect(issue.severity).toBe("critical");
  });

  it("classifies a sub-5 delta as warning down to 1.5, and improvement below that", () => {
    // 3 pt / page: use answer_first_intro's 5pt weight over ~3.33 pages isn't integral; construct directly with 3 analyzed pages, 1 failing (5/3 = 1.666 -> warning).
    const failing = { ...passingCheck(95), answerFormat: { points: 10, hasOneH1: true, hasTwoH2: true, hasAnswerFirstIntro: false, h1Count: 1, h2Count: 2 } };
    const pages = [page("https://acme.com/a", failing), page("https://acme.com/b", passingCheck(100)), page("https://acme.com/c", passingCheck(100))];
    const report = buildTechnicalIssuesReport(pages, botsReport());
    const issue = findIssue(report.issues, "answer_first_intro")!;
    expect(issue.pointDelta).toBeCloseTo(1.7, 1); // round1(5/3) = 1.7
    expect(issue.severity).toBe("warning");
  });

  it("classifies a small delta below 1.5 as improvement", () => {
    const failing = { ...passingCheck(95), answerFormat: { points: 10, hasOneH1: true, hasTwoH2: true, hasAnswerFirstIntro: false, h1Count: 1, h2Count: 2 } };
    const pages = [
      page("https://acme.com/a", failing),
      ...Array.from({ length: 9 }, (_, i) => page(`https://acme.com/ok${i}`, passingCheck(100)))
    ];
    const report = buildTechnicalIssuesReport(pages, botsReport());
    const issue = findIssue(report.issues, "answer_first_intro")!;
    expect(issue.pointDelta).toBe(0.5); // round1(5/10)
    expect(issue.severity).toBe("improvement");
  });
});

describe("buildTechnicalIssuesReport — sorting and aggregation across pages", () => {
  it("sorts issues by severity tier first, then by point delta descending within a tier", () => {
    const bots = botsReport({ llmsTxtFound: false }); // warning, no pt
    const noindexCheck = {
      ...passingCheck(80),
      indexability: { points: 10, canonicalPresent: true, canonicalOk: true, canonicalUrl: "x", noindex: true, hreflangPresent: true }
    }; // critical, hard block, 10 pt
    const structuredDataCheck = { ...passingCheck(85), structuredData: { pass: false, matchedTypes: [] } }; // critical, 15 pt
    const smallImprovement = {
      ...passingCheck(95),
      metadata: { points: 10, titleOk: false, descriptionOk: true, ogOk: true, titleLength: 2, descriptionLength: 100 }
    }; // small pt

    const report = buildTechnicalIssuesReport(
      [
        page("https://acme.com/noindex", noindexCheck),
        page("https://acme.com/nostructured", structuredDataCheck),
        page("https://acme.com/title", smallImprovement),
        ...Array.from({ length: 7 }, (_, i) => page(`https://acme.com/ok${i}`, passingCheck(100)))
      ],
      bots
    );

    const severities = report.issues.map((i) => i.severity);
    // every "critical" issue precedes every "warning", which precedes every "improvement"
    const firstWarning = severities.indexOf("warning");
    const firstImprovement = severities.indexOf("improvement");
    if (firstWarning !== -1 && firstImprovement !== -1) {
      expect(firstWarning).toBeLessThan(firstImprovement);
    }
    expect(severities.slice(0, severities.lastIndexOf("critical") + 1).every((s) => s === "critical")).toBe(true);

    // Within the critical tier, structured_data (15 pt) sorts before noindex (10 pt).
    const criticalKeys = report.issues.filter((i) => i.severity === "critical").map((i) => i.check);
    expect(criticalKeys.indexOf("structured_data")).toBeLessThan(criticalKeys.indexOf("noindex"));
  });

  it("combines gains from multiple distinct failing checks on the same page into the projected score", () => {
    const brokenPage = {
      ...passingCheck(70),
      structuredData: { pass: false, matchedTypes: [] }, // -15
      metadata: { points: 0, titleOk: false, descriptionOk: false, ogOk: false, titleLength: 2, descriptionLength: 2 } // -15
    };
    // pageScore for this page, consistent with the flags: 100 - 15 (structured) - 15 (metadata) = 70.
    const report = buildTechnicalIssuesReport([page("https://acme.com/a", brokenPage)], botsReport());
    expect(report.actualReadinessScore).toBe(70);
    expect(report.projectedReadinessScore).toBe(100);
    expect(report.totalPointPotential).toBe(30);
  });

  it("averages point potential across multiple pages, only some of which are broken", () => {
    const broken = { ...passingCheck(85), structuredData: { pass: false, matchedTypes: [] } };
    const report = buildTechnicalIssuesReport(
      [page("https://acme.com/broken", broken), page("https://acme.com/ok", passingCheck(100))],
      botsReport()
    );
    expect(report.actualReadinessScore).toBe(Math.round((85 + 100) / 2)); // 93
    expect(report.projectedReadinessScore).toBe(100);
    expect(findIssue(report.issues, "structured_data")?.pointDelta).toBe(7.5); // 15 / 2 pages
  });
});

describe("buildTechnicalIssuesReport — integration against the real page-checks.ts formula", () => {
  const NOW = new Date("2026-08-02T00:00:00Z");
  const CTX = { pageUrl: "https://acme.com/page", projectDomainNormalized: "acme.com" };

  // A page that fails every single check, with a known STALE date (900 days
  // old) so freshness is measured (not "unknown") — isolates the additive,
  // non-rescaled path this test wants to verify weight-by-weight. A single
  // <h1> is always present (even in the single_h1 "fail" variant, which uses
  // a SECOND <h1> to trip hasOneH1 instead of omitting it) because
  // checkAnswerFormat's answer-first-intro scan anchors on the first </h1>'s
  // position — omitting it entirely would silently break that check's
  // "fixed" variant regardless of the intro paragraph.
  const staleDate = new Date(NOW.getTime() - 900 * 24 * 60 * 60 * 1000).toISOString();
  function allFailingHtml(fixes: Partial<Record<string, boolean>> = {}): string {
    const h1Tags = fixes.single_h1 ? "<h1>Main</h1>" : "<h1>Main</h1><h1>Extra</h1>";
    const introP = fixes.answer_first_intro ? `<p>${"a".repeat(210)}</p>` : "<p>short</p>";
    const h2Tags = fixes.two_h2 ? "<h2>A</h2><h2>B</h2>" : "";
    const title = fixes.title_length ? "<title>A title of a reasonable length here</title>" : "<title>Hi</title>";
    const description = fixes.description_length ? `<meta name="description" content="${"d".repeat(80)}">` : "";
    const og = fixes.open_graph ? `<meta property="og:title" content="T"><meta property="og:description" content="D">` : "";
    const canonical = fixes.canonical ? `<link rel="canonical" href="https://acme.com/page">` : "";
    const hreflang = fixes.hreflang ? `<link rel="alternate" hreflang="es" href="https://acme.com/es">` : "";
    const robots = fixes.noindex ? "" : `<meta name="robots" content="noindex">`;
    const structured = fixes.structured_data
      ? `<script type="application/ld+json">{"@type":"Article","dateModified":"${staleDate}"}</script>`
      : `<script type="application/ld+json">{"@type":"Recipe","dateModified":"${staleDate}"}</script>`;
    const listOrTable = fixes.list_or_table ? "<ul><li>a</li></ul>" : "";
    // A <div>, not a <p>: checkAnswerFormat's answer-first-intro scan only
    // matches <p> tags within its window, so a long filler <p> here would
    // silently also flip hasAnswerFirstIntro to true and contaminate this
    // check's isolated delta with answer_first_intro's +5 too.
    const contentFiller = fixes.content_length ? `<div>${"word ".repeat(320)}</div>` : "";

    return `<html><head>${title}${description}${og}${canonical}${hreflang}${robots}</head><body>${structured}${h1Tags}${introP}${h2Tags}${listOrTable}${contentFiller}</body></html>`;
  }

  const WEIGHT_BY_CHECK: Record<string, number> = {
    structured_data: 15,
    single_h1: 5,
    two_h2: 5,
    answer_first_intro: 5,
    title_length: 5,
    description_length: 5,
    open_graph: 5,
    noindex: 10,
    canonical: 5,
    hreflang: 5,
    list_or_table: 10,
    content_length: 10
  };

  it.each(Object.entries(WEIGHT_BY_CHECK))(
    "fixing only %s on a real page moves buildPageCheckResult's pageScore by exactly %i points",
    (checkKey, expectedGain) => {
      const before = buildPageCheckResult(allFailingHtml(), CTX, NOW);
      const after = buildPageCheckResult(allFailingHtml({ [checkKey]: true }), CTX, NOW);
      expect(after.pageScore - before.pageScore).toBe(expectedGain);
    }
  );

  it("matches the real formula's freshness gains too: stale->fresh is +15, aging->fresh is +7", () => {
    const staleHtml = `<html><head></head><body><script type="application/ld+json">{"@type":"Article","dateModified":"${staleDate}"}</script></body></html>`;
    const agingDate = new Date(NOW.getTime() - 300 * 24 * 60 * 60 * 1000).toISOString();
    const agingHtml = `<html><head></head><body><script type="application/ld+json">{"@type":"Article","dateModified":"${agingDate}"}</script></body></html>`;
    const freshDate = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const freshHtml = `<html><head></head><body><script type="application/ld+json">{"@type":"Article","dateModified":"${freshDate}"}</script></body></html>`;

    const stale = buildPageCheckResult(staleHtml, CTX, NOW);
    const aging = buildPageCheckResult(agingHtml, CTX, NOW);
    const freshFromStale = buildPageCheckResult(freshHtml, CTX, NOW);

    expect(stale.freshness.status).toBe("stale");
    expect(aging.freshness.status).toBe("aging");
    expect(freshFromStale.freshness.status).toBe("fresh");
    expect(freshFromStale.pageScore - stale.pageScore).toBe(15);
    expect(freshFromStale.pageScore - aging.pageScore).toBe(7);
  });

  it("feeds a real buildPageCheckResult snapshot end-to-end and produces a coherent report", () => {
    const html = allFailingHtml();
    const check = buildPageCheckResult(html, CTX, NOW);
    const report = buildTechnicalIssuesReport([page("https://acme.com/page", check)], botsReport());
    expect(report.actualReadinessScore).toBe(check.pageScore);
    expect(report.issues.length).toBeGreaterThan(0);
    expect(report.issues.every((i) => i.severity === "critical" || i.severity === "warning" || i.severity === "improvement")).toBe(
      true
    );
  });
});
