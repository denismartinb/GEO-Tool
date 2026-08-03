import { describe, expect, it } from "vitest";
import { EXTRACTION_VERSION } from "@/lib/scan/constants";
import { MIN_RESPONSES_FOR_BAND } from "@/lib/scoring/score-reliability";
import {
  computeJointPotentialPoints,
  computeRecommendationPotentialPoints,
  computeRunScoresFromResults,
  getEffectiveGeoScore,
  isQuantifiableRecommendationType,
  SCORING_VERSION
} from "./run-scoring";

type ScoreInputRow = Parameters<typeof computeRunScoresFromResults>[0][number];

const PROJECT_DOMAIN = "miempresa.com";

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

/** A real grounding citation pointing at the project's own domain (docs/adr/0013). */
function ownDomainCitation(domain: string = PROJECT_DOMAIN) {
  return { url: `https://${domain}/page`, domain, title: "Page", source: "grounding" as const, confidence: "high" as const };
}

/** A real grounding citation pointing at an unrelated third-party domain. */
function thirdPartyCitation(domain: string = "otrofabricante.com") {
  return { url: `https://${domain}/page`, domain, title: "Page", source: "grounding" as const, confidence: "high" as const };
}

describe("computeRunScoresFromResults — empty input", () => {
  it("handles an empty list without dividing by zero", () => {
    const result = computeRunScoresFromResults([], PROJECT_DOMAIN);

    // safeTotal = max(0, 1) = 1, so every percentage-based score is 0.
    expect(result.visibility_score).toBe(0);
    expect(result.citation_score).toBe(0);
    // competitor_gap_score (Competitive Pressure) = displaced_prompts_count / safeTotal * 100 = 0/1*100 = 0
    expect(result.competitor_gap_score).toBe(0);
    expect(result.confidence).toBe("low");
    expect(result.details_json.total_results).toBe(0);
    expect(result.details_json.extracted_results_count).toBe(0);
  });
});

describe("computeRunScoresFromResults — visibility and citation percentages", () => {
  it("computes visibility_score and citation_score as percentages of total_results", () => {
    const results = [
      row({
        id: "1",
        brand_mentioned: true,
        citation_found: true,
        extracted_json: { phase: "phase4-basic", citations: [ownDomainCitation()] }
      }),
      row({ id: "2", brand_mentioned: true, citation_found: false }),
      row({ id: "3", brand_mentioned: false, citation_found: false }),
      row({ id: "4", brand_mentioned: false, citation_found: false })
    ];

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);

    // 2/4 brand_mentioned -> 50%, 1/4 cites its own domain -> 25%
    expect(result.visibility_score).toBe(50);
    expect(result.citation_score).toBe(25);
    expect(result.details_json.brand_mentioned_count).toBe(2);
    expect(result.details_json.own_domain_citation_count).toBe(1);
    expect(result.details_json.citation_found_count).toBe(1);
  });

  it("sums citations_count and mentioned_competitors_count across all rows, ignoring negatives", () => {
    const results = [
      row({ id: "1", citations_count: 3, mentioned_competitors_count: 2 }),
      row({ id: "2", citations_count: -5, mentioned_competitors_count: -1 }),
      row({ id: "3", citations_count: 2, mentioned_competitors_count: 1 })
    ];

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);

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

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);

    expect(result.visibility_score).toBe(33.33);
  });
});

describe("computeRunScoresFromResults — grounding-aware citation_score (docs/adr/0012)", () => {
  it("treats a row with no provider set as grounded (backward compatibility)", () => {
    const results = [
      row({
        id: "1",
        citation_found: true,
        extracted_json: { phase: "phase4-basic", citations: [ownDomainCitation()] }
      }),
      row({ id: "2", citation_found: false })
    ];

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);

    expect(result.citation_score).toBe(50);
    expect(result.details_json.own_domain_citation_count).toBe(1);
    expect(result.details_json.citation_score_data_available).toBe(true);
    expect(result.details_json.grounded_results_count).toBe(2);
  });

  it("excludes ungrounded provider rows (e.g. claude) from citation_score, but keeps them in citation_score_blended", () => {
    // 2 gemini rows (1 cited, pointing at the brand's own domain), 2 claude
    // rows (never cited, no grounding) -> citation_score must be 1/2 = 50
    // (gemini-only), NOT 1/4 = 25 (pooled).
    const results = [
      row({
        id: "1",
        provider: "gemini",
        citation_found: true,
        extracted_json: { phase: "phase4-basic", citations: [ownDomainCitation()] }
      }),
      row({ id: "2", provider: "gemini", citation_found: false }),
      row({ id: "3", provider: "claude", citation_found: false }),
      row({ id: "4", provider: "claude", citation_found: false })
    ];

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);

    expect(result.citation_score).toBe(50);
    expect(result.details_json.citation_score_any_domain).toBe(50);
    expect(result.details_json.citation_score_blended).toBe(25);
    expect(result.details_json.citation_score_data_available).toBe(true);
    expect(result.details_json.grounded_results_count).toBe(2);
    expect(result.details_json.citation_by_provider).toEqual({
      gemini: { total: 2, citation_found_count: 1 },
      claude: { total: 2, citation_found_count: 0 }
    });
  });

  it("treats openai as a grounded provider (real web_search grounding), counting its rows in citation_score", () => {
    // 2 openai rows (1 cited to own domain), 2 claude rows (ungrounded) ->
    // citation_score = 1/2 = 50 over grounded providers, same as gemini would
    // be. If openai were mistakenly excluded, grounded_results_count would be
    // 0 and citation_score_data_available false.
    const results = [
      row({
        id: "1",
        provider: "openai",
        citation_found: true,
        extracted_json: { phase: "phase4-basic", citations: [ownDomainCitation()] }
      }),
      row({ id: "2", provider: "openai", citation_found: false }),
      row({ id: "3", provider: "claude", citation_found: false }),
      row({ id: "4", provider: "claude", citation_found: false })
    ];

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);

    expect(result.citation_score).toBe(50);
    expect(result.details_json.citation_score_data_available).toBe(true);
    expect(result.details_json.grounded_results_count).toBe(2);
    expect(result.details_json.citation_by_provider).toEqual({
      openai: { total: 2, citation_found_count: 1 },
      claude: { total: 2, citation_found_count: 0 }
    });
  });

  it("falls back to citation_score = 0 with citation_score_data_available: false when no grounded provider rows exist", () => {
    const results = [
      row({ id: "1", provider: "claude", citation_found: false }),
      row({ id: "2", provider: "claude", citation_found: false })
    ];

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);

    expect(result.citation_score).toBe(0);
    expect(result.details_json.citation_score_data_available).toBe(false);
    expect(result.details_json.grounded_results_count).toBe(0);
  });

  it("falls back to citation_score = 0 with citation_score_data_available: false when no project domain is provided, even with grounded rows present", () => {
    const results = [
      row({
        id: "1",
        citation_found: true,
        extracted_json: { phase: "phase4-basic", citations: [ownDomainCitation()] }
      })
    ];

    const result = computeRunScoresFromResults(results, "");

    expect(result.citation_score).toBe(0);
    expect(result.details_json.citation_score_data_available).toBe(false);
    expect(result.details_json.grounded_results_count).toBe(1);
  });

  it("drops the authority component of geo_score and caps confidence at medium when no grounded rows exist", () => {
    // 20 rows so run confidence is "high" (ADR 0015 threshold) and the cap is observable.
    const results = Array.from({ length: 20 }, (_, i) =>
      row({ id: String(i), provider: "claude", brand_mentioned: true })
    );

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);
    expect(result.confidence).toBe("high");

    const geoScore = result.details_json.geo_score as {
      confidence: string;
      inputs_used: string[];
      components: Record<string, { value: number | null; weight: number; reason?: string }>;
    };

    expect(geoScore.inputs_used).not.toContain("authority");
    expect(geoScore.components.authority).toMatchObject({ value: null, weight: 0 });
    expect(geoScore.components.authority.reason).toContain("docs/adr/0012");
    expect(geoScore.confidence).toBe("medium");
  });
});

