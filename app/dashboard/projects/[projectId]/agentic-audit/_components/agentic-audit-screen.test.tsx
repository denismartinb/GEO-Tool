import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("../actions", () => ({ runAgenticAuditAction: async () => ({ success: true }) }));

import type { AgentAccess } from "@/lib/agentic-audit/api-contract";
import type { PageSignals } from "@/lib/agentic-audit/html-signals";
import { buildInterop } from "@/lib/agentic-audit/interop";
import { scoreAgenticAudit, type ScoreInput } from "@/lib/agentic-audit/score";
import { AgenticAuditScreen, AgenticAuditSearching, AgenticAuditUnreachable } from "./agentic-audit-screen";

/**
 * AGENTIC-COMMERCE-1 Fase 2a (log §322, §323): render tests of the console screen.
 * They pin CONTENT (what is published, what says «Sin medir», what never
 * appears), never classes or looks.
 */

const SIGNALS: PageSignals = {
  hasProductData: true,
  hasOffer: true,
  structuredPrice: true,
  textPrice: true,
  availability: false,
  gtin: false,
  skuOrMpn: false,
  shippingData: true,
  returnPolicyData: false,
  reviewData: true,
  organizationData: true,
  ogProduct: true,
  visibleTextChars: 2000,
  links: { returns: true, shipping: true, legal: true, contact: true },
  platform: "Shopify",
  addToCart: true,
  quickPay: ["Shop Pay"],
  captcha: null
};

const AGENTS: AgentAccess[] = [
  { assistant: "ChatGPT", allowed: true },
  { assistant: "Claude", allowed: false },
  { assistant: "Perplexity", allowed: true },
  { assistant: "Gemini", allowed: null }
];

const INPUT: ScoreInput = {
  domain: "tienda.es",
  url: "https://tienda.es/p/zapatilla",
  signals: SIGNALS,
  agents: AGENTS,
  challenge: false,
  sitemap: "found",
  interop: buildInterop({
    ucp: { state: "found", body: "{}" },
    mcpCard: { state: "absent", body: null },
    agentCard: { state: "absent", body: null },
    agentCardLegacy: { state: "absent", body: null },
    feed: null,
    feedPlatform: null
  })
};

function render(result: ReturnType<typeof scoreAgenticAudit>, remaining = 5) {
  return renderToStaticMarkup(
    <AgenticAuditScreen projectId="p1" reviewedLabel="Revisada hoy a las 10:42." result={result} remaining={remaining} refresh={false} />
  );
}

describe("AgenticAuditScreen", () => {
  it("shows the engine's score, the five components and the projected score", () => {
    const result = scoreAgenticAudit(INPUT);
    const html = render(result);
    expect(html).toContain(`Visibilidad agéntica: ${result.score} de 100`);
    for (const name of ["Descubrimiento", "Comprensión", "Confianza", "Compra", "Interoperabilidad"]) {
      expect(html).toContain(name);
    }
    expect(html).toContain("subes a");
    expect(html).toContain("Revisada hoy a las 10:42.");
  });

  it("reads robots.txt per assistant and never claims a per-agent response", () => {
    const html = render(scoreAgenticAudit(INPUT));
    expect(html).toContain("Permitido");
    expect(html).toContain("Bloqueado");
    expect(html).toContain("No se pudo leer");
    expect(html).not.toContain("Responde");
    expect(html).not.toContain("Compra como invitado");
  });

  it("never shows check points, only states", () => {
    const html = render(scoreAgenticAudit(INPUT));
    expect(html).not.toMatch(/\d+\s*\/\s*\d+\b(?! *de)/);
    expect(html).not.toContain("Pesa");
  });

  it("has no total and says why when our robot could not read the page", () => {
    const html = render(scoreAgenticAudit({ ...INPUT, signals: null, challenge: true }));
    expect(html).not.toContain("Visibilidad agéntica:");
    expect(html).toContain("anti-bots");
    expect(html).toContain("Sin medir");
    expect(html).toContain("Reto anti-bots");
  });

  it("asks for another product page when the reviewed page is not one", () => {
    const html = render(scoreAgenticAudit({ ...INPUT, signals: { ...SIGNALS, hasProductData: false, hasOffer: false, ogProduct: false } }));
    expect(html).toContain("La nota se calcula sobre una ficha de producto");
    expect(html).toContain("elige otra ficha");
  });

  it("says where the product page came from, with no «Revisar ahora» button", () => {
    const html = render({ ...scoreAgenticAudit(INPUT), found: "catalog" });
    expect(html).toContain("Ficha revisada");
    expect(html).toContain("https://tienda.es/p/zapatilla");
    expect(html).toContain("Elegida automáticamente de tu catálogo. Revisada hoy a las 10:42.");
    expect(html).toContain("Elegir otra ficha");
    expect(html).not.toContain("Revisar ahora");
  });

  it("hides «Elegir otra ficha» once the daily reviews are used", () => {
    const html = render(scoreAgenticAudit(INPUT), 0);
    expect(html).not.toContain("Elegir otra ficha");
    expect(html).toContain("podrás elegir otra ficha mañana");
  });

  it("says plainly when there is no store, without a made-up total", () => {
    const home = scoreAgenticAudit({
      ...INPUT,
      url: "https://tienda.es/",
      signals: { ...SIGNALS, hasProductData: false, hasOffer: false, ogProduct: false }
    });
    const html = render({ ...home, found: "none" });
    expect(html).toContain("No hemos encontrado una tienda en tu web");
    expect(html).toContain("¿Vendes online? Indícanos una ficha");
    expect(html).toContain("En una ficha");
    expect(html).not.toContain("Visibilidad agéntica:");
    expect(html).not.toContain("Ficha revisada");
  });

  it("first visit: a spinner and no fake progress steps", () => {
    const html = renderToStaticMarkup(<AgenticAuditSearching projectId="p1" />);
    expect(html).toContain("Buscando una ficha de producto en tu tienda");
    expect(html).toContain("Al terminar, la pantalla se rellena sola.");
    expect(html).not.toMatch(/%|paso \d/i);
  });

  it("when the site could not be opened, offers to point at a product page", () => {
    const html = renderToStaticMarkup(<AgenticAuditUnreachable projectId="p1" domain="tienda.es" remaining={5} />);
    expect(html).toContain("No hemos podido abrir tu web");
    expect(html).toContain("Revisar esta ficha");
  });
});
