import { describe, expect, it } from "vitest";
import {
  answerCost,
  CURRENT,
  EXTRACTION_OPTIONS,
  GENERATION_MODELS,
  estimateAnswerCost,
  findExtractionOption,
  isAllowedGenerationModel,
  priceOf,
  tokenCost
} from "@/lib/model-compare/catalogue";
import {
  comparePasses,
  decideVerdict,
  slimExtracted,
  summarizeComparison,
  type CompareAnswer,
  type CompareAnswerOk,
  type ComparePass,
  type PairMetrics
} from "@/lib/model-compare/compare";
import type { CompareEngine } from "@/lib/model-compare/catalogue";

function answer(over: {
  engine?: CompareEngine;
  pass?: ComparePass;
  promptIndex?: number;
  sample?: number;
  mentioned?: boolean;
  position?: number | null;
  brands?: string[];
  domains?: string[];
  sentiment?: CompareAnswerOk["row"]["sentiment"];
  generationModel?: string;
  extractionModel?: string;
}): CompareAnswerOk {
  const mentioned = over.mentioned ?? true;
  const brands = over.brands ?? ["Rival"];
  const domains = over.domains ?? ["rival.com"];
  return {
    engine: over.engine ?? "gemini",
    pass: over.pass ?? "a",
    promptIndex: over.promptIndex ?? 0,
    sample: over.sample ?? 0,
    error: null,
    generationModel: over.generationModel ?? "gemini-3.6-flash",
    extractionModel: over.extractionModel ?? "gemini-3.6-flash",
    usage: { generationIn: 1000, generationOut: 1000, searches: 2, extractionIn: 1000, extractionOut: 0 },
    row: {
      brand_mentioned: mentioned,
      citation_found: domains.length > 0,
      mentioned_competitors_count: brands.length,
      citations_count: domains.length,
      sentiment: over.sentiment ?? (mentioned ? "positive" : "unknown"),
      extracted_json: {
        brand: { mentioned, position: mentioned ? (over.position ?? 1) : null },
        competitors: brands.map((name, i) => ({ name, mentioned: true, position: i + 2 })),
        citations: domains.map((domain) => ({ domain, source: "grounding" })),
        other_brands_mentioned: []
      }
    },
    brandPosition: mentioned ? (over.position ?? 1) : null,
    namedBrands: brands,
    citedDomains: domains
  };
}

const failed = (over: { pass?: ComparePass; promptIndex?: number }): CompareAnswer => ({
  engine: "gemini",
  pass: over.pass ?? "b",
  promptIndex: over.promptIndex ?? 0,
  sample: 0,
  error: "GeminiTimeoutError"
});

describe("catalogue", () => {
  it("lists production's default first for each engine", () => {
    expect(GENERATION_MODELS.gemini[0].id).toBe("gemini-3.6-flash");
    expect(GENERATION_MODELS.openai[0].id).toBe("gpt-4o-mini");
    expect(GENERATION_MODELS.claude[0].id).toBe("claude-haiku-4-5-20251001");
  });

  it("only allows catalogue ids or 'current'", () => {
    expect(isAllowedGenerationModel("gemini", CURRENT)).toBe(true);
    expect(isAllowedGenerationModel("gemini", "gemini-3.1-flash-lite")).toBe(true);
    expect(isAllowedGenerationModel("gemini", "gpt-4o-mini")).toBe(false);
    expect(isAllowedGenerationModel("openai", "gpt-5-pro")).toBe(false);
    expect(findExtractionOption("native")?.choice.kind).toBe("native");
    expect(findExtractionOption("claude:claude-opus")).toBeNull();
    expect(EXTRACTION_OPTIONS.every((o) => o.choice.kind === "native" || priceOf(o.choice.model))).toBe(true);
  });

  it("prices versioned ids reported by the provider", () => {
    expect(priceOf("gpt-4o-mini-2024-07-18")).toEqual({ inPerM: 0.15, outPerM: 0.6 });
    expect(priceOf("claude-haiku-4-5")).toEqual({ inPerM: 1, outPerM: 5 });
    expect(priceOf("gemini-3.1-flash-lite")).toEqual({ inPerM: 0.25, outPerM: 1.5 });
    expect(priceOf("some-unknown-model")).toBeNull();
    expect(priceOf(null)).toBeNull();
  });

  it("estimates a cheaper Gemini answer with the lite model", () => {
    const today = estimateAnswerCost("gemini", CURRENT, CURRENT);
    const lite = estimateAnswerCost("gemini", "gemini-3.1-flash-lite", "gemini-3.1-flash-lite");
    expect(lite).toBeLessThan(today);
    expect(tokenCost({ inPerM: 1, outPerM: 2 }, 1_000_000, 500_000)).toBe(2);
  });
});

