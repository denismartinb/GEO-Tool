import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PLANS } from "@/app/pricing/plans-data";
import { extractPageSignals } from "@/lib/agentic-audit/html-signals";
import { SoftwareApplicationSchema } from "./software-application-schema";

/**
 * MCP-SITE-FIXES-1 (log §430). `/precios` declares one Offer per plan with a
 * list price, so the agentic audit reads it as software with a price.
 */
function render(withPlanOffers: boolean): { html: string; json: Record<string, unknown> } {
  const html = renderToStaticMarkup(SoftwareApplicationSchema({ withPlanOffers }));
  const match = html.match(/<script[^>]*>(.*)<\/script>/s);
  if (!match) throw new Error("sin JSON-LD");
  return { html, json: JSON.parse(match[1]) };
}

describe("SoftwareApplicationSchema", () => {
  it("keeps the single «from» offer by default (home, que-es-genscore)", () => {
    const { json } = render(false);
    expect(Array.isArray(json.offers)).toBe(false);
  });

  it("on /precios lists Starter and Pro at their list price, monthly, VAT included", () => {
    const offers = render(true).json.offers as Array<Record<string, unknown>>;
    expect(offers.map((o) => o.name)).toEqual(["GenScore Starter", "GenScore Pro"]);
    for (const o of offers) {
      const plan = PLANS.find((p) => `GenScore ${p.name}` === o.name)!;
      expect(o.price).toBe(String(plan.price));
      expect(o.priceCurrency).toBe("EUR");
      const spec = o.priceSpecification as Record<string, unknown>;
      expect(spec.unitCode).toBe("MON");
      expect(spec.valueAddedTaxIncluded).toBe(true);
    }
  });

  it("never declares Agencia (no list price) nor the founder coupon price", () => {
    const serialized = JSON.stringify(render(true).json);
    expect(serialized).not.toContain("Agencia");
    for (const p of PLANS) {
      if (p.promoPrice !== undefined) expect(serialized).not.toContain(`"price":"${p.promoPrice}"`);
    }
  });

  it("is read by the agentic audit as software with a structured price", () => {
    const signals = extractPageSignals(`<html><head>${render(true).html}</head><body></body></html>`);
    expect(signals.offerTypes).toContain("software");
    expect(signals.anyOffer).toBe(true);
    expect(signals.structuredPrice).toBe(true);
  });
});
