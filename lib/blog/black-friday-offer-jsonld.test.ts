import { describe, expect, it } from "vitest";

import { extractPageSignals } from "@/lib/agentic-audit/html-signals";
import { BLACK_FRIDAY_OFFER_JSONLD } from "./black-friday-offer-jsonld";

/**
 * El artículo de Black Friday promete que este bloque declara, como datos que
 * un agente lee sin ejecutar JavaScript, el precio rebajado y el anterior, la
 * fecha de fin, el stock, el envío y las devoluciones. Se comprueba con el
 * mismo lector de la Auditoría agéntica, para que lo que dice la pieza y lo
 * que marcará el producto sobre la ficha del lector no se contradigan.
 */
describe("JSON-LD de ejemplo del artículo de Black Friday", () => {
  const data = JSON.parse(BLACK_FRIDAY_OFFER_JSONLD);
  const offer = data.offers;

  it("es JSON válido de un producto con oferta", () => {
    expect(data["@type"]).toBe("Product");
    expect(offer["@type"]).toBe("Offer");
  });

  it("marca el precio anterior como StrikethroughPrice y deja el activo sin priceType", () => {
    expect(offer.priceType).toBeUndefined();
    expect(offer.priceSpecification.priceType).toBe("https://schema.org/StrikethroughPrice");
    expect(offer.priceSpecification.price).toBeGreaterThan(offer.price);
    expect(offer.priceSpecification.priceCurrency).toBe(offer.priceCurrency);
  });

  it("pone fin a la oferta después del Cyber Monday", () => {
    expect(offer.priceValidUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(offer.priceValidUntil >= "2026-11-30").toBe(true);
  });

  it("la Auditoría agéntica lee precio, stock, envío y devoluciones", () => {
    const html = `<html><head><script type="application/ld+json">${BLACK_FRIDAY_OFFER_JSONLD}</script></head><body></body></html>`;
    const s = extractPageSignals(html);
    expect(s.hasProductData).toBe(true);
    expect(s.structuredPrice).toBe(true);
    expect(s.availability).toBe(true);
    expect(s.gtin).toBe(true);
    expect(s.shippingData).toBe(true);
    expect(s.returnPolicyData).toBe(true);
  });
});