describe("computeRunScoresFromResults — own-domain citation_score (docs/adr/0013)", () => {
  it("does not count a grounding citation to a third-party domain toward citation_score, even though citation_found is true", () => {
    // The AI cited a source while answering, but that source is not the
    // brand's own domain (e.g. a competitor or an unrelated third party).
    // citation_found is true (a real grounding citation exists), but
    // citation_score (own-domain) must stay 0 — this is the exact
    // "Authority 100% / Cuota de Citas 0%" contradiction this ADR fixes.
    const results = [
      row({
        id: "1",
        citation_found: true,
        extracted_json: { phase: "phase4-basic", citations: [thirdPartyCitation()] }
      })
    ];

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);

    expect(result.citation_score).toBe(0);
    expect(result.details_json.own_domain_citation_count).toBe(0);
    // The demoted "any domain" formula still reflects the real citation.
    expect(result.details_json.citation_score_any_domain).toBe(100);
  });

  it("counts a grounding citation to the project's own domain toward citation_score", () => {
    const results = [
      row({
        id: "1",
        citation_found: true,
        extracted_json: { phase: "phase4-basic", citations: [ownDomainCitation()] }
      })
    ];

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);

    expect(result.citation_score).toBe(100);
    expect(result.details_json.own_domain_citation_count).toBe(1);
  });

  it("matches a subdomain of the project's own domain", () => {
    const results = [
      row({
        id: "1",
        citation_found: true,
        extracted_json: { phase: "phase4-basic", citations: [ownDomainCitation(`blog.${PROJECT_DOMAIN}`)] }
      })
    ];

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);

    expect(result.citation_score).toBe(100);
  });

  it("does not count an inline (non-grounding) citation to the own domain, mirroring own_citation_share's grounding-only scope (docs/adr/0010)", () => {
    const results = [
      row({
        id: "1",
        citation_found: false,
        extracted_json: {
          phase: "phase4-basic",
          citations: [{ url: `https://${PROJECT_DOMAIN}/page`, domain: PROJECT_DOMAIN, title: "Page", source: "inline" as const, confidence: "low" as const }]
        }
      })
    ];

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);

    expect(result.citation_score).toBe(0);
    expect(result.details_json.own_domain_citation_count).toBe(0);
  });

  it("counts a row as own-domain-cited when at least one of several citations matches, even if others don't", () => {
    const results = [
      row({
        id: "1",
        citation_found: true,
        extracted_json: {
          phase: "phase4-basic",
          citations: [thirdPartyCitation(), ownDomainCitation(), thirdPartyCitation("otraweb.com")]
        }
      })
    ];

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);

    expect(result.citation_score).toBe(100);
    expect(result.details_json.own_domain_citation_count).toBe(1);
  });
});

