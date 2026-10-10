import { describe, expect, it } from "vitest";
import type { AnswerRecord } from "./sector-study";
import type { ProspectAudit } from "./prospect-audit-format";
import {
  formatCompetitorComparison,
  formatCoverageSection,
  formatGlobalScoreSection,
  isOwnDomain,
  prospectGlobalScore,
  summarizeCoverage,
  type CoverageTopicResult
} from "./prospect-scorecard";

const record = (over: Partial<AnswerRecord>): AnswerRecord => ({
  engine: "gemini",
  promptIndex: 0,
  sample: 1,
  model: "m",
  error: null,
  rawText: "x",
  seedMentions: [],
  otherBrands: [],
  citations: [],
  ...over
});

const page = { url: "https://acme.es/servicios", title: "Servicios" };
const ok = (promptIndex: number, pages = [page]): CoverageTopicResult => ({ promptIndex, status: "ok", pages, aiNote: null });

describe("isOwnDomain", () => {
  it("matches on label boundary only", () => {
    expect(isOwnDomain("www.acme.es", "acme.es")).toBe(true);
    expect(isOwnDomain("blog.acme.es", "acme.es")).toBe(true);
    expect(isOwnDomain("evilacme.es", "acme.es")).toBe(false);
    expect(isOwnDomain(null, "acme.es")).toBe(false);
  });
});

describe("summarizeCoverage", () => {
  const own = [{ url: "https://acme.es/a", domain: "acme.es" }];

  it("classifies like the opportunity matrix, over this study's answers", () => {
    const records = [
      // 0: content + cited by both grounded engines → performing / content_named
      record({ promptIndex: 0, engine: "gemini", citations: own }),
      record({ promptIndex: 0, engine: "openai", citations: own }),
      // 1: content, named by Claude only, never cited → invisible / content_named (named counts)
      record({ promptIndex: 1, engine: "gemini" }),
      record({ promptIndex: 1, engine: "claude", seedMentions: [{ name: "Acme", position: 1 }] }),
      // 2: content, not named, not cited → invisible / content_not_named
      record({ promptIndex: 2 }),
      // 3: no content, a competitor named → content_gap
      record({ promptIndex: 3, seedMentions: [{ name: "Rival", position: 1 }] }),
      // 4: coverage call failed → inconclusive, out of the denominator
      record({ promptIndex: 4 }),
      // 5: no content and nobody named → open_opportunity
      record({ promptIndex: 5 })
    ];
    const summary = summarizeCoverage({
      domain: "acme.es",
      brand: "Acme",
      promptCount: 6,
      records,
      coverage: [ok(0), ok(1), ok(2), ok(3, []), { promptIndex: 4, status: "failed", pages: [], aiNote: null }, ok(5, [])]
    });
    expect(summary.rows.map((row) => [row.coverageClass, row.outcome])).toEqual([
      ["content_named", "performing"],
      ["content_named", "invisible"],
      ["content_not_named", "invisible"],
      ["no_content", "content_gap"],
      ["inconclusive", "inconclusive"],
      ["no_content", "open_opportunity"]
    ]);
    expect(summary.conclusive).toBe(5);
    expect(summary.coveragePct).toBe(60);
    expect(summary.surfacingPct).toBe(33);
    expect(summary.calls).toBe(6);
  });

  it("Claude never counts toward 'cited', and a skipped call is not spend", () => {
    const summary = summarizeCoverage({
      domain: "acme.es",
      brand: "Acme",
      promptCount: 2,
      records: [record({ promptIndex: 0, engine: "claude", citations: own }), record({ promptIndex: 1 })],
      coverage: [ok(0), { promptIndex: 1, status: "skipped", pages: [], aiNote: null }]
    });
    expect(summary.rows[0].grounded).toBe(0);
    expect(summary.rows[0].outcome).toBe("invisible");
    expect(summary.rows[1].outcome).toBe("inconclusive");
    expect(summary.calls).toBe(1);
  });
});

describe("global score", () => {
  it("leaves a missing component out, never as zero", () => {
    const score = prospectGlobalScore(null, null);
    expect(score.score).toBeNull();
    const text = formatGlobalScoreSection(score);
    expect(text).toContain("**Nota global:** sin dato");
    expect(text).toContain("Salud técnica: sin dato");
  });

  it("states how many components it averaged", () => {
    const text = formatGlobalScoreSection(
      prospectGlobalScore(
        { rows: [], conclusive: 2, covered: 1, performing: 0, coveragePct: 50, surfacingPct: 0, calls: 2 },
        { readinessScore: 70 } as ProspectAudit
      )
    );
    expect(text).toContain("40/100 (sobre 3 de 3 componentes)");
  });
});

describe("formatCoverageSection", () => {
  it("says when nothing could be checked instead of reporting 0%", () => {
    const summary = summarizeCoverage({ domain: "acme.es", brand: "Acme", promptCount: 1, records: [], coverage: [] });
    expect(formatCoverageSection(summary, ["¿Qué agencia?"])).toContain("sin dato de cobertura");
  });
});

describe("formatCompetitorComparison", () => {
  it("names omitted competitors and marks unauditable ones", () => {
    const text = formatCompetitorComparison({
      brand: "Acme",
      target: null,
      competitors: [{ name: "Rival", domain: "rival.es", audit: null }],
      omitted: ["Otra"]
    });
    expect(text).toContain("| Comprobación | Acme | Rival (rival.es) |");
    expect(text).toContain("no se pudo auditar");
    expect(text).toContain("se escribieron a mano): Otra.");
  });
});
