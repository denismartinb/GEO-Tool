import { describe, expect, it } from "vitest";
import { buildRecommendationRewritePrompt } from "./recommendation-rewrite-llm";
import { domainsShownInPrompt } from "./anchored-domains";

// RECS-JSONLD-LEVER-1 (log §334): P10, P32 and P36 in
// prueba-recomendaciones/aprendizajes.md (founder's real test on genscore.es).

const input = (recommendationType: string) => ({
  brand: "GenScore",
  domain: "genscore.es",
  language: "es",
  recommendationType,
  ruleTitle: "Añade un bloque de preguntas y respuestas",
  ruleDescription: "Tus consultas informativas rinden por debajo.",
  whyThisMatters: "",
  affectedPrompts: ["¿Qué herramientas hay en España para GEO?"],
  mentionedCompetitors: [],
  citationDomains: [],
  evidenceSnippets: []
});

const ON_SITE = ["create_faq_section", "add_citation_block", "add_comparison_content", "increase_brand_visibility"];

describe("rewrite prompt: structured data is never the lever (P10)", () => {
  it.each(ON_SITE)("%s calls JSON-LD optional and never the reason to be cited", (type) => {
    const text = buildRecommendationRewritePrompt(input(type));
    expect(text).toMatch(/Structured data .* is optional help that only describes text already visible/);
    expect(text).toMatch(/NEVER present it as the lever/);
    expect(text).toMatch(/Google states its AI features need no special markup/);
    expect(text).not.toMatch(/structured data \(JSON-LD schema such as FAQPage\/Article\/Organization\) where relevant/);
  });

  it.each(["create_faq_section", "add_citation_block", "add_comparison_content"])("%s asks for the JSON-LD example only as optional", (type) => {
    expect(buildRecommendationRewritePrompt(input(type))).toMatch(/optionally, (an Article or )?a?\s?FAQPage JSON-LD/);
  });

  it("an off-site plan still gets no JSON-LD at all", () => {
    const text = buildRecommendationRewritePrompt(input("pursue_community_sources"));
    expect(text).not.toMatch(/Structured data .* is optional help/);
    expect(text).toMatch(/do NOT provide a JSON-LD or HTML example/);
  });
});

describe("rewrite prompt: FAQ questions and product claims (P32, P36)", () => {
  const text = buildRecommendationRewritePrompt(input("create_faq_section"));

  it("takes every FAQ question from the real affected prompts", () => {
    expect(text).toMatch(/Every question in a FAQ \(and in a FAQPage\) is one of the real affected prompts/);
    expect(text).toContain('never add a "what is GenScore" question');
    expect(text).toMatch(/each question taken from the affected prompts/);
  });

  it("never states what the product or each plan includes beyond the facts", () => {
    expect(text).toMatch(/Never describe what the brand's product does, which plans include what/);
    expect(text).toMatch(/A feature that only some plans include is never written as if every customer had it/);
    expect(text).toContain("[qué incluye tu producto y en qué planes]");
  });

  it("adds no domain the guard would have to admit", () => {
    expect([...domainsShownInPrompt(text)].sort()).toEqual(["genscore.es", "schema.org"]);
  });
});