describe("computeRunScoresFromResults — competitor_gap_score (Competitive Pressure, docs/adr/0011)", () => {
  it("computes competitor_gap_score as % of prompts where a competitor is mentioned but the brand is not", () => {
    // Row 1: brand mentioned, competitor mentioned -> NOT displaced (brand present).
    // Row 2: brand mentioned, competitor mentioned -> NOT displaced.
    // Row 3: brand absent, competitor mentioned -> displaced.
    // Row 4: brand absent, competitor mentioned -> displaced.
    // displaced_prompts_count = 2 -> competitor_gap_score = 2/4*100 = 50
    const results = [
      row({ id: "1", brand_mentioned: true, mentioned_competitors_count: 1 }),
      row({ id: "2", brand_mentioned: true, mentioned_competitors_count: 1 }),
      row({ id: "3", brand_mentioned: false, mentioned_competitors_count: 1 }),
      row({ id: "4", brand_mentioned: false, mentioned_competitors_count: 1 })
    ];

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);

    expect(result.visibility_score).toBe(50);
    expect(result.competitor_gap_score).toBe(50);
    expect(result.details_json.displaced_prompts_count).toBe(2);
  });

  it("does not saturate to 100 just because many competitors are mentioned per prompt (the old formula's bug)", () => {
    // 20 competitor mentions per row, but the brand is also mentioned in
    // every row -> zero displacement, despite a huge raw mention count.
    const results = [
      row({ id: "1", brand_mentioned: true, mentioned_competitors_count: 20 }),
      row({ id: "2", brand_mentioned: true, mentioned_competitors_count: 20 })
    ];

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);

    expect(result.details_json.total_competitor_mentions).toBe(40);
    expect(result.competitor_gap_score).toBe(0);
  });

  it("is 100 when every prompt with a competitor mention has the brand absent (maximum displacement)", () => {
    const results = [
      row({ id: "1", brand_mentioned: false, mentioned_competitors_count: 3 }),
      row({ id: "2", brand_mentioned: false, mentioned_competitors_count: 1 })
    ];

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);

    expect(result.competitor_gap_score).toBe(100);
  });

  it("is 0 when no prompt has a competitor mention, regardless of visibility", () => {
    const results = [
      row({ id: "1", brand_mentioned: true, mentioned_competitors_count: 0 }),
      row({ id: "2", brand_mentioned: false, mentioned_competitors_count: 0 })
    ];

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);

    expect(result.competitor_gap_score).toBe(0);
  });

  it("does not count a prompt as displaced when a competitor is mentioned alongside the brand", () => {
    // Brand mentioned AND competitor mentioned in the same prompt -> brand
    // is not displaced, even though a competitor is present.
    const results = [row({ id: "1", brand_mentioned: true, mentioned_competitors_count: 5 })];

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);

    expect(result.competitor_gap_score).toBe(0);
  });

  it("stays within the [0,100] range by construction", () => {
    const results = [
      row({ id: "1", brand_mentioned: false, mentioned_competitors_count: 1 }),
      row({ id: "2", brand_mentioned: true, mentioned_competitors_count: 0 })
    ];

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);

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

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);

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

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);

    expect(result.confidence).toBe("low");
    expect(result.details_json.extraction_error_count).toBe(1);
    // Coverage is complete (extracted_json present on all 5) yet confidence is
    // still forced to low because of the extraction error.
    expect(result.details_json.extracted_results_count).toBe(5);
  });

  it("is high with >=20 results and full extraction coverage (>=0.8) — ADR 0015", () => {
    const results = Array.from({ length: 20 }, (_, i) => row({ id: String(i) }));

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);

    expect(result.confidence).toBe("high");
    expect(result.details_json.total_results).toBe(20);
  });

  it("is medium from MIN_RESPONSES_FOR_BAND up to 19 fully-extracted results", () => {
    for (const size of [MIN_RESPONSES_FOR_BAND, 19]) {
      const results = Array.from({ length: size }, (_, i) => row({ id: String(i) }));

      const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);

      expect(result.confidence).toBe("medium");
    }
  });

  it("is low below MIN_RESPONSES_FOR_BAND even with perfect extraction (GEO-SCORE-RELIABILITY-1)", () => {
    // Previously 2..4 results were "medium" and 5..19 were "medium" too, so a
    // 2-response run and a 19-response run were presented identically. Below
    // MIN_RESPONSES_FOR_BAND a single AI answer moves the mention rate by
    // >=10 points, which no amount of extraction quality compensates for —
    // the limit is the sample, not the parsing.
    for (const size of [2, 3, 5, MIN_RESPONSES_FOR_BAND - 1]) {
      const results = Array.from({ length: size }, (_, i) => row({ id: String(i) }));

      const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);

      expect(result.confidence).toBe("low");
      expect(result.details_json.extraction_error_count).toBe(0);
      expect(result.details_json.extracted_results_count).toBe(size);
    }
  });

  it("is low with a single fully-extracted result", () => {
    const results = [row({ id: "1" })];

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);

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

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);

    expect(result.details_json.scoring_version).toBe(SCORING_VERSION);
    expect(result.details_json.total_results).toBe(3);
    expect(result.details_json.sentiment_distribution).toEqual({ positive: 2, negative: 1 });
    expect(result.details_json.formulas_used).toMatchObject({
      visibility_score: "brand_mentioned_count / total_results * 100",
      citation_score: expect.stringContaining("grounded providers"),
      competitor_gap_score:
        "clamp(0,100, (displaced_prompts_count / total_results) * 100 ); displaced_prompts_count = prompts where mentioned_competitors_count > 0 AND brand_mentioned is false (docs/adr/0011)"
    });
    expect(Array.isArray(result.details_json.assumptions)).toBe(true);
    expect(Array.isArray(result.details_json.per_prompt_summary)).toBe(true);
    expect((result.details_json.per_prompt_summary as unknown[]).length).toBe(3);
  });

  it("notes incomplete extraction coverage in assumptions, and complete coverage otherwise", () => {
    const incomplete = computeRunScoresFromResults(
      [row({ id: "1" }), row({ id: "2", extracted_json: null })],
      PROJECT_DOMAIN
    );
    expect(
      (incomplete.details_json.assumptions as string[]).some((a) => a.includes("partial extraction coverage"))
    ).toBe(true);

    const complete = computeRunScoresFromResults([row({ id: "1" }), row({ id: "2" })], PROJECT_DOMAIN);
    expect(
      (complete.details_json.assumptions as string[]).some((a) => a.includes("Extraction coverage is complete"))
    ).toBe(true);
  });

  it("caps per_prompt_summary at 10 entries even with more results", () => {
    const results = Array.from({ length: 15 }, (_, i) => row({ id: String(i) }));

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);

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

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);

    expect(result.details_json.brand_position).toBeUndefined();
  });

  it("averages rank over ONLY the prompts where the entity was mentioned (geo-score-v3)", () => {
    // Prompt 1: brand at rank 1, competitor absent.
    // Prompt 2: competitor at rank 1, brand absent.
    // Each was mentioned exactly once, at rank 1 -> both 1.0 when mentioned.
    // The pre-v3 figure folded the N+1 penalty in and reported 2 for both,
    // which said nothing about rank and everything about frequency.
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

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);
    const brandPosition = result.details_json.brand_position as {
      prompts_with_position_data: number;
      total_entities: number;
      ranking: Array<{
        name: string;
        is_brand: boolean;
        avg_position_when_mentioned: number | null;
        mention_count: number;
        prompt_count: number;
        mention_rate: number;
        avg_position_penalized: number;
      }>;
      brand_avg_position_when_mentioned: number | null;
      brand_mention_count: number;
      confidence: "low" | "high";
    };

    expect(brandPosition.prompts_with_position_data).toBe(2);
    expect(brandPosition.total_entities).toBe(2);
    expect(brandPosition.brand_avg_position_when_mentioned).toBe(1);
    expect(brandPosition.brand_mention_count).toBe(1);

    const brandEntry = brandPosition.ranking.find((e) => e.is_brand)!;
    const competitorEntry = brandPosition.ranking.find((e) => !e.is_brand)!;
    expect(brandEntry).toMatchObject({
      name: "MiMarca",
      avg_position_when_mentioned: 1,
      mention_count: 1,
      prompt_count: 2,
      mention_rate: 50
    });
    expect(competitorEntry).toMatchObject({ name: "Competitor", avg_position_when_mentioned: 1, mention_rate: 50 });

    // The retained pre-v3 figure still shows the blend: (1 + 3) / 2 = 2 each.
    expect(brandEntry.avg_position_penalized).toBe(2);
    expect(competitorEntry.avg_position_penalized).toBe(2);
    expect(brandPosition.confidence).toBe("high");
  });

  it("separates rank from frequency — the defect that motivated v3", () => {
    // Every entity ranks 2nd whenever it appears. Only how OFTEN they appear
    // differs. v3 must report an identical rank for all of them and carry the
    // difference in mention_rate; the pre-v3 figure spread them apart and
    // presented that spread as if it were a ranking.
    const appearances: Record<string, number> = { MiMarca: 8, Rival1: 4, Rival2: 2, Rival3: 1 };
    const results = Array.from({ length: 8 }, (_, i) =>
      positionRow({
        id: `p${i}`,
        brand: { mentioned: i < appearances.MiMarca, position: i < appearances.MiMarca ? 2 : null },
        competitors: ["Rival1", "Rival2", "Rival3"].map((name) => ({
          name,
          mentioned: i < appearances[name],
          position: i < appearances[name] ? 2 : null
        }))
      })
    );

    const ranking = (
      computeRunScoresFromResults(results, PROJECT_DOMAIN).details_json.brand_position as {
        ranking: Array<{ avg_position_when_mentioned: number | null; mention_rate: number; avg_position_penalized: number }>;
      }
    ).ranking;

    for (const entry of ranking) expect(entry.avg_position_when_mentioned).toBe(2);
    expect(ranking.map((e) => e.mention_rate).sort((a, b) => b - a)).toEqual([100, 50, 25, 12.5]);

    const penalized = ranking.map((e) => e.avg_position_penalized);
    expect(Math.max(...penalized)).toBeGreaterThan(Math.min(...penalized));
  });

  it("gives a never-mentioned entity no rank at all, and sorts it last", () => {
    const results = [
      positionRow({
        id: "1",
        brand: { mentioned: true, position: 3 },
        competitors: [
          { name: "Visible", mentioned: true, position: 1 },
          { name: "Ausente", mentioned: false, position: null }
        ]
      })
    ];

    const ranking = (
      computeRunScoresFromResults(results, PROJECT_DOMAIN).details_json.brand_position as {
        ranking: Array<{ name: string; avg_position_when_mentioned: number | null }>;
      }
    ).ranking;

    expect(ranking.map((e) => e.name)).toEqual(["Visible", "MiMarca", "Ausente"]);
    expect(ranking[2].avg_position_when_mentioned).toBeNull();
  });

  it("treats a non-null position with mentioned: false as not-mentioned (defensive normalization)", () => {
    // Gemini contradiction: mentioned: false but position: 1. Must be ignored.
    // Under v3 that means NO rank at all, not a penalized one.
    const results = [positionRow({ id: "1", brand: { mentioned: false, position: 1 }, competitors: [] })];

    const brandPosition = computeRunScoresFromResults(results, PROJECT_DOMAIN).details_json.brand_position as {
      ranking: Array<{ avg_position_when_mentioned: number | null; mention_count: number; avg_position_penalized: number }>;
      brand_avg_position_when_mentioned: number | null;
      brand_mention_count: number;
    };

    expect(brandPosition.brand_avg_position_when_mentioned).toBeNull();
    expect(brandPosition.brand_mention_count).toBe(0);
    expect(brandPosition.ranking[0]).toMatchObject({
      avg_position_when_mentioned: null,
      mention_count: 0,
      avg_position_penalized: 2
    });
  });

  it("returns confidence: low when prompts_with_position_data < total_results", () => {
    const results = [
      positionRow({ id: "1", brand: { mentioned: true, position: 1 }, competitors: [] }),
      // Row 2 has no valid extracted_json shape (extraction_error case).
      row({ id: "2", extracted_json: null, brand_snapshot: "MiMarca" })
    ];

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);
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

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);

    expect(result.details_json.brand_position).toBeUndefined();
  });

  it("includes the brand_position formula in formulas_used and assumptions", () => {
    const results = [positionRow({ id: "1", brand: { mentioned: true, position: 1 }, competitors: [] })];

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);

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
    citations?: unknown[];
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
      extraction_error = null,
      citations = []
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
              })),
              citations
            }
    });
  }

  it("is omitted entirely when totalResults === 0", () => {
    const result = computeRunScoresFromResults([], PROJECT_DOMAIN);

    expect(result.details_json.geo_score).toBeUndefined();
  });

  it("computes the full-data case with all 4 components present", () => {
    // 20 rows (high confidence per ADR 0015), all valid extraction, brand
    // mentioned + cited (own domain) in every row.
    // visibility_score = 100, citation_score = 100.
    // mentioned_competitors_count = 0 in all rows -> share of voice = 20/(20+0) = 100 -> standing = 100
    // brand_position: N = 1 (brand) + 1 (competitor) = 2; brand mentioned at position 1 in every prompt
    // -> brand_avg_position = 1; prominence = (1 - (1-1)/2)*100 = 100
    const results = Array.from({ length: 20 }, (_, i) =>
      positionRow({
        id: String(i),
        brand_mentioned: true,
        citation_found: true,
        brand: { mentioned: true, position: 1 },
        competitors: [{ name: "Competitor", mentioned: false, position: null }],
        citations: [ownDomainCitation()]
      })
    );

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);

    expect(result.visibility_score).toBe(100);
    expect(result.citation_score).toBe(100);
    expect(result.competitor_gap_score).toBe(0);
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
    expect(geoScore.composite_version).toBe("geo-score-v3");
    expect(geoScore.inputs_used).toEqual(["presence", "prominence", "standing", "authority"]);
    expect(geoScore.components.presence).toMatchObject({ value: 100, weight: 0.4 });
    expect(geoScore.components.prominence).toMatchObject({ value: 100, weight: 0.25 });
    expect(geoScore.components.standing).toMatchObject({ value: 100, weight: 0.2 });
    expect(geoScore.components.authority).toMatchObject({ value: 100, weight: 0.15 });

    // weighted sum = 100*.40 + 100*.25 + 100*.20 + 100*.15 = 100
    expect(geoScore.score).toBe(100);
    expect(geoScore.confidence).toBe("high");
    expect(geoScore.formula).toContain("geo_score = Σ(component_value * normalized_weight)");
  });

  it("degraded case: drops prominence and renormalizes weights when brand_position is absent", () => {
    // No valid brand/competitors shape -> brand_position is null -> prominence dropped.
    // visibility_score = 100, citation_score = 100 (own-domain cited),
    // share of voice = 20/(20+0) = 100 -> standing = 100. 20 rows so run
    // confidence is "high" (ADR 0015) and the prominence cap is observable.
    const results = Array.from({ length: 20 }, (_, i) =>
      row({
        id: String(i),
        brand_mentioned: true,
        citation_found: true,
        extracted_json: { phase: "phase4-basic", citations: [ownDomainCitation()] }
      })
    );

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);

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
    // presence=100, standing=100, authority=100 -> score = 100
    const expected = 100 * (0.4 / 0.75) + 100 * (0.2 / 0.75) + 100 * (0.15 / 0.75);
    expect(geoScore.score).toBeCloseTo(expected, 2);
  });

  it("does not cap confidence further when it is already low/medium and prominence is dropped", () => {
    // Single row -> confidence "low" (below medium threshold of 2 results).
    const results = [row({ id: "1", brand_mentioned: true, citation_found: true })];

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);

    expect(result.confidence).toBe("low");
    const geoScore = result.details_json.geo_score as { confidence: string };
    expect(geoScore.confidence).toBe("low");
  });

  it("is omitted entirely when totalResults === 0 (empty input)", () => {
    const result = computeRunScoresFromResults([], PROJECT_DOMAIN);

    expect(result.details_json.geo_score).toBeUndefined();
    expect("geo_score" in result.details_json).toBe(false);
  });

  it("includes the geo_score formula and composite_version in formulas_used / details_json", () => {
    const results = [row({ id: "1", brand_mentioned: true, citation_found: true })];

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);

    expect(result.details_json.formulas_used).toMatchObject({
      geo_score: expect.stringContaining("geo_score = Σ(component_value * normalized_weight)")
    });
    expect(
      (result.details_json.assumptions as string[]).some((a) => a.includes("geo_score"))
    ).toBe(true);

    const geoScore = result.details_json.geo_score as { composite_version: string; formula: string };
    expect(geoScore.composite_version).toBe("geo-score-v3");
    expect(geoScore.formula).toContain("standing = share of voice");
    expect(geoScore.formula).toContain("standing_v1");
    expect(geoScore.formula).toContain("prominence = (1 - (brand_avg_position_when_mentioned-1)/total_entities)*100");
  });

  it("standing is real share of voice, with the v1 value retained as standing_v1 (ADR 0015)", () => {
    // brand mentioned in 2 of 3 prompts; competitors: 2 mentions on a
    // brand-present prompt + 1 mention on the brand-absent prompt.
    // share of voice = 2 / (2 + 3) = 40.
    // v1 (100 - competitive pressure): displaced prompts = 1 of 3 -> 100 - 33.33 = 66.67.
    const results = [
      row({ id: "1", brand_mentioned: true, mentioned_competitors_count: 2 }),
      row({ id: "2", brand_mentioned: true, mentioned_competitors_count: 0 }),
      row({ id: "3", brand_mentioned: false, mentioned_competitors_count: 1 })
    ];

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);

    const geoScore = result.details_json.geo_score as {
      standing_v1: number;
      components: Record<string, { value: number | null }>;
    };

    expect(geoScore.components.standing.value).toBe(40);
    expect(geoScore.standing_v1).toBe(66.67);
  });

  it("empty market: drops standing (no voice to share) instead of awarding 100 (ADR 0015)", () => {
    // Brand never mentioned AND no tracked competitor mentioned anywhere.
    // v1 scored standing = 100 here (pressure 0), giving an invisible brand
    // ~20/100; v2 drops the component and renormalizes.
    const results = [
      row({ id: "1", brand_mentioned: false, mentioned_competitors_count: 0 }),
      row({ id: "2", brand_mentioned: false, mentioned_competitors_count: 0 })
    ];

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);

    const geoScore = result.details_json.geo_score as {
      score: number;
      inputs_used: string[];
      components: Record<string, { value: number | null; weight: number; reason?: string }>;
    };

    expect(geoScore.inputs_used).not.toContain("standing");
    expect(geoScore.components.standing).toMatchObject({ value: null, weight: 0 });
    expect(geoScore.components.standing.reason).toContain("share-of-voice denominator");
    // presence = 0 and authority = 0 are the only scoring inputs left
    // (prominence also dropped, no position data) -> composite is 0, not ~20.
    expect(geoScore.score).toBe(0);
  });
});

