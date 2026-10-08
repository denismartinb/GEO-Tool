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

  it("a cause the answer itself shows (named competitor ahead, with a quote) follows the run", () => {
    expect(
      deriveRecommendationConfidence({
        diagnosisCertainty: "high",
        type: "close_competitor_gap",
        evidence: { ...quote, mentioned_competitors: ["Profound"] }
      }).confidence
    ).toBe("high");
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

  it("leaves a row the new engine wrote untouched", () => {
    const fresh = { ...legacy, confidence: "medium", evidence_json: { ...legacy.evidence_json, confidence_reason: "x" } };
    expect(calibrateStoredRecommendation(fresh)).toBe(fresh);
  });

  it("is idempotent", () => {
    const once = calibrateStoredRecommendation(legacy);
    expect(calibrateStoredRecommendation(once)).toBe(once);
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
