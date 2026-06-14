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

describe("computeRunScoresFromResults — brand_position (docs/adr/0005)", () => {
  /**
   * Builds a row with a valid extracted_json shape for brand_position
   * (brand + competitors, each with mentioned/position), plus a
   * brand_snapshot identifying the brand entity.
   */
  function positionRow(overrides: {
    id: string;
    brand_snapshot?: string | null;
    brand?: { mentioned: boolean; position: number | null };
    competitors?: Array<{ name: string; mentioned: boolean; position: number | null }>;
    extracted_json?: unknown;
  }): ScoreInputRow {
    const { id, brand_snapshot = "MiMarca", brand, competitors, extracted_json } = overrides;
    return row({
      id,
      brand_snapshot,
      extracted_json:
        extracted_json !== undefined
          ? extracted_json
          : {
              brand: brand ?? { mentioned: false, position: null },
              competitors: (competitors ?? []).map((c) => ({
                name: c.name,
                mentioned: c.mentioned,
                position: c.position
              }))
            }
    });
  }

  it("is omitted when no row has a valid extracted_json shape", () => {
    const results = [row({ id: "1" }), row({ id: "2" })];

    const result = computeRunScoresFromResults(results);

    expect(result.details_json.brand_position).toBeUndefined();
  });

  it("computes avg_position with dense ranking and penalizes not-mentioned entities with N+1", () => {
    // N = 1 brand + 1 competitor = 2 tracked entities -> penalized position = 3
    // Prompt 1: brand mentioned at 1, competitor not mentioned -> competitor gets 3
    // Prompt 2: competitor mentioned at 1, brand not mentioned -> brand gets 3
    const results = [
      positionRow({
        id: "1",
        brand: { mentioned: true, position: 1 },
        competitors: [{ name: "Competitor", mentioned: false, position: null }]
      }),
      positionRow({
        id: "2",
        brand: { mentioned: false, position: null },
        competitors: [{ name: "Competitor", mentioned: true, position: 1 }]
      })
    ];

    const result = computeRunScoresFromResults(results);
    const brandPosition = result.details_json.brand_position as {
      prompts_with_position_data: number;
      total_entities: number;
      ranking: Array<{ name: string; is_brand: boolean; avg_position: number; mention_count: number }>;
      brand_avg_position: number | null;
      confidence: "low" | "high";
    };

    expect(brandPosition.prompts_with_position_data).toBe(2);
    expect(brandPosition.total_entities).toBe(2);
    // brand: (1 + 3) / 2 = 2; competitor: (3 + 1) / 2 = 2 -> tied, both 2
    expect(brandPosition.brand_avg_position).toBe(2);
    const brandEntry = brandPosition.ranking.find((e) => e.is_brand);
    const competitorEntry = brandPosition.ranking.find((e) => !e.is_brand);
    expect(brandEntry).toMatchObject({ name: "MiMarca", avg_position: 2, mention_count: 1 });
    expect(competitorEntry).toMatchObject({ name: "Competitor", avg_position: 2, mention_count: 1 });
    // confidence is high: prompts_with_position_data (2) >= total_results (2)
    expect(brandPosition.confidence).toBe("high");
  });

  it("treats a non-null position with mentioned: false as not-mentioned (defensive normalization)", () => {
    // Gemini contradiction: mentioned: false but position: 1. Must be ignored
    // and treated as not-mentioned (penalized position N+1 = 2).
    const results = [
      positionRow({
        id: "1",
        brand: { mentioned: false, position: 1 },
        competitors: []
      })
    ];

    const result = computeRunScoresFromResults(results);
    const brandPosition = result.details_json.brand_position as {
      ranking: Array<{ name: string; avg_position: number; mention_count: number }>;
      brand_avg_position: number | null;
    };

    // total_entities = 1 (brand only) -> penalized position = 2
    expect(brandPosition.brand_avg_position).toBe(2);
    expect(brandPosition.ranking[0]).toMatchObject({ avg_position: 2, mention_count: 0 });
  });

  it("returns confidence: low when prompts_with_position_data < total_results", () => {
    const results = [
      positionRow({ id: "1", brand: { mentioned: true, position: 1 }, competitors: [] }),
      // Row 2 has no valid extracted_json shape (extraction_error case).
      row({ id: "2", extracted_json: null, brand_snapshot: "MiMarca" })
    ];

    const result = computeRunScoresFromResults(results);
    const brandPosition = result.details_json.brand_position as { prompts_with_position_data: number; confidence: string };

    expect(brandPosition.prompts_with_position_data).toBe(1);
    expect(brandPosition.confidence).toBe("low");
  });

  it("is omitted when extracted_json is valid but brand_snapshot is missing", () => {
    const results = [
      positionRow({
        id: "1",
        brand_snapshot: null,
        brand: { mentioned: true, position: 1 },
        competitors: []
      })
    ];

    const result = computeRunScoresFromResults(results);

    expect(result.details_json.brand_position).toBeUndefined();
  });

  it("includes the brand_position formula in formulas_used and assumptions", () => {
    const results = [positionRow({ id: "1", brand: { mentioned: true, position: 1 }, competitors: [] })];

    const result = computeRunScoresFromResults(results);

    expect(result.details_json.formulas_used).toMatchObject({
      brand_position: expect.stringContaining("avg_position(entity)")
    });
    expect(
      (result.details_json.assumptions as string[]).some((a) => a.includes("brand_position"))
    ).toBe(true);
  });
});