describe("computeRunScoresFromResults — SCAN-TRACKED-SET-1 guards (docs/adr/0018)", () => {
  /** Row with a valid brand_position shape: brand + N competitors, each with mentioned/position. */
  function trackedRow(overrides: {
    id: string;
    brand_mentioned?: boolean;
    mentioned_competitors_count?: number;
    brand?: { mentioned: boolean; position: number | null };
    competitors?: Array<{ name: string; mentioned: boolean; position: number | null }>;
    extraction_version?: string | null;
  }): ScoreInputRow {
    const { id, brand_mentioned = false, mentioned_competitors_count = 0, brand, competitors, extraction_version } = overrides;
    return row({
      id,
      brand_mentioned,
      mentioned_competitors_count,
      brand_snapshot: "MiMarca",
      extraction_version,
      extracted_json: {
        brand: brand ?? { mentioned: brand_mentioned, position: brand_mentioned ? 1 : null },
        competitors: (competitors ?? []).map((c) => ({ name: c.name, mentioned: c.mentioned, position: c.position }))
      }
    });
  }

  it("drops standing to null (not a fabricated 100) when the project tracks zero competitors, even though the brand is mentioned every prompt", () => {
    // Real production bug this guards against: brandMentionedCount /
    // (brandMentionedCount + 0) = 100% "share of voice" against nobody.
    const results = [
      trackedRow({ id: "1", brand_mentioned: true, brand: { mentioned: true, position: 1 }, competitors: [] }),
      trackedRow({ id: "2", brand_mentioned: true, brand: { mentioned: true, position: 1 }, competitors: [] })
    ];

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);
    const brandPosition = result.details_json.brand_position as { total_entities: number };
    const geoScore = result.details_json.geo_score as {
      inputs_used: string[];
      components: Record<string, { value: number | null; reason?: string }>;
    };

    expect(brandPosition.total_entities).toBe(1);
    expect(geoScore.components.standing.value).toBeNull();
    expect(geoScore.components.standing.reason).toContain("no competitors tracked");
    expect(geoScore.inputs_used).not.toContain("standing");
  });

  it("still awards a real 100 standing when competitors ARE tracked but never mentioned (not the zero-tracked case)", () => {
    const results = [
      trackedRow({
        id: "1",
        brand_mentioned: true,
        brand: { mentioned: true, position: 1 },
        competitors: [{ name: "Competitor", mentioned: false, position: null }]
      })
    ];

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);
    const geoScore = result.details_json.geo_score as { components: Record<string, { value: number | null }> };

    expect(geoScore.components.standing.value).toBe(100);
  });

  it("drops prominence and standing to null for a run containing a pre-tracked-set-v1 row, instead of computing over a possibly-contaminated competitor set", () => {
    const results = [
      trackedRow({
        id: "1",
        brand_mentioned: true,
        mentioned_competitors_count: 3,
        brand: { mentioned: true, position: 2 },
        competitors: [{ name: "Competitor", mentioned: true, position: 1 }],
        extraction_version: "negative-drivers-v1" // pre-fix
      })
    ];

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);

    expect(result.details_json.brand_position).toBeUndefined();
    const geoScore = result.details_json.geo_score as {
      inputs_used: string[];
      components: Record<string, { value: number | null; reason?: string }>;
    };
    expect(geoScore.components.prominence).toMatchObject({ value: null });
    expect(geoScore.components.prominence.reason).toContain("docs/adr/0018");
    expect(geoScore.components.standing).toMatchObject({ value: null });
    expect(geoScore.components.standing.reason).toContain("docs/adr/0018");
    expect(geoScore.inputs_used).not.toContain("prominence");
    expect(geoScore.inputs_used).not.toContain("standing");
  });

  it("still computes prominence/standing from the well-extracted rows when one row's extraction simply never completed (extraction_version stuck at the DB default 'v1', extracted_json null) — a single transient extraction failure must not blank out an otherwise-good run", () => {
    // MIN_RESPONSES_FOR_BAND well-extracted rows so prominence clears its own
    // sample gate (geo-score-v3) and this test keeps measuring what it is
    // about: the extraction_version guard, not the mention count.
    const results = [
      ...Array.from({ length: MIN_RESPONSES_FOR_BAND }, (_, i) =>
        trackedRow({
          id: `ok-${i}`,
          brand_mentioned: true,
          mentioned_competitors_count: 1,
          brand: { mentioned: true, position: 1 },
          competitors: [{ name: "Competitor", mentioned: true, position: 2 }],
          extraction_version: EXTRACTION_VERSION
        })
      ),
      // Simulates lib/scan/extraction.ts's failure path: extraction_version
      // stays at the schema default ('v1', migration 0001) because the
      // success branch that advances it to EXTRACTION_VERSION never ran.
      row({
        id: "2",
        brand_mentioned: false,
        extraction_version: "v1",
        extracted_json: null,
        extraction_error: "llm_call_failed"
      })
    ];

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);

    expect(result.details_json.brand_position).toBeDefined();
    const geoScore = result.details_json.geo_score as {
      inputs_used: string[];
      components: Record<string, { value: number | null }>;
    };
    expect(geoScore.components.prominence.value).not.toBeNull();
    expect(geoScore.inputs_used).toContain("prominence");
  });

  it("computes normally when every row's extraction_version matches the current EXTRACTION_VERSION", () => {
    const results = Array.from({ length: MIN_RESPONSES_FOR_BAND }, (_, i) =>
      trackedRow({
        id: `r-${i}`,
        brand_mentioned: true,
        mentioned_competitors_count: 0,
        brand: { mentioned: true, position: 1 },
        competitors: [{ name: "Competitor", mentioned: false, position: null }],
        extraction_version: EXTRACTION_VERSION
      })
    );

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);
    const geoScore = result.details_json.geo_score as { components: Record<string, { value: number | null }> };

    expect(geoScore.components.prominence.value).not.toBeNull();
    expect(geoScore.components.standing.value).toBe(100);
  });

  it("leaves pre-existing (extraction_version-less) call sites unaffected — no gate applied when the field is absent", () => {
    // Backward compatibility: callers that don't pass extraction_version
    // (e.g. not-yet-updated tests or call sites) get the pre-SCAN-TRACKED-SET-1
    // behavior, not a spurious drop.
    const results = Array.from({ length: MIN_RESPONSES_FOR_BAND }, (_, i) =>
      trackedRow({
        id: `r-${i}`,
        brand_mentioned: true,
        brand: { mentioned: true, position: 1 },
        competitors: [{ name: "Competitor", mentioned: false, position: null }]
        // extraction_version omitted entirely
      })
    );

    const result = computeRunScoresFromResults(results, PROJECT_DOMAIN);
    const geoScore = result.details_json.geo_score as { components: Record<string, { value: number | null }> };

    expect(geoScore.components.prominence.value).not.toBeNull();
    expect(geoScore.components.standing.value).toBe(100);
  });
});

