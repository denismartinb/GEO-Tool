import { describe, expect, it } from "vitest";
import type { AgentAccess } from "./api-contract";
import { componentLine, componentStatus, firstSteps, initialComponent, projectedSentence } from "./console-model";
import type { PageSignals } from "./html-signals";
import { buildInterop } from "./interop";
import { scoreAgenticAudit, scoreIfChecksPass, type ScoreInput } from "./score";

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

const weak = scoreAgenticAudit({
  ...base,
  signals: { ...FULL, gtin: false, skuOrMpn: false, returnPolicyData: false, availability: false, quickPay: [] }
});

describe("scoreIfChecksPass (log §322)", () => {
  it("recomputes the total with the same arithmetic as the score", () => {
    const allIds = new Set(weak.components.flatMap((c) => c.checks.map((k) => k.id)));
    expect(scoreIfChecksPass(weak, new Set())).toBe(weak.score);
    expect(scoreIfChecksPass(weak, allIds)).toBe(100);
  });

  it("has no figure without a total", () => {
    const home = scoreAgenticAudit({ ...base, signals: { ...FULL, hasProductData: false, hasOffer: false, ogProduct: false } });
    expect(home.score).toBeNull();
    expect(scoreIfChecksPass(home, new Set(["returns"]))).toBeNull();
  });
});

describe("console model", () => {
  it("lists at most three first steps, each with what we saw", () => {
    const steps = firstSteps(weak);
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.length).toBeLessThanOrEqual(3);
    expect(steps[0]).toMatchObject({ checkId: weak.fixes[0].checkId, title: weak.fixes[0].label });
    expect(steps.every((s) => s.seen.length > 0)).toBe(true);
  });

  it("says the projected score the engine computes, never the sum of rounded gains", () => {
    const steps = firstSteps(weak);
    const projected = scoreIfChecksPass(weak, new Set(steps.map((s) => s.checkId)));
    expect(projectedSentence(weak, steps)).toBe(`Si arreglas las tres primeras cosas de «Qué hacer primero», subes a ${projected}.`);
  });

  it("says nothing when there is nothing to fix", () => {
    const perfect = scoreAgenticAudit(base);
    expect(firstSteps(perfect)).toEqual([]);
    expect(projectedSentence(perfect, [])).toBeNull();
  });

  it("names a component it could not measure «Sin medir» and says why", () => {
    const blocked = scoreAgenticAudit({ ...base, signals: null, challenge: true });
    const understanding = blocked.components.find((c) => c.id === "understanding")!;
    expect(componentStatus(understanding)).toEqual({ tone: "na", word: "Sin medir" });
    expect(componentLine(blocked, understanding)).toContain("anti-bots");

    const home = scoreAgenticAudit({ ...base, signals: { ...FULL, hasProductData: false, hasOffer: false, ogProduct: false } });
    const purchase = home.components.find((c) => c.id === "purchase")!;
    expect(componentLine(home, purchase)).toBe("Se mide en una ficha de producto");
  });

  it("opens on the first component with something to fix", () => {
    expect(initialComponent(weak)).toBe(weak.components.find((c) => c.checks.some((k) => k.state !== "pass" && k.state !== "unknown"))!.id);
    expect(initialComponent(scoreAgenticAudit(base))).toBe("discovery");
  });
});