describe("computeRunScoresFromResults — geo_score composite (docs/adr/0008)", () => {
  function positionRow(overrides: {
    id: string;
    brand_snapshot?: string | null;
    brand?: { mentioned: boolean; position: number | null };
    competitors?: Array<{ name: string; mentioned: boolean; position: number | null }>;
    extracted_json?: unknown;
    brand_mentioned?: boolean;
    citation_found?: boolean;
    mentioned_competitors_count?: number;
    extraction_error?: string | null;
  }): ScoreInputRow {
    const {
      id,
      brand_snapshot = "MiMarca",
      brand,
      competitors,
      extracted_json,
      brand_mentioned = false,
      citation_found = false,
      mentioned_competitors_count = 0,
      extraction_error = null
    } = overrides;
    return row({
      id,
      brand_snapshot,
      brand_mentioned,
      citation_found,
      mentioned_competitors_count,
      extraction_error,
      extracted_json:
        extracted_json !== undefined
          ? extracted_json
          : {
              brand: brand ?? { mentioned: false, position: null },
              competitors: (competitors ?? []).map((c) => ({
                name: c.name,
                mentioned: c.mentioned,
                position: c.position
              }))
            }
    });
  }

  it("is omitted entirely when totalResults === 0", () => {
    const result = computeRunScoresFromResults([]);

    expect(result.details_json.geo_score).toBeUndefined();
  });

  it("computes the full-data case with all 4 components present", () => {
    // 5 rows, all valid extraction, brand mentioned + cited in all 5 -> high confidence.
    // visibility_score = 100, citation_score = 100.
    // mentioned_competitors_count = 0 in all rows -> competitorPresencePerPrompt = 0
    // brandProtection = 100*0.6 = 60 -> competitor_gap_score = clamp(0,100, 0 + (100-60)*0.4) = 16
    // standing = 100 - 16 = 84
    // brand_position: N = 1 (brand) + 1 (competitor) = 2; brand mentioned at position 1 in every prompt
    // -> brand_avg_position = 1; prominence = (1 - (1-1)/2)*100 = 100
    const results = Array.from({ length: 5 }, (_, i) =>
      positionRow({
        id: String(i),
        brand_mentioned: true,
        citation_found: true,
        brand: { mentioned: true, position: 1 },
        competitors: [{ name: "Competitor", mentioned: false, position: null }]
      })
    );

    const result = computeRunScoresFromResults(results);

    expect(result.visibility_score).toBe(100);
    expect(result.citation_score).toBe(100);
    expect(result.competitor_gap_score).toBe(16);
    expect(result.confidence).toBe("high");

    const geoScore = result.details_json.geo_score as {
      score: number;
      composite_version: string;
      confidence: string;
      inputs_used: string[];
      components: Record<string, { value: number | null; weight: number }>;
      formula: string;
    };

    expect(geoScore).toBeDefined();
    expect(geoScore.composite_version).toBe("geo-score-v1");
    expect(geoScore.inputs_used).toEqual(["presence", "prominence", "standing", "authority"]);
    expect(geoScore.components.presence).toMatchObject({ value: 100, weight: 0.4 });
    expect(geoScore.components.prominence).toMatchObject({ value: 100, weight: 0.25 });
    expect(geoScore.components.standing).toMatchObject({ value: 84, weight: 0.2 });
    expect(geoScore.components.authority).toMatchObject({ value: 100, weight: 0.15 });

    // weighted sum = 100*.40 + 100*.25 + 84*.20 + 100*.15 = 40 + 25 + 16.8 + 15 = 96.8
    expect(geoScore.score).toBe(96.8);
    expect(geoScore.confidence).toBe("high");
    expect(geoScore.formula).toContain("geo_score = Σ(component_value * normalized_weight)");
  });

  it("degraded case: drops prominence and renormalizes weights when brand_position is absent", () => {
    // No valid extracted_json -> brand_position is null -> prominence dropped.
    // visibility_score = 100, citation_score = 100, competitor_gap_score = 16 -> standing = 84.
    const results = Array.from({ length: 5 }, (_, i) =>
      row({ id: String(i), brand_mentioned: true, citation_found: true, extracted_json: { phase: "phase4-basic" } })
    );

    const result = computeRunScoresFromResults(results);

    expect(result.details_json.brand_position).toBeUndefined();
    expect(result.confidence).toBe("high");

    const geoScore = result.details_json.geo_score as {
      score: number;
      confidence: string;
      inputs_used: string[];
      components: Record<string, { value: number | null; weight: number; reason?: string }>;
    };

    expect(geoScore).toBeDefined();
    expect(geoScore.inputs_used).toEqual(["presence", "standing", "authority"]);
    expect(geoScore.inputs_used).not.toContain("prominence");

    // remaining weight sum = 0.40 + 0.20 + 0.15 = 0.75
    // renormalized: presence 0.40/0.75 = 0.5333..., standing 0.20/0.75 = 0.2666..., authority 0.15/0.75 = 0.20
    expect(geoScore.components.presence.weight).toBeCloseTo(0.53, 2);
    expect(geoScore.components.standing.weight).toBeCloseTo(0.27, 2);
    expect(geoScore.components.authority.weight).toBeCloseTo(0.2, 2);
    expect(geoScore.components.prominence).toMatchObject({ value: null, weight: 0 });
    expect(geoScore.components.prominence.reason).toContain("brand_position absent");

    // confidence was "high" but prominence dropped -> capped at "medium"
    expect(geoScore.confidence).toBe("medium");

    // sanity-check the weighted sum with renormalized weights
    // presence=100, standing=84, authority=100
    // score = 100*(0.4/0.75) + 84*(0.2/0.75) + 100*(0.15/0.75)
    const expected = 100 * (0.4 / 0.75) + 84 * (0.2 / 0.75) + 100 * (0.15 / 0.75);
    expect(geoScore.score).toBeCloseTo(expected, 2);
  });

  it("does not cap confidence further when it is already low/medium and prominence is dropped", () => {
    // Single row -> confidence "low" (below medium threshold of 2 results).
    const results = [row({ id: "1", brand_mentioned: true, citation_found: true })];

    const result = computeRunScoresFromResults(results);

    expect(result.confidence).toBe("low");
    const geoScore = result.details_json.geo_score as { confidence: string };
    expect(geoScore.confidence).toBe("low");
  });

  it("is omitted entirely when totalResults === 0 (empty input)", () => {
    const result = computeRunScoresFromResults([]);

    expect(result.details_json.geo_score).toBeUndefined();
    expect("geo_score" in result.details_json).toBe(false);
  });

  it("includes the geo_score formula and composite_version in formulas_used / details_json", () => {
    const results = [row({ id: "1", brand_mentioned: true, citation_found: true })];

    const result = computeRunScoresFromResults(results);

    expect(result.details_json.formulas_used).toMatchObject({
      geo_score: expect.stringContaining("geo_score = Σ(component_value * normalized_weight)")
    });
    expect(
      (result.details_json.assumptions as string[]).some((a) => a.includes("geo_score"))
    ).toBe(true);

    const geoScore = result.details_json.geo_score as { composite_version: string; formula: string };
    expect(geoScore.composite_version).toBe("geo-score-v1");
    expect(geoScore.formula).toContain("standing = 100 - competitor_gap_score");
    expect(geoScore.formula).toContain("prominence = (1 - (brand_avg_position-1)/total_entities)*100");
  });
});