describe("getEffectiveGeoScore", () => {
  it("prefers the composite geo_score.score when present", () => {
    const score = getEffectiveGeoScore({
      visibility_score: 90,
      details_json: { geo_score: { score: 55.5 } }
    });

    expect(score).toBe(55.5);
  });

  it("falls back to visibility_score for runs scored before geo-score-v1 existed", () => {
    const score = getEffectiveGeoScore({ visibility_score: 42, details_json: null });

    expect(score).toBe(42);
  });

  it("falls back to visibility_score when details_json has no geo_score", () => {
    const score = getEffectiveGeoScore({ visibility_score: 42, details_json: { total_results: 10 } });

    expect(score).toBe(42);
  });

  it("defaults to 0 when both geo_score and visibility_score are absent", () => {
    const score = getEffectiveGeoScore({ visibility_score: null, details_json: null });

    expect(score).toBe(0);
  });
});

/**
 * RECS-POTENTIAL-1 — real "potential score points" (docs/adr/0016).
 * `row()`/`ownDomainCitation()`/`thirdPartyCitation()` from the top of this
 * file are reused so the counterfactual is exercised against the exact same
 * row shape and helpers as the rest of the scoring engine's tests.
 */
describe("isQuantifiableRecommendationType", () => {
  it("is true for the 5 types with a real 1:1 score-component mapping", () => {
    expect(isQuantifiableRecommendationType("increase_brand_visibility")).toBe(true);
    expect(isQuantifiableRecommendationType("close_competitor_gap")).toBe(true);
    expect(isQuantifiableRecommendationType("increase_brand_prominence")).toBe(true);
    expect(isQuantifiableRecommendationType("add_citation_block")).toBe(true);
    expect(isQuantifiableRecommendationType("pursue_citation_sources")).toBe(true);
  });

  it("is false for types with no defensible 1:1 component mapping", () => {
    expect(isQuantifiableRecommendationType("create_faq_section")).toBe(false);
    expect(isQuantifiableRecommendationType("strengthen_brand_entity_clarity")).toBe(false);
    expect(isQuantifiableRecommendationType("track_emerging_competitor")).toBe(false);
    expect(isQuantifiableRecommendationType("address_negative_narrative")).toBe(false);
    expect(isQuantifiableRecommendationType("unknown_future_type")).toBe(false);
  });
});

