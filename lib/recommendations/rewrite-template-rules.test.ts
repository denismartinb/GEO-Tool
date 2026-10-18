import { describe, expect, it } from "vitest";
import { buildRecommendationRewritePrompt } from "./recommendation-rewrite-llm";
import { domainsShownInPrompt } from "./anchored-domains";
import { classifySolutionReadiness, readinessLabel } from "./deliverable";

// RECS-TEMPLATES-1 (log §331): the founder's real test on genscore.es
// (P2, P9, P14, P18, P27, P31, P35 in prueba-recomendaciones/aprendizajes.md).

const base = {
  brand: "GenScore",
  domain: "genscore.es",
  language: "es",
  recommendationType: "close_competitor_gap",
  ruleTitle: "Disputa a Peec AI 3 preguntas donde no apareces",
  ruleDescription: "Peec AI sale en respuestas y tú no.",
  whyThisMatters: "",
  affectedPrompts: ["mejor herramienta para medir mi marca en chatgpt"],
  mentionedCompetitors: ["Peec AI"],
  citationDomains: [],
  evidenceSnippets: [],
  dominantCompetitor: "Peec AI"
};

describe("rewrite prompt: template rules", () => {
  const text = buildRecommendationRewritePrompt(base);

  it("keeps placeholders for the brand's own facts and gives editorial values itself (P18)", () => {
    expect(text).toMatch(/Editorial guidance is NEVER a placeholder/);
    expect(text).toMatch(/40 a 60 palabras/);
  });

  it("does not ask for prices in an answer that is not about prices (P9)", () => {
    expect(text).toMatch(/Do not ask for prices/);
  });

  it("never lets the plan state a competitor's data, and asks to source and date it (P27, P35)", () => {
    expect(text).toMatch(/NEVER state any fact about a competitor/);
    expect(text).toContain("[dato de su web, con enlace y fecha]");
    expect(text).toMatch(/at most 4 criteria rows/);
    expect(buildRecommendationRewritePrompt({ ...base, recommendationType: "add_comparison_content" })).toMatch(
      /every competitor cell following the competitor-fact rule/
    );
  });

  it("never lets an outreach template claim the sender read something (P31)", () => {
    expect(text).toMatch(/NEVER claim the sender read, used or liked something/);
    expect(text).toMatch(/Never name or list competitors in a message to a third party/);
  });

  it("forbids English words from the instructions in a Spanish plan (P2)", () => {
    expect(text).toMatch(/Never copy English words from these instructions \(such as 'facts'/);
  });

  it("adds no domain the guard would have to admit", () => {
    const generic = buildRecommendationRewritePrompt({ ...base, recommendationType: "increase_brand_visibility" });
    expect([...domainsShownInPrompt(generic)].sort()).toEqual([...domainsShownInPrompt(text)].sort());
  });
});

describe("readiness badge on a placeholder-heavy table (P14, P35)", () => {
  it("never says «Listo para copiar» while the table has blanks", () => {
    const row = "| [tu dato aquí] ".repeat(6) + "|";
    const table = ["| Criterio | GenScore | A | B | C | D | E |", row, row, row].join(" ");
    const readiness = classifySolutionReadiness({ steps: [], examples: [{ content: table }] });
    expect(readiness).toEqual({ kind: "needs_data", blanks: 18 });
    expect(readinessLabel(readiness)).toBe("18 huecos por rellenar");
  });

  it("counts the new competitor-cell placeholder too", () => {
    const readiness = classifySolutionReadiness({
      steps: ["Comprueba cada dato en su web"],
      examples: [{ content: "| Precio | [tu dato aquí] | [dato de su web, con enlace y fecha] |" }]
    });
    expect(readiness).toEqual({ kind: "needs_data", blanks: 2 });
  });
});
