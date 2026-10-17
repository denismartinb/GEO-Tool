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
  links: { returns: true, shipping: true, legal: true, contact: true },
  platform: "Shopify",
  addToCart: true,
  quickPay: ["Shop Pay"],
  captcha: null
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

  it("a challenge costs Descubrimiento and leads the fixes", () => {
    const r = scoreAgenticAudit(input({ challenge: true }));
    expect(r.components.find((c) => c.id === "discovery")?.score).toBe(60);
    expect(r.score).toBe(88);
    expect(r.fixes[0]).toMatchObject({ checkId: "no_challenge", gain: 12 });
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
