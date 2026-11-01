import { describe, expect, it } from "vitest";
import { SELLABLE_PLANS } from "@/app/pricing/plans-data";
import { formatAboutGenScore, formatGuides, measureHook } from "./acquisition";
import type { GuideHit } from "./guides/search";
import { MCP_PROFILES } from "./links";

/**
 * MCP-ACQUISITION-1 (log §425): what an anonymous person reads in each
 * connector. Claude may name plans, prices and the trial when asked;
 * ChatGPT never (OpenAI's app rules), only an informational /precios link.
 */
const BASE = "https://www.genscore.es";
const OFFER = { planIds: ["starter", "pro"], remaining: 12 };
const HIT: GuideHit = {
  score: 9,
  chunk: { path: "/blog/que-fuentes-cita-la-ia", title: "Qué fuentes cita la IA", section: "En cifras", text: "El 84% son medios ganados.", kind: "guia", date: "2026-10-22" }
};
/** Prose only: URLs (`/precios`) are allowed to contain the words. */
const words = (t: string) => t.replace(/https?:\/\/\S+/g, "");
const SELLING = /€|precio|gratis|prueba|tarjeta|fundador|descuento|oferta|Starter|Agencia|\bPro\b/i;

describe("formatAboutGenScore", () => {
  it("Claude: every sellable plan with the price /precios shows, and the founder price only when Stripe confirms it", () => {
    const t = formatAboutGenScore({ base: BASE, profile: "claude", offer: OFFER, signedIn: false }).text;
    for (const p of SELLABLE_PLANS) expect(t).toContain(`**${p.name}**`);
    expect(t).toContain("20 € al mes para siempre con precio fundador (precio normal 29 €)");
    expect(t).toContain("Plan a medida");
    expect(t).toContain("Quedan 12 cuentas con precio fundador.");
    expect(t).toContain("7 días de Pro gratis, sin tarjeta");
    expect(t).toContain(`${BASE}/signup?utm_source=claude&utm_medium=mcp&utm_campaign=que_es_genscore`);

    const noOffer = formatAboutGenScore({ base: BASE, profile: "claude", offer: null, signedIn: false }).text;
    expect(noOffer).toContain("29 € al mes, IVA incluido");
    expect(noOffer).not.toMatch(/fundador/);
  });

  it("ChatGPT: no price, plan, trial or discount in the prose, only an informational /precios link", () => {
    const r = formatAboutGenScore({ base: BASE, profile: "chatgpt", offer: OFFER, signedIn: false });
    expect(words(r.text)).not.toMatch(SELLING);
    expect(r.text).toContain(`${BASE}/precios?utm_source=chatgpt&utm_medium=mcp&utm_campaign=que_es_genscore`);
    expect(JSON.stringify(r.structured)).not.toMatch(/"plans"|founderPrice/);
  });

  it("does not invite a signed-in person to sign up", () => {
    for (const profile of MCP_PROFILES) {
      expect(formatAboutGenScore({ base: BASE, profile, offer: null, signedIn: true }).text).not.toContain("/signup");
    }
  });
});

describe("formatGuides", () => {
  it("quotes the guide with its date, section and tagged link", () => {
    const t = formatGuides({ query: "fuentes", hits: [HIT], base: BASE, profile: "claude", signedIn: true }).text;
    expect(t).toContain("**Qué fuentes cita la IA** (Guía, 22 de octubre de 2026) · En cifras");
    expect(t).toContain(`${BASE}/blog/que-fuentes-cita-la-ia?utm_source=claude&utm_medium=mcp&utm_campaign=buscar_guias`);
    expect(t).not.toContain("/signup");
  });

  it("ends an anonymous answer with the measuring hook, worded per connector", () => {
    const claude = formatGuides({ query: "fuentes", hits: [HIT], base: BASE, profile: "claude", signedIn: false });
    expect(claude.text).toContain("Pruébalo 7 días gratis");
    expect(claude.structured?.next).toEqual([{ kind: "signup", url: `${BASE}/signup?utm_source=claude&utm_medium=mcp&utm_campaign=buscar_guias` }]);
    const chatgpt = formatGuides({ query: "fuentes", hits: [HIT], base: BASE, profile: "chatgpt", signedIn: false });
    expect(words(chatgpt.text)).not.toMatch(SELLING);
    expect(chatgpt.text).toContain("/signup?utm_source=chatgpt");
  });

  it("says when no guide answers, with the blog link", () => {
    const t = formatGuides({ query: "pizza", hits: [], base: BASE, profile: "claude", signedIn: false }).text;
    expect(t).toContain("No hay ninguna guía");
    expect(t).toContain(`${BASE}/blog?utm_source=claude`);
  });
});

describe("measureHook", () => {
  it("prefills the domain", () => {
    expect(measureHook(BASE, "chatgpt", "revisar_pagina", "otra.es")).toContain("/signup?dominio=otra.es&utm_source=chatgpt");
  });
});

describe("house style", () => {
  it("no em dash in any acquisition text", () => {
    for (const profile of MCP_PROFILES) {
      for (const signedIn of [true, false]) {
        expect(formatAboutGenScore({ base: BASE, profile, offer: OFFER, signedIn }).text).not.toContain("—");
        expect(formatGuides({ query: "q", hits: [HIT], base: BASE, profile, signedIn }).text).not.toContain("—");
      }
    }
  });
});