describe("slimExtracted", () => {
  it("keeps only what the score reads and drops non-grounding citations", () => {
    const slim = slimExtracted({
      brand: { mentioned: true, position: 2, evidence: "long text" } as never,
      competitors: [{ name: "X", mentioned: true, position: 1, evidence: "…" } as never],
      citations: [
        { domain: "a.com", source: "grounding", url: "https://a.com" } as never,
        { domain: "b.com", source: "text" }
      ],
      other_brands_mentioned: ["Y"]
    });
    expect(slim).toEqual({
      brand: { mentioned: true, position: 2 },
      competitors: [{ name: "X", mentioned: true, position: 1 }],
      citations: [{ domain: "a.com", source: "grounding" }],
      other_brands_mentioned: ["Y"]
    });
  });
});

describe("answerCost", () => {
  it("adds tokens and Gemini's per-query search fee", () => {
    // 1000 in × 0.75 + 1000 out × 3.75 + 1000 in × 0.75 per M, + 2 × 0.014
    expect(answerCost(answer({}))).toBeCloseTo(0.00525 + 0.028, 6);
  });

  it("prices Perplexity's own model, its per-call search fee and Gemini's extraction", () => {
    const perplexity = answer({ engine: "perplexity", generationModel: "perplexity/sonar" });
    // 1000 in × 0.25 + 1000 out × 2.5 per M, + Gemini extraction 1000 in × 0.75 per M, + 2 × 0.0025
    expect(answerCost(perplexity)).toBeCloseTo(0.00275 + 0.00075 + 0.005, 6);
  });

  it("estimates Perplexity's extraction at Gemini's price, the scan's routing", () => {
    const estimate = estimateAnswerCost("perplexity", CURRENT, CURRENT);
    // 300/900 tokens on sonar, 1800/400 on gemini-3.6-flash, 1 search
    expect(estimate).toBeCloseTo((300 * 0.25 + 900 * 2.5 + 1800 * 0.75 + 400 * 3.75) / 1e6 + 0.0025, 6);
  });

  it("is null when a model has no price", () => {
    expect(answerCost(answer({ generationModel: "mystery-model" }))).toBeNull();
  });
});

describe("comparePasses", () => {
  it("pairs by question and repetition and measures agreement", () => {
    const left = [
      answer({ promptIndex: 0, brands: ["A", "B"], domains: ["x.com"] }),
      answer({ promptIndex: 1, mentioned: false, brands: [], domains: [] })
    ];
    const right = [
      answer({ pass: "b", promptIndex: 0, brands: ["A", "C"], domains: ["x.com"], sentiment: "neutral" }),
      answer({ pass: "b", promptIndex: 1, mentioned: true, brands: [], domains: [] })
    ];
    const m = comparePasses(left, right, "gemini");
    expect(m.pairs).toBe(2);
    expect(m.mention).toBe(50);
    // q0: {A,B} vs {A,C} = 1/3; q1: both empty = 1
    expect(m.competitors).toBeCloseTo(66.7, 1);
    // only q0 has both mentioning, sentiments differ
    expect(m.sentiment).toBe(0);
    expect(m.sources).toBe(100);
  });

  it("leaves failed answers out of every denominator", () => {
    const m = comparePasses([answer({ promptIndex: 0 }), answer({ promptIndex: 1 })], [answer({ pass: "b" }), failed({ promptIndex: 1 })], "gemini");
    expect(m.pairs).toBe(1);
    expect(m.mention).toBe(100);
  });

  it("does not measure sources for Claude", () => {
    const m = comparePasses([answer({ engine: "claude" })], [answer({ engine: "claude", pass: "b" })], "claude");
    expect(m.sources).toBeNull();
    expect(m.pairs).toBe(1);
  });
});

