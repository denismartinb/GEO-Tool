import { describe, expect, it } from "vitest";
import { extractPageFacts } from "./page-facts";

const jsonLd = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;

describe("extractPageFacts", () => {
  it("reads product, brand, price, stock and rating from JSON-LD", () => {
    const html = `<html><head><title>Zapatilla Trail Pro | Tienda</title>${jsonLd({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Zapatilla Trail Pro",
      brand: { "@type": "Brand", name: "Montaña" },
      aggregateRating: { "@type": "AggregateRating", ratingValue: "4.63", reviewCount: 120 },
      offers: { "@type": "Offer", price: "89.95", priceCurrency: "EUR", availability: "https://schema.org/InStock" }
    })}</head></html>`;
    expect(extractPageFacts(html)).toEqual({
      title: "Zapatilla Trail Pro | Tienda",
      productName: "Zapatilla Trail Pro",
      brand: "Montaña",
      price: "89,95 EUR",
      availability: "En stock",
      rating: "4,6"
    });
  });

  it("falls back to Open Graph product tags and leaves the unknown as null", () => {
    const html = `<head><meta property="og:title" content="Taza azul"><meta property="product:price:amount" content="12"><meta property="product:price:currency" content="eur"></head>`;
    const facts = extractPageFacts(html);
    expect(facts.productName).toBe("Taza azul");
    expect(facts.price).toBe("12 EUR");
    expect(facts.brand).toBeNull();
    expect(facts.availability).toBeNull();
    expect(facts.rating).toBeNull();
  });

  it("strips markup and caps what it copies from the store", () => {
    const html = jsonLd({ "@type": "Product", name: `<b>Hola</b> &amp; ${"x".repeat(200)}` });
    const name = extractPageFacts(html).productName ?? "";
    expect(name.startsWith("Hola & ")).toBe(true);
    expect(name).not.toContain("<");
    expect(name.length).toBeLessThanOrEqual(80);
  });

  it("refuses a price without a valid currency", () => {
    const html = jsonLd({ "@type": "Product", name: "A", offers: { price: "10", priceCurrency: "euros" } });
    expect(extractPageFacts(html).price).toBeNull();
  });
});
