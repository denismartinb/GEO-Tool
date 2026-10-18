import { describe, expect, it } from "vitest";
import { generateRecommendationsForRun } from "./recommendation-engine";
import { isDocumentationHost, isOutreachTarget } from "./outreach-targets";

// RECS-OUTREACH-TARGETS-1 (log §335): P29 in
// prueba-recomendaciones/aprendizajes.md (founder's real test on genscore.es).

describe("isOutreachTarget", () => {
  it("never counts documentation or a help center", () => {
    expect(isDocumentationHost("help.openai.com")).toBe(true);
    expect(isDocumentationHost("developers.google.com")).toBe(true);
    expect(isOutreachTarget("help.openai.com", [])).toBe(false);
    expect(isOutreachTarget("support.google.com", [])).toBe(false);
  });

  it("does not treat a bare domain or an unrelated subdomain as documentation", () => {
    expect(isDocumentationHost("docs.com")).toBe(false);
    expect(isDocumentationHost("blog.hubspot.es")).toBe(false);
    expect(isOutreachTarget("emprendedores.es", [])).toBe(true);
  });

  it("drops an unclassified site whose domain is a brand named in the answer", () => {
    expect(isOutreachTarget("llmpulse.ai", ["LLM Pulse"])).toBe(false);
    expect(isOutreachTarget("dageno.ai", ["Dageno"])).toBe(false);
    // Exact label only, never containment.
    expect(isOutreachTarget("llmpulseblog.com", ["LLM Pulse"])).toBe(true);
  });

  it("keeps a comparator even when the answer names it", () => {
    expect(isOutreachTarget("capterra.com", ["Capterra"])).toBe(true);
  });
});

describe("source gap counts only real targets (P29)", () => {
  const extracted = {
    brand: { evidence: [], position: null },
    competitors: [],
    citations: [
      { domain: "emprendedores.es", source: "grounding" },
      { domain: "llmpulse.ai", source: "grounding" },
      { domain: "help.openai.com", source: "grounding" },
      { domain: "developers.google.com", source: "grounding" }
    ],
    sentiment_drivers: [],
    other_brands_mentioned: ["LLM Pulse"]
  };
  const row = (id: string) => ({
    id,
    prompt_text_snapshot: `pregunta ${id}`,
    brand_mentioned: false,
    citation_found: true,
    mentioned_competitors_count: 0,
    citations_count: 4,
    sentiment: "neutral" as const,
    extracted_json: extracted
  });
  const recs = generateRecommendationsForRun({
    project: { brand: "GenScore", domain: "genscore.es", country: "ES", language: "es" },
    competitors: [],
    runScore: { visibility_score: 80, citation_score: 80, competitor_gap_score: 10, confidence: "high", details_json: {} },
    promptResults: [row("p1"), row("p2")]
  });
  const rec = recs.find((r) => r.recommendation_type === "pursue_citation_sources");

  it("names only the site worth contacting, and the title counts it alone", () => {
    expect(rec).toBeDefined();
    expect(rec!.evidence_json.source_domains).toEqual(["emprendedores.es"]);
    expect(rec!.title).toBe("Consigue que la web que cita la IA te mencione");
  });

  it("never tells the user to contact a help center", () => {
    expect(String(rec!.evidence_json.first_step)).not.toMatch(/openai|google/);
  });
});