describe("computeRecommendationPotentialPoints", () => {
  // Fully-extracted, error-free rows -> confidence "medium"
  // (MIN_RESPONSES_FOR_BAND..19 clean results), so every scenario below
  // clears the confidence gate on its own merits and isolates the
  // counterfactual math being tested.
  //
  // MIN_RESPONSES_FOR_BAND of them mention the brand, which is also what
  // prominence needs before it is scored at all (geo-score-v3) — otherwise
  // an increase_brand_prominence counterfactual moves a component that isn't
  // in the composite and correctly yields zero points.
  function baseline(): ReturnType<typeof row>[] {
    const mentioned = Array.from({ length: MIN_RESPONSES_FOR_BAND }, (_, i) =>
      row({
        brand_snapshot: "MiMarca",
        id: `mentioned-${i}`,
        brand_mentioned: true,
        citation_found: true,
        extracted_json: { brand: { mentioned: true, position: 1 }, competitors: [], citations: [ownDomainCitation()] }
      })
    );
    const absentNoCompetitor = Array.from({ length: 3 }, (_, i) =>
      row({
        brand_snapshot: "MiMarca",
        id: `absent-${i}`,
        brand_mentioned: false,
        extracted_json: { brand: { mentioned: false, position: null }, competitors: [], citations: [] }
      })
    );
    const absentWithCompetitor = Array.from({ length: 2 }, (_, i) =>
      row({
        brand_snapshot: "MiMarca",
        id: `displaced-${i}`,
        brand_mentioned: false,
        mentioned_competitors_count: 1,
        extracted_json: {
          brand: { mentioned: false, position: null },
          competitors: [{ name: "Rival", mentioned: true, position: 1 }],
          citations: []
        }
      })
    );
    return [...mentioned, ...absentNoCompetitor, ...absentWithCompetitor];
  }

  it("returns null for a non-quantifiable recommendation type", () => {
    const result = computeRecommendationPotentialPoints(baseline(), PROJECT_DOMAIN, "create_faq_section", ["absent-0"]);
    expect(result).toBeNull();
  });

  it("returns null when there are no affected prompts", () => {
    const result = computeRecommendationPotentialPoints(baseline(), PROJECT_DOMAIN, "increase_brand_visibility", []);
    expect(result).toBeNull();
  });

  it("returns null when confidence is low (extraction errors present)", () => {
    const rows = baseline();
    rows[0] = { ...rows[0], extraction_error: "timeout" };
    const result = computeRecommendationPotentialPoints(rows, PROJECT_DOMAIN, "increase_brand_visibility", ["absent-0"]);
    expect(result).toBeNull();
  });

  it("increase_brand_visibility: resolving an absent-brand prompt yields a positive delta", () => {
    const result = computeRecommendationPotentialPoints(baseline(), PROJECT_DOMAIN, "increase_brand_visibility", ["absent-0"]);
    expect(result).not.toBeNull();
    expect(result!.deltaPoints).toBeGreaterThan(0);
  });

  it("close_competitor_gap: resolving a displaced prompt yields a positive delta", () => {
    const result = computeRecommendationPotentialPoints(baseline(), PROJECT_DOMAIN, "close_competitor_gap", ["displaced-0"]);
    expect(result).not.toBeNull();
    expect(result!.deltaPoints).toBeGreaterThan(0);
  });

  it("increase_brand_visibility and close_competitor_gap use the identical presence+standing mutation, so an equivalent single prompt yields the same delta", () => {
    // Both types are classified as "presence" kind (RECOMMENDATION_POTENTIAL_KIND):
    // brand_mentioned -> true. standing = brandMentionedCount / (brandMentionedCount
    // + totalCompetitorMentions) depends only on the totals, not on whether the
    // resolved prompt itself carried a competitor mention, so resolving one
    // "displaced" prompt or one "absent, no competitor" prompt moves both
    // presence and standing by the same amount.
    const visibilityDelta = computeRecommendationPotentialPoints(baseline(), PROJECT_DOMAIN, "increase_brand_visibility", ["absent-0"])!.deltaPoints;
    const competitorGapDelta = computeRecommendationPotentialPoints(baseline(), PROJECT_DOMAIN, "close_competitor_gap", ["displaced-0"])!.deltaPoints;
    expect(competitorGapDelta).toBe(visibilityDelta);
  });

  it("increase_brand_prominence: promoting a mentioned-but-poorly-ranked prompt to position 1 yields a positive delta", () => {
    const rows = baseline();
    rows.push(
      row({
        brand_snapshot: "MiMarca",
        id: "poorly-ranked",
        brand_mentioned: true,
        extracted_json: {
          brand: { mentioned: true, position: 4 },
          competitors: [{ name: "Rival", mentioned: true, position: 1 }],
          citations: []
        }
      })
    );
    const result = computeRecommendationPotentialPoints(rows, PROJECT_DOMAIN, "increase_brand_prominence", ["poorly-ranked"]);
    expect(result).not.toBeNull();
    expect(result!.deltaPoints).toBeGreaterThan(0);
  });

  it("add_citation_block: injecting an own-domain citation on a grounded row yields a positive delta", () => {
    const rows = baseline();
    rows.push(
      row({
        brand_snapshot: "MiMarca",
        id: "uncited",
        brand_mentioned: true,
        citation_found: false,
        provider: "gemini",
        extracted_json: { brand: { mentioned: true, position: 2 }, competitors: [], citations: [] }
      })
    );
    const result = computeRecommendationPotentialPoints(rows, PROJECT_DOMAIN, "add_citation_block", ["uncited"]);
    expect(result).not.toBeNull();
    expect(result!.deltaPoints).toBeGreaterThan(0);
  });

  it("add_citation_block: an ungrounded row (no real grounding possible) yields no delta", () => {
    const rows = baseline();
    rows.push(
      row({
        brand_snapshot: "MiMarca",
        id: "uncited-ungrounded",
        brand_mentioned: true,
        citation_found: false,
        provider: "claude",
        extracted_json: { brand: { mentioned: true, position: 2 }, competitors: [], citations: [] }
      })
    );
    const result = computeRecommendationPotentialPoints(rows, PROJECT_DOMAIN, "add_citation_block", ["uncited-ungrounded"]);
    // Still non-null (the type is quantifiable and the run has a composite),
    // but the mutation is a structural no-op on an ungrounded row, so the
    // counterfactual score equals the real score.
    expect(result).not.toBeNull();
    expect(result!.deltaPoints).toBe(0);
  });

  it("pursue_citation_sources: same mechanism as add_citation_block (own-domain citation on a grounded row)", () => {
    const rows = baseline();
    rows.push(
      row({
        brand_snapshot: "MiMarca",
        id: "third-party-only",
        brand_mentioned: false,
        citation_found: true,
        provider: "gemini",
        extracted_json: {
          brand: { mentioned: false, position: null },
          competitors: [],
          citations: [thirdPartyCitation()]
        }
      })
    );
    const result = computeRecommendationPotentialPoints(rows, PROJECT_DOMAIN, "pursue_citation_sources", ["third-party-only"]);
    expect(result).not.toBeNull();
    expect(result!.deltaPoints).toBeGreaterThan(0);
  });

  it("never returns a negative delta even for an already-resolved prompt", () => {
    const result = computeRecommendationPotentialPoints(baseline(), PROJECT_DOMAIN, "increase_brand_visibility", ["mentioned-0"]);
    expect(result).not.toBeNull();
    expect(result!.deltaPoints).toBeGreaterThanOrEqual(0);
  });
});

