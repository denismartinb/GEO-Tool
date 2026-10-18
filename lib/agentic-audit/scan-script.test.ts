import { describe, expect, it } from "vitest";
import type { AgenticCheckResult } from "./api-contract";
import { buildScanScript, SCAN_DURATION_S, SCAN_HOLD_AT, scanTargetFromInput, scriptedTime } from "./scan-script";

const target = { host: "tutienda.es", url: "https://tutienda.es/zapatilla" };

const RESULT: AgenticCheckResult = {
  domain: "tutienda.es",
  url: "https://tutienda.es/zapatilla",
  pageKind: "product",
  pageRead: true,
  score: 70,
  components: [
    {
      id: "discovery",
      name: "Descubrimiento",
      weight: 30,
      score: 80,
      checks: [
        { id: "robots_agents", state: "avg", label: "Tu robots.txt bloquea a Claude", points: 45 },
        { id: "no_challenge", state: "pass", label: "Tu web no pone retos a las visitas automáticas", points: 40 },
        { id: "sitemap", state: "fail", label: "No publicas sitemap.xml", points: 15 }
      ]
    },
    {
      id: "understanding",
      name: "Comprensión",
      weight: 30,
      score: 60,
      checks: [{ id: "price", state: "pass", label: "El precio y la moneda se leen como datos", points: 20 }]
    },
    { id: "trust", name: "Confianza", weight: 20, score: 50, checks: [] },
    {
      id: "purchase",
      name: "Compra",
      weight: 20,
      score: 50,
      checks: [{ id: "quick_pay", state: "pass", label: "Ofreces pagos rápidos (Shop Pay, Apple Pay)", points: 15 }]
    }
  ],
  interop: { found: 1, total: 4, items: [{ id: "ucp", label: "Perfil UCP", state: "found", detail: "" }] },
  agents: [
    { assistant: "ChatGPT", allowed: true },
    { assistant: "Claude", allowed: false }
  ],
  challenge: false,
  fixes: [],
  platform: "Shopify",
  facts: { title: "Zapatilla Trail Pro | Tu Tienda", productName: "Zapatilla Trail Pro", brand: null, price: "89,95 EUR", availability: null, rating: null }
};

describe("scanTargetFromInput", () => {
  it("adds https and keeps the path", () => {
    expect(scanTargetFromInput("TuTienda.es/zapatilla")).toEqual({ host: "tutienda.es", url: "https://tutienda.es/zapatilla" });
    expect(scanTargetFromInput("hola")).toBeNull();
  });
});

describe("buildScanScript", () => {
  it("before the response only lists the requests the server really makes", () => {
    const script = buildScanScript(target, null);
    expect(script.lines.every((l) => l.at < SCAN_HOLD_AT)).toBe(true);
    const texts = script.lines.map((l) => l.text);
    expect(texts).toContain("GET  https://tutienda.es/zapatilla");
    expect(texts).toContain("GET  https://tutienda.es/robots.txt");
    expect(texts).toContain("GET  https://tutienda.es/.well-known/ucp");
    expect(script.lanes.every((lane) => lane.items.every((i) => i.state === null))).toBe(true);
  });

  it("after the response speaks about this store with its own data", () => {
    const script = buildScanScript(target, RESULT);
    const all = [...script.lines.map((l) => l.text), ...script.phrases.map((p) => p.text)].join("\n");
    expect(all).toContain("200 · Zapatilla Trail Pro | Tu Tienda");
    expect(all).toContain("ChatGPT: entra · Claude: bloqueado");
    expect(all).toContain("precio · 89,95 EUR");
    expect(all).toContain("Entendiendo «Zapatilla Trail Pro» a 89,95 EUR");
    expect(all).toContain("GET  https://tutienda.es/products.json?limit=1");
    expect(all).toContain("calculando la Visibilidad agéntica de tutienda.es");

    const discovery = script.lanes.find((l) => l.id === "discovery")!;
    expect(discovery.items.find((i) => i.label === "Claude")).toMatchObject({ state: "fail", detail: "Le bloqueas" });
    expect(discovery.items.find((i) => i.label === "Sitemap")).toMatchObject({ state: "fail" });
    const understanding = script.lanes.find((l) => l.id === "understanding")!;
    expect(understanding.items[0]).toMatchObject({ label: "Precio", detail: "89,95 EUR", state: "pass" });
    const purchase = script.lanes.find((l) => l.id === "purchase")!;
    expect(purchase.items[0].detail).toBe("Shop Pay, Apple Pay");
  });

  it("says a page-level lane needs a product page instead of inventing checks", () => {
    const script = buildScanScript(target, { ...RESULT, pageKind: "other", components: RESULT.components.map((c) => ({ ...c, checks: c.id === "discovery" ? c.checks : [] })) });
    expect(script.lanes.find((l) => l.id === "understanding")!.note).toBe("Se mide en una página donde vendas algo");
  });

  it("never prints a percentage nor an em dash", () => {
    const all = JSON.stringify(buildScanScript(target, RESULT));
    expect(all).not.toMatch(/\d\s?%/);
    expect(all).not.toContain("—");
  });
});

describe("scriptedTime", () => {
  it("holds until the response and then finishes the ten seconds", () => {
    expect(scriptedTime(5, null)).toBe(SCAN_HOLD_AT);
    expect(scriptedTime(SCAN_DURATION_S, 0.5)).toBeCloseTo(SCAN_DURATION_S);
    expect(scriptedTime(5, 6)).toBe(SCAN_HOLD_AT);
    expect(scriptedTime(SCAN_DURATION_S, 6)).toBeCloseTo(SCAN_DURATION_S);
    expect(scriptedTime(10, 6)).toBeLessThan(SCAN_DURATION_S);
  });

  it("never squeezes a late response below the minimum tail", () => {
    expect(scriptedTime(11, 8)).toBeLessThan(SCAN_DURATION_S);
    expect(scriptedTime(12, 8)).toBeCloseTo(SCAN_DURATION_S);
  });
});
