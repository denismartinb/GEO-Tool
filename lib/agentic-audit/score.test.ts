import { describe, expect, it } from "vitest";
import type { AgentAccess } from "./api-contract";
import { buildInterop } from "./interop";
import type { PageSignals } from "./html-signals";
import { componentScore, COMPONENT_WEIGHTS, scoreAgenticAudit, type ScoreInput } from "./score";

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

const NO_INTEROP = buildInterop({
  ucp: { state: "absent", body: null },
  mcpCard: { state: "absent", body: null },
  agentCard: { state: "absent", body: null },
  agentCardLegacy: { state: "absent", body: null },
  feed: null,
  feedPlatform: null
});

function input(over: Partial<ScoreInput> = {}): ScoreInput {
  return {
    domain: "tienda.es",
    url: "https://tienda.es/p",
    signals: FULL,
    agents: ALL_IN,
    challenge: false,
    sitemap: "found",
    interop: NO_INTEROP,
    ...over
  };
}

describe("weights", () => {
  it("are the approved 30 / 30 / 20 / 20", () => {
    expect(COMPONENT_WEIGHTS).toEqual({ discovery: 30, understanding: 30, trust: 20, purchase: 20 });
  });

  it("each component's checks add up to 100 points", () => {
    for (const c of scoreAgenticAudit(input()).components) {
      expect(c.checks.reduce((sum, k) => sum + k.points, 0)).toBe(100);
    }
  });
});

describe("scoreAgenticAudit", () => {
  it("a perfect product page scores 100 with no fixes", () => {
    const r = scoreAgenticAudit(input());
    expect(r.score).toBe(100);
    expect(r.fixes).toEqual([]);
    expect(r.pageKind).toBe("product");
  });

  it("interoperability never moves the score", () => {
    const withInterop = buildInterop({
      ucp: { state: "found", body: JSON.stringify({ mcp: {} }) },
      mcpCard: { state: "absent", body: null },
      agentCard: { state: "absent", body: null },
      agentCardLegacy: { state: "absent", body: null },
      feed: null,
      feedPlatform: null
    });
    expect(withInterop.found).toBe(2);
    expect(scoreAgenticAudit(input({ interop: withInterop })).score).toBe(scoreAgenticAudit(input()).score);
  });

  it("a challenge to our bot is not measured: it neither costs points nor becomes a fix", () => {
    const r = scoreAgenticAudit(input({ challenge: true }));
    const check = r.components.find((c) => c.id === "discovery")?.checks.find((c) => c.id === "no_challenge");
    expect(check?.state).toBe("unknown");
    expect(r.components.find((c) => c.id === "discovery")?.score).toBe(100);
    expect(r.fixes.some((f) => f.checkId === "no_challenge")).toBe(false);
  });

  it("an unreadable page has no total and no page checks", () => {
    const r = scoreAgenticAudit(input({ signals: null, challenge: true }));
    expect(r.pageRead).toBe(false);
    expect(r.score).toBeNull();
    expect(r.components.find((c) => c.id === "understanding")?.score).toBeNull();
  });

  it("a page that is not a product has no total and skips Comprensión and Compra", () => {
    const r = scoreAgenticAudit(input({ signals: { ...FULL, hasProductData: false, ogProduct: false } }));
    expect(r.pageKind).toBe("other");
    expect(r.score).toBeNull();
    expect(r.components.find((c) => c.id === "purchase")?.checks).toEqual([]);
    expect(r.components.find((c) => c.id === "trust")?.score).toBe(100);
  });

  it("what we could not measure counts neither for nor against", () => {
    const unknownRobots = scoreAgenticAudit(
      input({ agents: ALL_IN.map((a) => ({ ...a, allowed: null })), sitemap: "unknown" })
    );
    expect(unknownRobots.components.find((c) => c.id === "discovery")?.score).toBe(100);
  });

  it("partial robots access is avg and names who is blocked", () => {
    const agents = ALL_IN.map((a) => (a.assistant === "Claude" ? { ...a, allowed: false } : a));
    const check = scoreAgenticAudit(input({ agents })).components[0].checks.find((c) => c.id === "robots_agents");
    expect(check?.state).toBe("avg");
    expect(check?.label).toContain("Claude");
  });

  it("no copy carries an em-dash", () => {
    const r = scoreAgenticAudit(
      input({ signals: { ...FULL, structuredPrice: false, gtin: false, captcha: "reCAPTCHA", platform: null }, challenge: true })
    );
    expect(JSON.stringify(r)).not.toContain("—");
  });
});

describe("componentScore", () => {
  it("is null when nothing was measurable", () => {
    expect(componentScore([{ id: "x", points: 100, state: "unknown", label: "" }])).toBeNull();
  });
});

describe("checks by what is sold (log §325)", () => {
  const ids = (r: ReturnType<typeof scoreAgenticAudit>, id: string) =>
    r.components.find((c) => c.id === id)!.checks.map((k) => k.id);

  it("software leaves out stock, identifiers and shipping, and asks for cancellation and a buy button", () => {
    const r = scoreAgenticAudit(input({ offer: { kind: "software", pricingPage: true }, signals: { ...FULL, buyCta: true } }));
    expect(r.offerKind).toBe("software");
    expect(r.pricingPage).toBe(true);
    expect(ids(r, "understanding")).toEqual(["product_data", "price", "readable_text"]);
    expect(ids(r, "trust")).toEqual(["cancellation", "reviews", "identity"]);
    expect(ids(r, "purchase")).toEqual(["buy_button", "no_captcha", "quick_pay", "platform"]);
    expect(r.score).not.toBeNull();
  });

  it("a missing check that does not apply never subtracts", () => {
    const physical = scoreAgenticAudit(input({ signals: { ...FULL, gtin: false, skuOrMpn: false } }));
    const service = scoreAgenticAudit(input({ offer: { kind: "service", pricingPage: false }, signals: { ...FULL, gtin: false, skuOrMpn: false, buyCta: true } }));
    expect(physical.components.find((c) => c.id === "understanding")!.score).toBeLessThan(100);
    expect(service.components.find((c) => c.id === "understanding")!.score).toBe(100);
  });

  it("a booking counts its widget as the button and names its booking system", () => {
    const r = scoreAgenticAudit(
      input({ offer: { kind: "booking", pricingPage: false }, signals: { ...FULL, platform: null, bookingWidget: "Doctoralia" } })
    );
    const purchase = r.components.find((c) => c.id === "purchase")!.checks;
    expect(purchase.find((k) => k.id === "buy_button")?.state).toBe("pass");
    expect(purchase.find((k) => k.id === "platform")?.label).toBe("Reservas con Doctoralia");
    expect(purchase.some((k) => k.id === "quick_pay")).toBe(false);
  });

  it("a page that sells nothing has no total", () => {
    const r = scoreAgenticAudit(input({ offer: null }));
    expect(r.score).toBeNull();
    expect(r.pageKind).toBe("other");
  });
});
