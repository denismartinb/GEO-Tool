import { describe, expect, it } from "vitest";
import {
  HEADLINE_MAX,
  headlinePath,
  isRetiredRecommendationType,
  recommendationHeadline,
  RETIRED_RECOMMENDATION_TYPES
} from "./headline";
import { KNOWN_RECOMMENDATION_TYPES } from "./recommendation-engine";

const LONG_PROMPT = "¿Cuánto cuesta un plan de telefonía móvil con datos ilimitados y llamadas a fijos?";

function rec(recommendation_type: string, evidence_json: Record<string, unknown> = {}, title = "Título guardado") {
  return { recommendation_type, title, evidence_json };
}

// Words that describe an outcome the customer cannot control (founder, 2026-10-28).
const OUTCOME_WORDS = /\b(aparece|consigue|adelanta|sal antes|lleva|disputa|recorta|repite)\b/i;

describe("recommendationHeadline", () => {
  it("never embeds the question in the headline: it goes to the context line", () => {
    const h = recommendationHeadline(rec("add_citation_block", { affected_prompts: [LONG_PROMPT] }, `Consigue que te citen en "${LONG_PROMPT}"`));
    expect(h.title).toBe("Añade un dato con fecha y fuente a tu página");
    expect(h.title).not.toContain("¿");
    expect(h.context).toBe(LONG_PROMPT);
  });

  it("names the own page when coverage confirmed it and it fits", () => {
    const h = recommendationHeadline(rec("add_citation_block", { affected_prompts: [LONG_PROMPT] }), {
      state: "confirmed_surfacing_gap",
      pageUrl: "https://example.com/tarifas"
    });
    expect(h.title).toBe("Añade un dato con fuente a /tarifas");
  });

  it("falls back to the generic form when the page path is too long", () => {
    const h = recommendationHeadline(rec("add_citation_block"), {
      state: "confirmed_surfacing_gap",
      pageUrl: "https://example.com/blog/cuanto-cuesta-una-tarifa-movil-con-datos-ilimitados"
    });
    expect(h.title).toBe("Añade un dato con fecha y fuente a tu página");
  });

  it("asks to publish a page when coverage found none", () => {
    expect(recommendationHeadline(rec("add_citation_block"), { state: "possible_content_gap", pageUrl: null }).title).toBe(
      "Publica una página con un dato que citar"
    );
    expect(recommendationHeadline(rec("increase_brand_visibility"), { state: "possible_content_gap", pageUrl: null }).title).toBe(
      "Publica una página que responda esta pregunta"
    );
  });

  it("turns a competitor gap into the comparison to publish, reading old titles too", () => {
    const fromEvidence = recommendationHeadline(rec("close_competitor_gap", { dominant_competitor: "Cuentix", affected_prompts: ["a", "b", "c"] }));
    expect(fromEvidence).toEqual({ title: "Publica tu comparativa con Cuentix", context: "Cuentix sale en 3 preguntas y tú no" });
    const fromTitle = recommendationHeadline(rec("close_competitor_gap", {}, "Disputa a Kontaro 2 consultas donde no apareces"));
    expect(fromTitle.title).toBe("Publica tu comparativa con Kontaro");
  });

  it("names whom to write to for third-party sources", () => {
    const h = recommendationHeadline(rec("pursue_comparator_sources", { source_domains: ["guiapymes.es", "softwarepyme.net"] }));
    expect(h).toEqual({ title: "Escribe a guiapymes.es para que te incluya", context: "También: softwarepyme.net" });
    expect(recommendationHeadline(rec("pursue_community_sources", { source_domains: ["youtube.com"] })).title).toBe(
      "Comenta en el vídeo de youtube.com"
    );
    expect(recommendationHeadline(rec("pursue_community_sources", { source_domains: ["foroautonomos.es"] })).title).toBe(
      "Responde en el hilo de foroautonomos.es"
    );
  });

  it("keeps every registered type within two phone lines and phrased as a task", () => {
    const evidence = {
      affected_prompts: [LONG_PROMPT],
      dominant_competitor: "Una Marca Con Un Nombre Larguísimo De Verdad",
      emerging_competitor: "Otra Marca Con Un Nombre Larguísimo De Verdad",
      source_domains: ["un-dominio-con-un-nombre-muy-largo-de-verdad.com"],
      sentiment_drivers: ["permanencia", "atención al cliente"]
    };
    const coverages = [
      null,
      { state: "confirmed_surfacing_gap", pageUrl: "https://example.com/una-ruta-bastante-larga" },
      { state: "confirmed_surfacing_gap", pageUrl: "https://example.com/" },
      { state: "possible_content_gap", pageUrl: null }
    ];
    for (const type of KNOWN_RECOMMENDATION_TYPES) {
      if (isRetiredRecommendationType(type)) continue;
      for (const coverage of coverages) {
        const h = recommendationHeadline(rec(type, evidence, `Aparece en "${LONG_PROMPT}"`), coverage);
        expect(h.title.length, `${type}: ${h.title}`).toBeLessThanOrEqual(HEADLINE_MAX);
        expect(h.title, type).not.toMatch(OUTCOME_WORDS);
        expect(h.title, type).not.toContain("«¿");
      }
    }
  });

  it("retires the two types that had no deliverable", () => {
    expect([...RETIRED_RECOMMENDATION_TYPES].sort()).toEqual(["amplify_positive_pattern", "increase_brand_prominence"]);
    expect(isRetiredRecommendationType("create_faq_section")).toBe(false);
  });
});

describe("headlinePath", () => {
  it("names the root as the home and drops long paths", () => {
    expect(headlinePath("https://example.com/")).toBe("tu portada");
    expect(headlinePath("https://example.com/precios/")).toBe("/precios");
    expect(headlinePath("https://example.com/una/ruta/demasiado/larga/para-titular")).toBeNull();
    expect(headlinePath(null)).toBeNull();
  });
});