describe("decideVerdict", () => {
  const metrics = (value: number): PairMetrics => ({ pairs: 10, mention: value, competitors: value, sentiment: value, sources: value });

  it("reads the candidate against the noise of today's models", () => {
    const noise = metrics(80);
    expect(decideVerdict({ candidate: metrics(77), noise, scoreDelta: 2, noiseScoreDelta: 3 })).toBe("equivalente");
    expect(decideVerdict({ candidate: metrics(72), noise, scoreDelta: 2, noiseScoreDelta: 3 })).toBe("revisar");
    expect(decideVerdict({ candidate: metrics(65), noise, scoreDelta: 2, noiseScoreDelta: 3 })).toBe("distinto");
    expect(decideVerdict({ candidate: metrics(80), noise, scoreDelta: 7, noiseScoreDelta: 3 })).toBe("distinto");
  });

  it("does not punish a perfectly stable baseline for half a point", () => {
    expect(decideVerdict({ candidate: metrics(100), noise: metrics(100), scoreDelta: 1.5, noiseScoreDelta: 0 })).toBe("equivalente");
  });

  it("falls back to fixed thresholds without a noise pass", () => {
    expect(decideVerdict({ candidate: metrics(90), noise: null, scoreDelta: 2, noiseScoreDelta: null })).toBe("equivalente");
    expect(decideVerdict({ candidate: metrics(80), noise: null, scoreDelta: 2, noiseScoreDelta: null })).toBe("revisar");
    expect(decideVerdict({ candidate: metrics(60), noise: null, scoreDelta: 2, noiseScoreDelta: null })).toBe("distinto");
  });

  it("says so when there is nothing to compare", () => {
    expect(decideVerdict({ candidate: { ...metrics(0), pairs: 0 }, noise: null, scoreDelta: null, noiseScoreDelta: null })).toBe("sin_datos");
  });
});

describe("summarizeComparison", () => {
  it("scores each pass with the scan's own composite and projects a scan's cost", () => {
    const answers: CompareAnswer[] = [];
    for (const pass of ["a", "a2", "b"] as ComparePass[]) {
      for (let i = 0; i < 4; i += 1) answers.push(answer({ pass, promptIndex: i, mentioned: i < 2 }));
    }
    answers.push(failed({ pass: "b", promptIndex: 9 }));
    const summary = summarizeComparison({
      answers,
      project: { brand: "Marca", domain: "marca.es" },
      engines: ["gemini"],
      answersPerEngineInScan: 50
    });
    expect(summary.passes.a?.answered).toBe(4);
    expect(summary.passes.b?.failed).toBe(1);
    expect(summary.passes.a?.overall).not.toBeNull();
    expect(summary.passes.b?.overall).toBe(summary.passes.a?.overall);
    expect(summary.engines[0].verdict).toBe("equivalente");
    expect(summary.scanCost.a).toBeCloseTo((0.00525 + 0.028) * 50, 6);
  });

  it("has no noise reference when A2 was not run", () => {
    const summary = summarizeComparison({
      answers: [answer({}), answer({ pass: "b" })],
      project: { brand: "Marca", domain: "marca.es" },
      engines: ["gemini"],
      answersPerEngineInScan: 10
    });
    expect(summary.passes.a2).toBeNull();
    expect(summary.engines[0].noise).toBeNull();
  });
});