describe("computeJointPotentialPoints", () => {
  // 8 mentioned + the two gap rows below = MIN_RESPONSES_FOR_BAND rows, so
  // the run clears the confidence gate and these tests exercise the union/
  // overlap math rather than the gate (which has its own tests above).
  function baseline(): ReturnType<typeof row>[] {
    return [
      ...Array.from({ length: MIN_RESPONSES_FOR_BAND - 2 }, (_, i) =>
        row({
        brand_snapshot: "MiMarca",
          id: `mentioned-${i}`,
          brand_mentioned: true,
          citation_found: true,
          extracted_json: { brand: { mentioned: true, position: 1 }, competitors: [], citations: [ownDomainCitation()] }
        })
      ),
      row({
        brand_snapshot: "MiMarca",
        id: "gap-a",
        brand_mentioned: false,
        mentioned_competitors_count: 1,
        extracted_json: {
          brand: { mentioned: false, position: null },
          competitors: [{ name: "Rival A", mentioned: true, position: 1 }],
          citations: []
        }
      }),
      row({
        brand_snapshot: "MiMarca",
        id: "gap-b",
        brand_mentioned: false,
        mentioned_competitors_count: 1,
        extracted_json: {
          brand: { mentioned: false, position: null },
          competitors: [{ name: "Rival B", mentioned: true, position: 1 }],
          citations: []
        }
      })
    ];
  }

  it("returns null when no recommendation in the list is quantifiable", () => {
    const result = computeJointPotentialPoints(baseline(), PROJECT_DOMAIN, [
      { recommendationType: "create_faq_section", affectedPromptIds: ["gap-a"] }
    ]);
    expect(result).toBeNull();
  });

  it("the joint delta of two DISJOINT recommendations is the resolution of both prompts together", () => {
    const rows = baseline();
    const joint = computeJointPotentialPoints(rows, PROJECT_DOMAIN, [
      { recommendationType: "close_competitor_gap", affectedPromptIds: ["gap-a"] },
      { recommendationType: "close_competitor_gap", affectedPromptIds: ["gap-b"] }
    ]);
    const onlyA = computeRecommendationPotentialPoints(rows, PROJECT_DOMAIN, "close_competitor_gap", ["gap-a"]);
    const onlyB = computeRecommendationPotentialPoints(rows, PROJECT_DOMAIN, "close_competitor_gap", ["gap-b"]);

    expect(joint).not.toBeNull();
    // Disjoint prompts: resolving both together is at least as good as
    // either alone (monotonic), and should land close to (not necessarily
    // exactly, since geo_score is non-linear) the sum of the two standalone
    // deltas — the key invariant is it doesn't UNDER-count real, non-
    // overlapping gains.
    expect(joint!.deltaPoints).toBeGreaterThanOrEqual(Math.max(onlyA!.deltaPoints, onlyB!.deltaPoints));
  });

  it("the joint delta of two OVERLAPPING recommendations does not double-count the shared prompt", () => {
    const rows = baseline();
    const joint = computeJointPotentialPoints(rows, PROJECT_DOMAIN, [
      { recommendationType: "close_competitor_gap", affectedPromptIds: ["gap-a"] },
      // A second "recommendation" that claims the SAME prompt as the first
      // — this is the double-counting scenario the aggregate must collapse
      // (e.g. two dominant-competitor cards both citing the same prompt).
      { recommendationType: "close_competitor_gap", affectedPromptIds: ["gap-a"] }
    ]);
    const onlyA = computeRecommendationPotentialPoints(rows, PROJECT_DOMAIN, "close_competitor_gap", ["gap-a"]);

    expect(joint).not.toBeNull();
    // The union of {gap-a} and {gap-a} is just {gap-a}, so the joint delta
    // must equal the single standalone delta, NOT double it.
    expect(joint!.deltaPoints).toBe(onlyA!.deltaPoints);
  });

  it("joint delta never exceeds the sum of the standalone deltas (the overlap ceiling)", () => {
    const rows = baseline();
    const joint = computeJointPotentialPoints(rows, PROJECT_DOMAIN, [
      { recommendationType: "close_competitor_gap", affectedPromptIds: ["gap-a"] },
      { recommendationType: "close_competitor_gap", affectedPromptIds: ["gap-a", "gap-b"] }
    ]);
    const onlyA = computeRecommendationPotentialPoints(rows, PROJECT_DOMAIN, "close_competitor_gap", ["gap-a"]);
    const aAndB = computeRecommendationPotentialPoints(rows, PROJECT_DOMAIN, "close_competitor_gap", ["gap-a", "gap-b"]);

    expect(joint).not.toBeNull();
    expect(joint!.deltaPoints).toBeLessThanOrEqual(onlyA!.deltaPoints + aAndB!.deltaPoints);
  });

  it("returns null when confidence is low", () => {
    const rows = baseline();
    rows[0] = { ...rows[0], extraction_error: "timeout" };
    const result = computeJointPotentialPoints(rows, PROJECT_DOMAIN, [
      { recommendationType: "close_competitor_gap", affectedPromptIds: ["gap-a"] }
    ]);
    expect(result).toBeNull();
  });
});
