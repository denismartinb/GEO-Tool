import { describe, expect, it } from "vitest";
import { computeRunScoresFromResults, SCORING_VERSION } from "./run-scoring";

type ScoreInputRow = Parameters<typeof computeRunScoresFromResults>[0][number];

/**
 * Builds a minimal valid result row, overridable per test.
 */
function row(overrides: Partial<ScoreInputRow> = {}): ScoreInputRow {
  return {
    id: "row-1",
    prompt_text_snapshot: "best widgets in spain",
    brand_mentioned: false,
    citation_found: false,
    mentioned_competitors_count: 0,
    citations_count: 0,
    sentiment: "unknown",
    extracted_json: { phase: "phase4-basic" },
    extraction_error: null,
    ...overrides
  };
}

describe("computeRunScoresFromResults — empty input", () => {
  it("handles an empty list without dividing by zero", () => {
    const result = computeRunScoresFromResults([]);

    // safeTotal = max(0, 1) = 1, so every percentage-based score is 0.
    expect(result.visibility_score).toBe(0);
    expect(result.citation_score).toBe(0);
    // competitor_gap_score = clamp(0,100, (0/1)*50 + (100 - 0*0.6)*0.4) = 0 + 40 = 40
    expect(result.competitor_gap_score).toBe(40);
    expect(result.confidence).toBe("low");
    expect(result.details_json.total_results).toBe(0);
    expect(result.details_json.extracted_results_count).toBe(0);
  });
});

describe("computeRunScoresFromResults — visibility and citation percentages", () => {
  it("computes visibility_score and citation_score as percentages of total_results", () => {
    const results = [
      row({ id: "1", brand_mentioned: true, citation_found: true }),
      row({ id: "2", brand_mentioned: true, citation_found: false }),
      row({ id: "3", brand_mentioned: false, citation_found: false }),
      row({ id: "4", brand_mentioned: false, citation_found: false })
    ];

    const result = computeRunScoresFromResults(results);

    // 2/4 brand_mentioned -> 50%, 1/4 citation_found -> 25%
    expect(result.visibility_score).toBe(50);
    expect(result.citation_score).toBe(25);
    expect(result.details_json.brand_mentioned_count).toBe(2);
    expect(result.details_json.citation_found_count).toBe(1);
  });

  it("sums citations_count and mentioned_competitors_count across all rows, ignoring negatives", () => {
    const results = [
      row({ id: "1", citations_count: 3, mentioned_competitors_count: 2 }),
      row({ id: "2", citations_count: -5, mentioned_competitors_count: -1 }),
      row({ id: "3", citations_count: 2, mentioned_competitors_count: 1 })
    ];

    const result = computeRunScoresFromResults(results);

    // Math.max(0, x) clamps the negative contributions to 0.
    expect(result.details_json.total_citations_count).toBe(5);
    expect(result.details_json.total_competitor_mentions).toBe(3);
  });

  it("round2 keeps scores to two decimal places", () => {
    // 1/3 -> 33.333...% -> rounds to 33.33
    const results = [
      row({ id: "1", brand_mentioned: true }),
      row({ id: "2", brand_mentioned: false }),
      row({ id: "3", brand_mentioned: false })
    ];

    const result = computeRunScoresFromResults(results);

    expect(result.visibility_score).toBe(33.33);
  });
});

describe("computeRunScoresFromResults — competitor_gap_score formula and clamping", () => {
  it("computes competitor_gap_score using the documented formula", () => {
    // 4 rows, total_competitor_mentions = 4 -> competitorPresencePerPrompt = (4/4)*50 = 50
    // brand_mentioned_count = 2 -> visibility_score = 50 -> brandProtection = 30
    // competitor_gap_score = 50 + (100 - 30) * 0.4 = 50 + 28 = 78
    const results = [
      row({ id: "1", brand_mentioned: true, mentioned_competitors_count: 1 }),
      row({ id: "2", brand_mentioned: true, mentioned_competitors_count: 1 }),
      row({ id: "3", brand_mentioned: false, mentioned_competitors_count: 1 }),
      row({ id: "4", brand_mentioned: false, mentioned_competitors_count: 1 })
    ];

    const result = computeRunScoresFromResults(results);

    expect(result.visibility_score).toBe(50);
    expect(result.competitor_gap_score).toBe(78);
  });

  it("clamps competitor_gap_score to a maximum of 100 when competitor presence is extreme", () => {
    // total_competitor_mentions = 40 across 2 rows -> competitorPresencePerPrompt = (40/2)*50 = 1000
    // visibility_score = 0 -> brandProtection = 0 -> + (100-0)*0.4 = 40
    // raw = 1000 + 40 = 1040, clamped to 100
    const results = [
      row({ id: "1", mentioned_competitors_count: 20 }),
      row({ id: "2", mentioned_competitors_count: 20 })
    ];

    const result = computeRunScoresFromResults(results);

    expect(result.competitor_gap_score).toBe(100);
  });

  it("stays within the [0,100] clamp even at the low end (visibility 100, no competitor mentions)", () => {
    // totalCompetitorMentions = 0, visibility_score = 100 -> brandProtection = 60
    // raw = 0 + (100-60)*0.4 = 16
    const results = [
      row({ id: "1", brand_mentioned: true, mentioned_competitors_count: 0 }),
      row({ id: "2", brand_mentioned: true, mentioned_competitors_count: 0 })
    ];

    const result = computeRunScoresFromResults(results);

    expect(result.visibility_score).toBe(100);
    expect(result.competitor_gap_score).toBe(16);
    expect(result.competitor_gap_score).toBeGreaterThanOrEqual(0);
    expect(result.competitor_gap_score).toBeLessThanOrEqual(100);
  });
});

