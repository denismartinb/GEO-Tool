import { describe, expect, it } from "vitest";
import {
  detectAuditRegressions,
  detectCoverageDrops,
  detectNewlyBlockedBots,
  detectSurfacingDrops,
  detectUnreachablePages,
  type AuditSide
} from "./regressions";
import type { BotAccessReport } from "./robots";
import type { PageAuditEntry } from "./technical-audit";
import type { WebAuditSummary } from "./opportunity-matrix";

type TopicSpec = { promptId: string; topic: string; found: boolean; outcome: WebAuditSummary["topics"][number]["outcome"] };

function summary(topics: TopicSpec[]): WebAuditSummary {
  const full = topics.map((t) => ({ ...t, pages: [], note: "" }));
  const conclusive = full.filter((t) => t.outcome !== "inconclusive");
  const covered = conclusive.filter((t) => t.found);
  const performing = full.filter((t) => t.outcome === "performing");
  return {
    topics: full,
    conclusiveCount: conclusive.length,
    coveredCount: covered.length,
    coveragePct: conclusive.length ? Math.round((covered.length / conclusive.length) * 100) : null,
    surfacedCount: performing.length,
    surfacingPct: covered.length ? Math.round((performing.length / covered.length) * 100) : null
  };
}

function bots(overrides: Partial<BotAccessReport> = {}): BotAccessReport {
  return {
    robotsFound: true,
    bots: [
      { agent: "GPTBot", allowed: true },
      { agent: "PerplexityBot", allowed: true }
    ],
    llmsTxtFound: true,
    llmsTxtBytes: 120,
    sitemapFound: true,
    ...overrides
  };
}

function page(url: string, status: PageAuditEntry["status"]): PageAuditEntry {
  return { url, contextLabel: "", status, check: null, fetchMs: null, htmlBytes: null };
}

function side(overrides: Partial<AuditSide> = {}): AuditSide {
  return { summary: null, bots: bots(), pages: [], ...overrides };
}

describe("detectCoverageDrops", () => {
  it("names a topic that went from conclusively covered to conclusively not covered", () => {
    const previous = side({ summary: summary([{ promptId: "p1", topic: "precios", found: true, outcome: "performing" }]) });
    const current = side({ summary: summary([{ promptId: "p1", topic: "precios", found: false, outcome: "content_gap" }]) });

    expect(detectCoverageDrops(previous, current)).toEqual(["precios"]);
  });

  it("does NOT fire when the topic merely became inconclusive", () => {
    // Acceptance criterion of this phase: inconclusive is unknown, not
    // regression. A transient Gemini failure must not send an alert.
    const previous = side({ summary: summary([{ promptId: "p1", topic: "precios", found: true, outcome: "performing" }]) });
    const current = side({ summary: summary([{ promptId: "p1", topic: "precios", found: false, outcome: "inconclusive" }]) });

    expect(detectCoverageDrops(previous, current)).toEqual([]);
  });

  it("does NOT fire from a previously inconclusive topic resolving to not-covered", () => {
    const previous = side({ summary: summary([{ promptId: "p1", topic: "precios", found: false, outcome: "inconclusive" }]) });
    const current = side({ summary: summary([{ promptId: "p1", topic: "precios", found: false, outcome: "content_gap" }]) });

    expect(detectCoverageDrops(previous, current)).toEqual([]);
  });

  it("ignores a topic that is no longer measured at all", () => {
    // A deactivated prompt is not a coverage loss — nothing was measured.
    const previous = side({ summary: summary([{ promptId: "p1", topic: "precios", found: true, outcome: "performing" }]) });
    const current = side({ summary: summary([]) });

    expect(detectCoverageDrops(previous, current)).toEqual([]);
  });

  it("does not confuse topics whose labels match but whose prompts differ", () => {
    const previous = side({ summary: summary([{ promptId: "p1", topic: "precios", found: true, outcome: "performing" }]) });
    const current = side({ summary: summary([{ promptId: "p2", topic: "precios", found: false, outcome: "content_gap" }]) });

    expect(detectCoverageDrops(previous, current)).toEqual([]);
  });
});

