import { describe, expect, it } from "vitest";
import { plainSnippet, shortDomainList } from "./plain-snippet";

// RECS-MINORS-1 (log §337): P5 and P6 in prueba-recomendaciones/aprendizajes.md.

describe("plainSnippet", () => {
  it("drops Markdown marks and keeps the words", () => {
    expect(plainSnippet("Herramientas como **Peec AI** y *Otterly*")).toBe("Herramientas como Peec AI y Otterly");
    expect(plainSnippet("1. **Profound**: mide marcas")).toBe("1. Profound: mide marcas");
    expect(plainSnippet("- [GenScore](https://genscore.es) mide `GEO`")).toBe("GenScore mide GEO");
    expect(plainSnippet("## Las mejores\nopciones")).toBe("Las mejores opciones");
  });

  it("leaves snake_case and multiplication alone", () => {
    expect(plainSnippet("usa brand_mentioned en 2 * 3 casos")).toBe("usa brand_mentioned en 2 * 3 casos");
  });
});

describe("shortDomainList", () => {
  it("shows six and counts the rest", () => {
    const list = Array.from({ length: 9 }, (_, i) => `web${i}.es`);
    expect(shortDomainList(list)).toEqual({ shown: list.slice(0, 6), hidden: 3 });
    expect(shortDomainList(["a.es"])).toEqual({ shown: ["a.es"], hidden: 0 });
  });
});

describe("visibility card without rivals (P19)", async () => {
  const { generateRecommendationsForRun } = await import("./recommendation-engine");
  const row = (id: string) => ({
    id,
    prompt_text_snapshot: "mejor herramienta geo",
    brand_mentioned: false,
    citation_found: false,
    mentioned_competitors_count: 0,
    citations_count: 0,
    sentiment: "neutral" as const,
    extracted_json: { brand: { evidence: [], position: null }, competitors: [], citations: [], sentiment_drivers: [], other_brands_mentioned: [] }
  });
  const rec = generateRecommendationsForRun({
    project: { brand: "GenScore", domain: "genscore.es", country: "ES", language: "es" },
    competitors: [],
    runScore: { visibility_score: 30, citation_score: 30, competitor_gap_score: 0, confidence: "high", details_json: {} },
    promptResults: [row("p1")]
  }).find((r) => r.recommendation_type === "increase_brand_visibility");

  it("does not sell an empty answer as a sure opportunity", () => {
    expect(rec).toBeDefined();
    expect(rec!.description).toMatch(/Puede ser un hueco libre o una pregunta en la que la IA no recomienda marcas/);
    expect(String(rec!.evidence_json.why_this_matters)).toMatch(/no asegura que esta pregunta premie a una marca/);
    expect(`${rec!.description} ${rec!.evidence_json.why_this_matters}`).not.toMatch(/más fácil|más barato/);
  });
});