describe("computeRunScoresFromResults — confidence buckets", () => {
  it("is low when extraction coverage is incomplete (some rows missing extracted_json)", () => {
    const results = [
      row({ id: "1", extracted_json: { phase: "phase4-basic" } }),
      row({ id: "2", extracted_json: null }),
      row({ id: "3", extracted_json: { phase: "phase4-basic" } }),
      row({ id: "4", extracted_json: { phase: "phase4-basic" } }),
      row({ id: "5", extracted_json: { phase: "phase4-basic" } })
    ];

    const result = computeRunScoresFromResults(results);

    expect(result.confidence).toBe("low");
    expect(result.details_json.extracted_results_count).toBe(4);
    expect(result.details_json.total_results).toBe(5);
  });

  it("is low when any row has an extraction_error, even with full extraction coverage", () => {
    const results = [
      row({ id: "1", extraction_error: "boom" }),
      row({ id: "2" }),
      row({ id: "3" }),
      row({ id: "4" }),
      row({ id: "5" })
    ];

    const result = computeRunScoresFromResults(results);

    expect(result.confidence).toBe("low");
    expect(result.details_json.extraction_error_count).toBe(1);
    // Coverage is complete (extracted_json present on all 5) yet confidence is
    // still forced to low because of the extraction error.
    expect(result.details_json.extracted_results_count).toBe(5);
  });

  it("is high with >=5 results and full extraction coverage (>=0.8)", () => {
    const results = Array.from({ length: 5 }, (_, i) => row({ id: String(i) }));

    const result = computeRunScoresFromResults(results);

    expect(result.confidence).toBe("high");
    expect(result.details_json.total_results).toBe(5);
  });

  it("is medium with >=2 and <5 fully-extracted results", () => {
    const results = [row({ id: "1" }), row({ id: "2" })];

    const result = computeRunScoresFromResults(results);

    expect(result.confidence).toBe("medium");
  });

  it("is low with a single fully-extracted result (below the medium threshold of 2)", () => {
    const results = [row({ id: "1" })];

    const result = computeRunScoresFromResults(results);

    expect(result.confidence).toBe("low");
  });
});

describe("computeRunScoresFromResults — details_json contents", () => {
  it("includes scoring_version, total_results, formulas_used, assumptions and per_prompt_summary", () => {
    const results = [
      row({ id: "1", sentiment: "positive" }),
      row({ id: "2", sentiment: "positive" }),
      row({ id: "3", sentiment: "negative" })
    ];

    const result = computeRunScoresFromResults(results);

    expect(result.details_json.scoring_version).toBe(SCORING_VERSION);
    expect(result.details_json.total_results).toBe(3);
    expect(result.details_json.sentiment_distribution).toEqual({ positive: 2, negative: 1 });
    expect(result.details_json.formulas_used).toMatchObject({
      visibility_score: "brand_mentioned_count / total_results * 100",
      citation_score: "citation_found_count / total_results * 100",
      competitor_gap_score:
        "clamp(0,100, (total_competitor_mentions/total_results)*50 + (100 - visibility_score*0.6)*0.4 )"
    });
    expect(Array.isArray(result.details_json.assumptions)).toBe(true);
    expect(Array.isArray(result.details_json.per_prompt_summary)).toBe(true);
    expect((result.details_json.per_prompt_summary as unknown[]).length).toBe(3);
  });

  it("notes incomplete extraction coverage in assumptions, and complete coverage otherwise", () => {
    const incomplete = computeRunScoresFromResults([row({ id: "1" }), row({ id: "2", extracted_json: null })]);
    expect(
      (incomplete.details_json.assumptions as string[]).some((a) => a.includes("partial extraction coverage"))
    ).toBe(true);

    const complete = computeRunScoresFromResults([row({ id: "1" }), row({ id: "2" })]);
    expect(
      (complete.details_json.assumptions as string[]).some((a) => a.includes("Extraction coverage is complete"))
    ).toBe(true);
  });

  it("caps per_prompt_summary at 10 entries even with more results", () => {
    const results = Array.from({ length: 15 }, (_, i) => row({ id: String(i) }));

    const result = computeRunScoresFromResults(results);

    expect((result.details_json.per_prompt_summary as unknown[]).length).toBe(10);
    expect(result.details_json.total_results).toBe(15);
  });
});