describe("detectSurfacingDrops", () => {
  it("fires on performing → invisible", () => {
    const previous = side({ summary: summary([{ promptId: "p1", topic: "integraciones", found: true, outcome: "performing" }]) });
    const current = side({ summary: summary([{ promptId: "p1", topic: "integraciones", found: true, outcome: "invisible" }]) });

    expect(detectSurfacingDrops(previous, current)).toEqual(["integraciones"]);
  });

  it("does NOT fire on performing → inconclusive", () => {
    const previous = side({ summary: summary([{ promptId: "p1", topic: "integraciones", found: true, outcome: "performing" }]) });
    const current = side({ summary: summary([{ promptId: "p1", topic: "integraciones", found: false, outcome: "inconclusive" }]) });

    expect(detectSurfacingDrops(previous, current)).toEqual([]);
  });

  it("does NOT double-report a topic that lost the content itself", () => {
    // performing → content_gap is a coverage loss, reported once by
    // detectCoverageDrops. Surfacing is about content that is still there.
    const previous = side({ summary: summary([{ promptId: "p1", topic: "integraciones", found: true, outcome: "performing" }]) });
    const current = side({ summary: summary([{ promptId: "p1", topic: "integraciones", found: false, outcome: "content_gap" }]) });

    expect(detectSurfacingDrops(previous, current)).toEqual([]);
    expect(detectCoverageDrops(previous, current)).toEqual(["integraciones"]);
  });
});

describe("detectNewlyBlockedBots", () => {
  it("fires only for the agent whose access flipped allowed → blocked", () => {
    const previous = side();
    const current = side({
      bots: bots({
        bots: [
          { agent: "GPTBot", allowed: false },
          { agent: "PerplexityBot", allowed: true }
        ]
      })
    });

    expect(detectNewlyBlockedBots(previous, current)).toEqual(["GPTBot"]);
  });

  it("stays silent while a bot remains blocked", () => {
    const blocked = bots({ bots: [{ agent: "GPTBot", allowed: false }] });
    expect(detectNewlyBlockedBots(side({ bots: blocked }), side({ bots: blocked }))).toEqual([]);
  });

  it("does not fire for an agent the previous audit never tracked", () => {
    // The day a bot joins TRACKED_BOT_AGENTS, finding it already blocked is
    // a discovery about an unchanged robots.txt, not a regression.
    const previous = side({ bots: bots({ bots: [{ agent: "GPTBot", allowed: true }] }) });
    const current = side({
      bots: bots({
        bots: [
          { agent: "GPTBot", allowed: true },
          { agent: "ClaudeBot", allowed: false }
        ]
      })
    });

    expect(detectNewlyBlockedBots(previous, current)).toEqual([]);
  });

  it("reports every bot when robots.txt blocks all of them at once, with no cap", () => {
    const previous = side({
      bots: bots({
        bots: [
          { agent: "GPTBot", allowed: true },
          { agent: "PerplexityBot", allowed: true },
          { agent: "ClaudeBot", allowed: true },
          { agent: "Bingbot", allowed: true }
        ]
      })
    });
    const current = side({
      bots: bots({
        bots: [
          { agent: "GPTBot", allowed: false },
          { agent: "PerplexityBot", allowed: false },
          { agent: "ClaudeBot", allowed: false },
          { agent: "Bingbot", allowed: false }
        ]
      })
    });

    expect(detectNewlyBlockedBots(previous, current)).toHaveLength(4);
  });

  it("returns nothing when either side has no bot report", () => {
    expect(detectNewlyBlockedBots(side({ bots: null }), side())).toEqual([]);
    expect(detectNewlyBlockedBots(side(), side({ bots: null }))).toEqual([]);
  });

  it("survives a snapshot whose jsonb `bots` is the column's `{}` default", () => {
    const empty = side({ bots: {} as BotAccessReport });
    expect(() => detectNewlyBlockedBots(empty, side())).not.toThrow();
    expect(detectNewlyBlockedBots(empty, side({ bots: bots({ bots: [{ agent: "GPTBot", allowed: false }] }) }))).toEqual([]);
  });
});

