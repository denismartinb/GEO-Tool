import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AgenticCheckResult, AgenticComponentResult } from "@/lib/agentic-audit/api-contract";
import { AgenticResultView } from "./agentic-result-view";
import { AGENTIC_FAILURE_COPY } from "./agentic-checker";

/**
 * AGENTIC-COMMERCE-1: render tests of the checker's result. They pin CONTENT
 * (which number is published, what is hidden, what says «No se pudo medir»),
 * never classes or looks.
 */

function component(
  id: AgenticComponentResult["id"],
  name: string,
  weight: number,
  score: number | null,
  checks: AgenticComponentResult["checks"] = []
): AgenticComponentResult {
  return { id, name, weight, score, checks };
}

const BASE: AgenticCheckResult = {
  domain: "tutienda.es",
  url: "https://tutienda.es/zapatilla",
  pageKind: "product",
  pageRead: true,
  score: 61,
  components: [
    component("discovery", "Descubrimiento", 30, 70, [
      { id: "robots", state: "pass", label: "robots.txt deja pasar a los asistentes", points: 40 },
      { id: "challenge", state: "unknown", label: "Reto a las visitas automáticas", points: 35 }
    ]),
    component("understanding", "Comprensión", 30, 55, [
      { id: "gtin", state: "fail", label: "La ficha no declara el GTIN", fix: "Añade gtin13 a tu Offer", points: 15 }
    ]),
    component("trust", "Confianza", 20, 60),
    component("purchase", "Compra", 20, 58)
  ],
  interop: {
    found: 2,
    total: 4,
    items: [
      { id: "ucp", label: "Perfil UCP", state: "found", detail: "" },
      { id: "mcp", label: "MCP", state: "found", detail: "" },
      { id: "a2a", label: "Tarjeta de agente A2A", state: "absent", detail: "" },
      { id: "feed", label: "Catálogo público", state: "unknown", detail: "" }
    ]
  },
  agents: [
    { assistant: "ChatGPT", allowed: true },
    { assistant: "Claude", allowed: false },
    { assistant: "Perplexity", allowed: null },
    { assistant: "Gemini", allowed: true }
  ],
  challenge: false,
  fixes: [{ component: "understanding", checkId: "gtin", label: "Declara el GTIN de tus productos", gain: 5 }],
  platform: "Shopify",
  facts: { title: "Zapatilla | Tu tienda", productName: "Zapatilla Trail", brand: null, price: "89,95 EUR", availability: "En stock", rating: null }
};

const render = (result: AgenticCheckResult) => renderToStaticMarkup(<AgenticResultView result={result} play={false} />);

describe("AgenticResultView", () => {
  it("shows the total and the interoperability count on a product page", () => {
    const html = render(BASE);
    expect(html).toContain("61 de 100");
    expect(html).toContain("2 de 4 protocolos publicados");
    expect(html).toContain("2/4");
    expect(html).toContain("+5");
    expect(html).toContain("Le bloqueas");
    expect(html).toContain("No se pudo leer");
  });

  it("hides the total but keeps all five components when the page is not a product page", () => {
    const html = render({
      ...BASE,
      pageKind: "other",
      score: null,
      components: BASE.components.map((c) =>
        c.id === "understanding" || c.id === "purchase" ? { ...c, score: null, checks: [] } : c
      )
    });
    expect(html).not.toContain("de 100</span>");
    expect(html).toContain(">Comprensión<");
    expect(html).toContain(">Compra<");
    expect(html).toContain("En una ficha");
    expect(html).toContain("Has pegado una portada o una categoría");
  });

  it("says the site did not let us in when the page could not be read", () => {
    const html = render({ ...BASE, pageRead: false, score: null, challenge: true });
    expect(html).not.toContain("61 de 100");
    expect(html).toContain("El dominio tutienda.es tiene una protección anti-bots");
    expect(html).toContain("Hay agentes verificados que sí podrán leerla");
    expect(html).not.toContain("Has pegado una portada");
  });

  it("labels an unmeasured check as such, never as correct", () => {
    const html = render(BASE);
    expect(html).toContain("Reto a las visitas automáticas</b><span class=\"ca-ck-s\">No se pudo medir");
  });

  it("frames the result as a quick check, shows the store's own data and invites to Pro honestly", () => {
    const html = render(BASE);
    expect(html).toContain("Comprobación rápida de una ficha");
    expect(html).toContain("Zapatilla Trail");
    expect(html).toContain("89,95 EUR");
    expect(html).toContain("En la consola lo verás todo en detalle");
    expect(html).toContain("Empezar gratis con Pro");
    expect(html).toContain("llega muy pronto a la consola de Pro");
  });

  it("never writes an em dash nor the retired «sin puntos» wording", () => {
    const html = render(BASE) + Object.values(AGENTIC_FAILURE_COPY).join(" ");
    expect(html).not.toContain("—");
    expect(html.toLowerCase()).not.toContain("sin puntos");
    expect(html.toLowerCase()).not.toContain("informativo");
  });
});
