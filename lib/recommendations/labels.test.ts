import { describe, expect, it } from "vitest";
import { communityKind, generateRecommendationsForRun } from "./recommendation-engine";

// RECS-LABELS-1 (log §336): P3 and P37 in prueba-recomendaciones/aprendizajes.md.

const citing = (domain: string) => ({
  brand: { evidence: [], position: null },
  competitors: [],
  citations: [{ domain, source: "grounding" }],
  sentiment_drivers: [],
  other_brands_mentioned: []
});
const row = (id: string, extracted: unknown, brand_mentioned = false) => ({
  id,
  prompt_text_snapshot: `pregunta ${id}`,
  brand_mentioned,
  citation_found: true,
  mentioned_competitors_count: 0,
  citations_count: 1,
  sentiment: "neutral" as const,
  extracted_json: extracted
});
const run = (rows: ReturnType<typeof row>[], competitors: string[] = []) =>
  generateRecommendationsForRun({
    project: { brand: "GenScore", domain: "genscore.es", country: "ES", language: "es" },
    competitors,
    runScore: { visibility_score: 80, citation_score: 80, competitor_gap_score: 10, confidence: "high", details_json: {} },
    promptResults: rows
  });

describe("communityKind", () => {
  it("tells videos, posts and threads apart", () => {
    expect(communityKind("youtube.com")).toBe("video");
    expect(communityKind("m.youtube.com")).toBe("video");
    expect(communityKind("linkedin.com")).toBe("social");
    expect(communityKind("reddit.com")).toBe("forum");
  });
});

describe("community first step by platform (P37)", () => {
  it("never asks for a thread on YouTube", () => {
    const rec = run([row("p1", citing("youtube.com")), row("p2", citing("youtube.com"))]).find(
      (r) => r.recommendation_type === "pursue_community_sources"
    );
    const step = String(rec!.evidence_json.first_step);
    expect(step).not.toMatch(/hilo/);
    expect(step).toMatch(/vídeo/);
  });

  it("keeps the thread for a forum", () => {
    const rec = run([row("p1", citing("reddit.com")), row("p2", citing("reddit.com"))]).find(
      (r) => r.recommendation_type === "pursue_community_sources"
    );
    expect(String(rec!.evidence_json.first_step)).toMatch(/hilo/);
  });
});

describe("competitor gap first step matches its plan (P3)", () => {
  it("asks to publish the comparison, not to go and look", () => {
    const withRival = {
      brand: { evidence: [], position: null },
      competitors: [{ name: "Peec AI", mentioned: true, evidence: ["Peec AI mide marcas"] }],
      citations: [],
      sentiment_drivers: [],
      other_brands_mentioned: []
    };
    const rec = run([row("p1", withRival), row("p2", withRival), row("p3", withRival)], ["Peec AI"]).find(
      (r) => r.recommendation_type === "close_competitor_gap"
    );
    expect(rec).toBeDefined();
    expect(String(rec!.evidence_json.first_step)).toBe(
      "Publica una comparativa entre tu marca y Peec AI que responda a estas preguntas con tus datos."
    );
  });
});
