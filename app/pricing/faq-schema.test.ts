import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FaqPageSchema } from "@/components/seo/faq-page-schema";
import { PLAN_FAQ } from "./plans-data";

/**
 * SEO-POS-1 (T8). El schema `FAQPage` de `/precios` debe ser exactamente el
 * mismo `PLAN_FAQ` que la página renderiza en su acordeón
 * (`components/pricing/pricing-page.tsx`) — nunca una lista aparte, por la
 * regla de honestidad de `content-strategy.md` §4.3: "las preguntas deben ser
 * las que el contenido visible responde de verdad".
 */
describe("FAQ schema de /precios", () => {
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

  // PRICING-FAQ-LIVE-1 (log §236): con Stripe en real, el FAQ decía que
  // todavía no cobrábamos y que la prueba de Pro no caducaba. Ambas cosas eran
  // falsas (0017_reverse_trial.sql: `interval '7 days'`) y frenaban la compra.
  it("no anuncia que la facturación está pendiente ni una prueba sin fin", () => {
    const text = PLAN_FAQ.map((f) => f.a).join(" ");
    expect(text).not.toMatch(/facturación real|lancemos la facturación|límite de tiempo automático/);
    expect(text).toMatch(/7 días/);
  });
});
