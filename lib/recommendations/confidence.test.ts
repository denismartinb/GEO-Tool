import { describe, expect, it } from "vitest";
import {
  calibrateStoredRecommendation,
  deriveRecommendationConfidence,
  evidenceCeilingFor,
  evidenceKindForType,
  minConfidence
} from "./confidence";

const none = { evidence_snippets: [], mentioned_competitors: [], citation_domains: [], other_brands: [] };
const quote = { ...none, evidence_snippets: ["Profound lidera el seguimiento GEO"] };
const sources = { ...none, citation_domains: ["xataka.com"], other_brands: ["Ahrefs"] };

describe("deriveRecommendationConfidence", () => {
  it("a format hypothesis with no fragment is low, even on a high-confidence run", () => {
    const r = deriveRecommendationConfidence({ diagnosisCertainty: "high", type: "create_faq_section", evidence: none });
    expect(r.confidence).toBe("low");
    expect(r.reason).toMatch(/hipótesis de contenido/i);
  });

  it("brand absence with sources observed is capped at medium, never high", () => {
    const r = deriveRecommendationConfidence({ diagnosisCertainty: "high", type: "increase_brand_visibility", evidence: sources });
    expect(r.confidence).toBe("medium");
  });

  it("brand absence with nothing else observed is low", () => {
    expect(
      deriveRecommendationConfidence({ diagnosisCertainty: "high", type: "increase_brand_visibility", evidence: none }).confidence
    ).toBe("low");
  });

  it("a cause the answer itself shows is at most medium: an observed gap is not a measured result", () => {
    const r = deriveRecommendationConfidence({
      diagnosisCertainty: "high",
      type: "close_competitor_gap",
      evidence: { ...quote, mentioned_competitors: ["Profound"] }
    });
    expect(r.confidence).toBe("medium");
    expect(r.reason).toMatch(/no hay resultados medidos/i);
  });

  it("no type and no evidence can ever reach high on the action's confidence", () => {
    const rich = { ...quote, mentioned_competitors: ["X"], citation_domains: ["a.com"], other_brands: ["Y"] };
    for (const type of Object.keys({ close_competitor_gap: 1, increase_brand_prominence: 1, add_comparison_content: 1, address_negative_narrative: 1, update_stale_content: 1, track_emerging_competitor: 1, pursue_media_sources: 1, add_citation_block: 1, amplify_positive_pattern: 1, increase_brand_visibility: 1, create_faq_section: 1, strengthen_brand_entity_clarity: 1, some_future_rule: 1 })) {
      expect(deriveRecommendationConfidence({ diagnosisCertainty: "high", type, evidence: rich }).confidence, type).not.toBe("high");
    }
  });

  it("never exceeds the diagnosis certainty: a small sample caps even a direct cause", () => {
    const r = deriveRecommendationConfidence({
      diagnosisCertainty: "low",
      type: "close_competitor_gap",
      evidence: { ...quote, mentioned_competitors: ["Profound"] }
    });
    expect(r.confidence).toBe("low");
    expect(r.reason).toMatch(/muestra/i);
  });

  it("a direct type with nothing to show degrades instead of staying high", () => {
    expect(evidenceCeilingFor("close_competitor_gap", none)).toBe("none");
    expect(evidenceCeilingFor("close_competitor_gap", sources)).toBe("contextual");
  });

  it("an unclassified type is not given a direct ceiling", () => {
    expect(evidenceCeilingFor("some_future_rule", quote)).toBe("contextual");
    expect(evidenceCeilingFor("some_future_rule", none)).toBe("none");
  });
});

describe("evidenceKindForType", () => {
  it("separates content hypotheses from observations", () => {
    expect(evidenceKindForType("create_faq_section")).toBe("content_hypothesis");
    expect(evidenceKindForType("increase_brand_visibility")).toBe("content_hypothesis");
    expect(evidenceKindForType("close_competitor_gap")).toBe("observation");
  });
});

describe("calibrateStoredRecommendation — rows written before this derivation", () => {
  const legacy = {
    confidence: "high",
    recommendation_type: "create_faq_section",
    evidence_json: { ...none, run_confidence: "high" }
  };

  it("re-derives the old inherited 'high' from the stored evidence", () => {
    const out = calibrateStoredRecommendation(legacy);
    const ev = out.evidence_json as Record<string, unknown>;
    expect(out.confidence).toBe("low");
    expect(ev.run_confidence).toBe("high");
    expect(ev.evidence_kind).toBe("content_hypothesis");
  });

  it("a row written by 419ad9a (already has confidence_reason) that kept 'high' is recalibrated on read", () => {
    const stored = {
      confidence: "high",
      recommendation_type: "close_competitor_gap",
      evidence_json: {
        ...quote,
        mentioned_competitors: ["Profound"],
        run_confidence: "high",
        evidence_kind: "observation",
        confidence_reason: "La propia respuesta muestra la causa."
      }
    };
    const out = calibrateStoredRecommendation(stored);
    expect(out.confidence).toBe("medium");
    expect((out.evidence_json as Record<string, unknown>).confidence_reason).toMatch(/no hay resultados medidos/i);
    // the input object (the stored history) is not mutated
    expect(stored.confidence).toBe("high");
    expect(stored.evidence_json.confidence_reason).toBe("La propia respuesta muestra la causa.");
  });

  it("a stored 'high' on a hypothesis row with confidence_reason also drops to low", () => {
    const out = calibrateStoredRecommendation({
      confidence: "high",
      recommendation_type: "create_faq_section",
      evidence_json: { ...none, run_confidence: "high", confidence_reason: "x", evidence_kind: "content_hypothesis" }
    });
    expect(out.confidence).toBe("low");
  });

  it("no stored row, of any generation, can come back as 'high'", () => {
    for (const confidence of ["low", "medium", "high"]) {
      for (const withReason of [false, true]) {
        const out = calibrateStoredRecommendation({
          confidence,
          recommendation_type: "close_competitor_gap",
          evidence_json: { ...quote, mentioned_competitors: ["X"], run_confidence: "high", ...(withReason ? { confidence_reason: "x" } : {}) }
        });
        expect(out.confidence, `${confidence}/${withReason}`).not.toBe("high");
      }
    }
  });

  it("is idempotent", () => {
    const once = calibrateStoredRecommendation(legacy);
    expect(calibrateStoredRecommendation(once)).toEqual(once);
  });

  it("falls back to the stored confidence as the diagnosis when run_confidence is missing", () => {
    const out = calibrateStoredRecommendation({ confidence: "medium", recommendation_type: "close_competitor_gap", evidence_json: { ...quote, mentioned_competitors: ["X"] } });
    expect(out.confidence).toBe("medium");
  });

  it("handles a null evidence_json without throwing", () => {
    const out = calibrateStoredRecommendation({ confidence: "high", recommendation_type: "increase_brand_visibility", evidence_json: null });
    expect(out.confidence).toBe("low");
  });
});

describe("minConfidence", () => {
  it("picks the lower", () => {
    expect(minConfidence("high", "low")).toBe("low");
    expect(minConfidence("medium", "high")).toBe("medium");
  });
});
