import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FaqPageSchema } from "@/components/seo/faq-page-schema";
import { PLAN_FAQ } from "./plans-data";

/**
 * SEO-POS-1 (T8). El schema `FAQPage` de `/pricing` debe ser exactamente el
 * mismo `PLAN_FAQ` que la página renderiza en su acordeón
 * (`components/pricing/pricing-page.tsx`) — nunca una lista aparte, por la
 * regla de honestidad de `content-strategy.md` §4.3: "las preguntas deben ser
 * las que el contenido visible responde de verdad".
 */
describe("FAQ schema de /pricing", () => {
  it("PLAN_FAQ no está vacío (si lo estuviera, no habría nada real que marcar)", () => {
    expect(PLAN_FAQ.length).toBeGreaterThan(0);
  });

  it("cada pregunta y respuesta de PLAN_FAQ aparece en el JSON-LD", () => {
    const html = renderToStaticMarkup(
      FaqPageSchema({ items: PLAN_FAQ.map((f) => ({ question: f.q, answer: f.a })) })
    );
    const match = html.match(/<script[^>]*>(.*)<\/script>/s);
    expect(match).toBeTruthy();
    const json = JSON.parse(match![1]);
    expect(json["@type"]).toBe("FAQPage");
    expect(json.mainEntity).toHaveLength(PLAN_FAQ.length);
    for (const [i, faq] of PLAN_FAQ.entries()) {
      expect(json.mainEntity[i].name).toBe(faq.q);
      expect(json.mainEntity[i].acceptedAnswer.text).toBe(faq.a);
    }
  });
});
