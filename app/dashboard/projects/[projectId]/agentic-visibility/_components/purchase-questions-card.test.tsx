import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildPurchaseQuestions, type PurchaseAnswer } from "@/lib/agentic-audit/purchase-questions";
import { PurchaseQuestionsCard } from "./purchase-questions-card";

/**
 * AGENTIC-COMMERCE-1 Fase 2d (log §330): render tests of «Preguntas de compra».
 * They pin content (figures only above the floor, the rule sentence, the
 * engine that does not search), never classes or looks.
 */

const DOMAIN = "monteratrail.es";
const QUESTIONS = [
  "¿Dónde comprar zapatillas de trail baratas?",
  "Mejores zapatillas de trail para ultras por menos de 150 €",
  "¿Qué zapatillas de trail me compro para empezar?"
];

function answers(questions: string[]): PurchaseAnswer[] {
  return questions.flatMap((text, i) =>
    ["openai", "gemini", "claude", "perplexity"].map((provider) => ({
      promptId: `q${i}`,
      promptText: text,
      topic: null,
      provider,
      rawText: provider === "openai" ? "Mira en Amazon." : "",
      brandMentioned: provider === "gemini",
      citations: provider === "gemini" ? [{ domain: DOMAIN, source: "grounding" as const }] : []
    }))
  );
}

function render(questions: string[]) {
  const report = buildPurchaseQuestions(answers(questions), { domain: DOMAIN, totalQuestions: 17 });
  return renderToStaticMarkup(<PurchaseQuestionsCard projectId="p1" report={report} />);
}

describe("PurchaseQuestionsCard", () => {
  it("shows the three figures, the engine that does not search and the rule", () => {
    const html = render(QUESTIONS);
    expect(html).toContain("3 de tus 17 preguntas");
    expect(html).toContain("Te nombran");
    expect(html).toContain("Mandan a un marketplace");
    expect(html).toContain("Sobre todo a Amazon");
    expect(html).toContain("No busca en la web");
    expect(html).toContain("no suman 100");
    expect(html).toContain("Cuenta como pregunta de compra");
  });

  it("below the floor lists the questions without percentages", () => {
    const html = render(QUESTIONS.slice(0, 1));
    expect(html).toContain(QUESTIONS[0]);
    expect(html).not.toMatch(/\d+%/);
    expect(html).toContain("Añadir preguntas de compra");
  });

  it("with no purchase question invites to add one", () => {
    const report = buildPurchaseQuestions([], { domain: DOMAIN, totalQuestions: 17 });
    const html = renderToStaticMarkup(<PurchaseQuestionsCard projectId="p1" report={report} />);
    expect(html).toContain("Ninguna de tus preguntas es de quien va a comprar");
    expect(html).toContain("/dashboard/projects/p1/prompts");
  });
});
