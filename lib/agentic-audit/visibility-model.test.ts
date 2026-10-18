import { describe, expect, it } from "vitest";
import { buildPurchaseQuestions } from "./purchase-questions";
import type { AgentAccess } from "./api-contract";
import { firstSteps } from "./console-model";
import type { PageSignals } from "./html-signals";
import { buildInterop } from "./interop";
import { scoreAgenticAudit, type ScoreInput } from "./score";
import {
  agentPath,
  componentPoints,
  findLine,
  fixbarLine,
  interopLine,
  overviewAgenticCard,
  reviewedPill,
  stepTone,
  visibilityDetail,
  visibilityHeadline
} from "./visibility-model";

describe("agentPath", () => {
  it("without a review, the four audit steps wait for it and the first has no colour", () => {
    const steps = agentPath(null, null);
    expect(steps.map((s) => s.title)).toEqual(["Te encuentra", "Entra", "Entiende", "Se fía", "Compra"]);
    expect(steps[0].tone).toBe("neutral");
    expect(steps.slice(1).every((s) => s.tone === "na" && s.line === "Pendiente de la auditoría agéntica")).toBe(true);
  });
});

describe("findLine", () => {
  it("says why there is no share", () => {
    expect(findLine(null)).toBe("Aparecerá tras tu primer escaneo");
    expect(findLine(buildPurchaseQuestions([], { domain: "x.es", totalQuestions: 5 }))).toBe(
      "Ninguna de tus preguntas es de compra todavía"
    );
  });
});

const FULL: PageSignals = {
  hasProductData: true,
  hasOffer: true,
  structuredPrice: true,
  textPrice: true,
  availability: true,
  gtin: true,
  skuOrMpn: true,
  shippingData: true,
  returnPolicyData: true,
  reviewData: true,
  organizationData: true,
  ogProduct: true,
  visibleTextChars: 2000,
  links: { returns: true, shipping: true, legal: true, contact: true, cancellation: true },
  platform: "Shopify",
  addToCart: true,
  quickPay: ["Shop Pay"],
  captcha: null,
  offerTypes: [],
  anyOffer: true,
  recurringPrice: false,
  buyCta: false,
  bookingWidget: null,
  paymentPlatform: null
};

const ALL_IN: AgentAccess[] = (["ChatGPT", "Claude", "Perplexity", "Gemini"] as const).map((assistant) => ({
  assistant,
  allowed: true
}));

const base: ScoreInput = {
  domain: "tienda.es",
  url: "https://tienda.es/p/x",
  signals: FULL,
  agents: ALL_IN,
  challenge: false,
  sitemap: "found",
  interop: buildInterop({
    ucp: { state: "absent", body: null },
    mcpCard: { state: "absent", body: null },
    agentCard: { state: "absent", body: null },
    agentCardLegacy: { state: "absent", body: null },
    feed: null,
    feedPlatform: null
  })
};

const full = scoreAgenticAudit(base);
const weak = scoreAgenticAudit({
  ...base,
  signals: { ...FULL, gtin: false, skuOrMpn: false, returnPolicyData: false, availability: false, quickPay: [] }
});

describe("summary", () => {
  it("names what holds an agent back, from the weakest measured component", () => {
    expect(visibilityHeadline(full)).toBe("Un agente puede recorrer tu web hasta comprar.");
    expect(visibilityHeadline(weak)).toMatch(/^Lo que más frena a un agente es /);
    expect(visibilityDetail(weak)).toMatch(/: .+\.$/);
    expect(visibilityHeadline(null)).toBe("La auditoría agéntica revisa tu web sola tras cada escaneo.");
    expect(visibilityHeadline({ ...weak, found: "none" })).toBe("No hemos encontrado qué vendes en tu web.");
  });

  it("projects the score with the engine, never by summing gains", () => {
    const steps = firstSteps(weak, 2);
    const line = fixbarLine(weak, steps);
    expect(line?.from).toBe(weak.score);
    expect(line && line.to > line.from).toBe(true);
    expect(line?.what).toBe("las dos primeras cosas");
    expect(fixbarLine(full, firstSteps(full))).toBeNull();
    expect(steps.every((s) => stepTone(weak, s) !== "na")).toBe(true);
  });
});

describe("components", () => {
  it("shows each component as its share of the total", () => {
    const discovery = full.components.find((c) => c.id === "discovery")!;
    expect(componentPoints(discovery)).toBe(discovery.weight);
    expect(componentPoints({ ...discovery, score: null })).toBeNull();
  });

  it("says which protocols are missing, never «sin puntos»", () => {
    const line = interopLine(full);
    expect(line.tone).toBe("warn");
    expect(line.line).toMatch(/^Te falta: /);
    expect(line.line).not.toMatch(/sin puntos|informativo/i);
  });
});

describe("reviewedPill", () => {
  it("reads today and yesterday in Madrid time", () => {
    const now = new Date("2026-10-18T12:00:00Z");
    expect(reviewedPill("2026-10-18T08:00:00Z", now)).toBe("Revisado · hoy");
    expect(reviewedPill("2026-10-17T08:00:00Z", now)).toBe("Revisado · ayer");
    expect(reviewedPill("2026-10-12T08:00:00Z", now)).toBe("Revisado · 12 oct");
  });
});

describe("overviewAgenticCard", () => {
  it("Starter gets the invitation to Pro, whatever the review says", () => {
    expect(overviewAgenticCard("starter", null)).toEqual({ kind: "upsell" });
    expect(overviewAgenticCard("starter", weak)).toEqual({ kind: "upsell" });
  });

  it("any other plan without the agentic audit sees nothing", () => {
    expect(overviewAgenticCard("free", weak).kind).toBe("hidden");
    expect(overviewAgenticCard(null, weak).kind).toBe("hidden");
    expect(overviewAgenticCard(undefined, weak).kind).toBe("hidden");
  });

  it("Pro and Agencia see nothing until the review found something it sells and scored it", () => {
    expect(overviewAgenticCard("pro", null).kind).toBe("hidden");
    expect(overviewAgenticCard("agency", { ...weak, found: "none" }).kind).toBe("hidden");
    expect(overviewAgenticCard("pro", { ...weak, score: null }).kind).toBe("hidden");
  });

  it("the card carries the score, the headline, four components and the first fix with no points", () => {
    const card = overviewAgenticCard("pro", weak);
    if (card.kind !== "card") throw new Error("expected a card");
    expect(card.score).toBe(weak.score);
    expect(card.headline).toBe(visibilityHeadline(weak));
    expect(card.components.map((c) => c.id)).toEqual(["discovery", "understanding", "trust", "purchase"]);
    expect(card.components.map((c) => c.weight)).toEqual([30, 30, 20, 20]);
    expect(card.first?.title).toBe(firstSteps(weak, 1)[0].title);
    expect(card.first && "points" in card.first).toBe(false);
  });
});