describe("detectUnreachablePages", () => {
  it("reports a page that was analyzed before and now times out or errors", () => {
    const previous = side({ pages: [page("https://acme.com/a", "analyzed"), page("https://acme.com/b", "analyzed")] });
    const current = side({ pages: [page("https://acme.com/a", "skipped_error"), page("https://acme.com/b", "skipped_timeout")] });

    expect(detectUnreachablePages(previous, current)).toEqual(["https://acme.com/a", "https://acme.com/b"]);
  });

  it("ignores statuses that are our own decision rather than an outage", () => {
    const previous = side({ pages: [page("https://acme.com/a", "analyzed")] });
    const current = side({ pages: [page("https://acme.com/a", "skipped_not_html")] });

    expect(detectUnreachablePages(previous, current)).toEqual([]);
  });

  it("ignores a page that was already failing", () => {
    const previous = side({ pages: [page("https://acme.com/a", "skipped_error")] });
    const current = side({ pages: [page("https://acme.com/a", "skipped_error")] });

    expect(detectUnreachablePages(previous, current)).toEqual([]);
  });

  it("ignores a URL the previous audit never looked at", () => {
    const previous = side({ pages: [] });
    const current = side({ pages: [page("https://acme.com/new", "skipped_error")] });

    expect(detectUnreachablePages(previous, current)).toEqual([]);
  });

  it("ignores a page skipped for budget in the previous audit", () => {
    const previous = side({ pages: [page("https://acme.com/a", "skipped_budget")] });
    const current = side({ pages: [page("https://acme.com/a", "skipped_error")] });

    expect(detectUnreachablePages(previous, current)).toEqual([]);
  });
});

describe("detectAuditRegressions", () => {
  it("finds nothing when nothing changed", () => {
    const both = side({
      summary: summary([{ promptId: "p1", topic: "precios", found: true, outcome: "performing" }]),
      pages: [page("https://acme.com/", "analyzed")]
    });

    expect(detectAuditRegressions(both, both)).toEqual([]);
  });

  it("finds nothing at all when there is no previous audit to compare with", () => {
    // A first audit has no yesterday. Reporting a missing llms.txt here would
    // be reporting a state, not a regression.
    const previous: AuditSide = { summary: null, bots: null, pages: [] };
    const current = side({ bots: bots({ llmsTxtFound: false, sitemapFound: false }) });

    expect(detectAuditRegressions(previous, current)).toEqual([]);
  });

  it("reports a lost llms.txt and a lost sitemap once each", () => {
    const previous = side();
    const current = side({ bots: bots({ llmsTxtFound: false, llmsTxtBytes: null, sitemapFound: false }) });

    expect(detectAuditRegressions(previous, current).map((r) => r.kind)).toEqual(["llms_txt_lost", "sitemap_lost"]);
  });

  it("treats a field that did not exist on the older snapshot as unknown, not lost", () => {
    // sitemapFound only exists on snapshots written after WEB-AUDIT-R3. The
    // double cast is the point of the test: `bots` is read straight out of a
    // jsonb column, so rows that predate a field really do reach this code
    // missing it, whatever the TypeScript type says.
    const legacy = side({
      bots: { robotsFound: true, bots: [], llmsTxtFound: true, llmsTxtBytes: 1 } as unknown as BotAccessReport
    });
    const current = side({ bots: bots({ sitemapFound: false }) });

    expect(detectAuditRegressions(legacy, current).map((r) => r.kind)).toEqual([]);
  });

  it("aggregates unreachable pages into one finding with a bounded sample", () => {
    const urls = Array.from({ length: 5 }, (_, i) => `https://acme.com/p${i}`);
    const previous = side({ pages: urls.map((u) => page(u, "analyzed")) });
    const current = side({ pages: urls.map((u) => page(u, "skipped_error")) });

    const [finding] = detectAuditRegressions(previous, current);
    expect(finding).toEqual({ kind: "page_unreachable", count: 5, sampleUrls: urls.slice(0, 3) });
  });

  it("orders technical findings before content ones", () => {
    const previous = side({ summary: summary([{ promptId: "p1", topic: "precios", found: true, outcome: "performing" }]) });
    const current = side({
      summary: summary([{ promptId: "p1", topic: "precios", found: false, outcome: "content_gap" }]),
      bots: bots({ bots: [{ agent: "GPTBot", allowed: false }, { agent: "PerplexityBot", allowed: true }], llmsTxtFound: false })
    });

    expect(detectAuditRegressions(previous, current).map((r) => r.kind)).toEqual([
      "ai_bot_blocked",
      "llms_txt_lost",
      "coverage_dropped"
    ]);
  });

  it("caps the topic sample at three while reporting the true count", () => {
    const specs = Array.from({ length: 6 }, (_, i) => ({
      promptId: `p${i}`,
      topic: `tema ${i}`,
      found: true,
      outcome: "performing" as const
    }));
    const previous = side({ summary: summary(specs) });
    const current = side({
      summary: summary(specs.map((s) => ({ ...s, outcome: "invisible" as const })))
    });

    const finding = detectAuditRegressions(previous, current).find((r) => r.kind === "surfacing_dropped");
    expect(finding).toEqual({ kind: "surfacing_dropped", count: 6, sampleTopics: ["tema 0", "tema 1", "tema 2"] });
  });
});
