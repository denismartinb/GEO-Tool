import { describe, expect, it } from "vitest";
import { findProductCandidate, type FindProductInput } from "./find-product";

const base: FindProductInput = {
  origin: "https://www.tienda.es",
  baseDomain: "tienda.es",
  currentUrl: "https://www.tienda.es/",
  feedBody: null,
  feedPlatform: null,
  sitemapBody: null,
  pageHtml: null
};

describe("findProductCandidate", () => {
  it("prefers the Shopify catalogue handle", () => {
    expect(
      findProductCandidate({
        ...base,
        feedPlatform: "Shopify",
        feedBody: '{"products":[{"handle":"gorra-azul"}]}',
        pageHtml: '<a href="/products/otra">x</a>'
      })
    ).toEqual({ url: "https://www.tienda.es/products/gorra-azul", source: "catalog" });
  });

  it("takes a WooCommerce permalink only on the store's own domain", () => {
    expect(
      findProductCandidate({
        ...base,
        feedPlatform: "WooCommerce",
        feedBody: '[{"permalink":"https://evil.com/product/x"},{"permalink":"https://tienda.es/producto/silla/"}]'
      })
    ).toEqual({ url: "https://tienda.es/producto/silla/", source: "catalog" });
  });

  it("reads product-looking locs from a sitemap urlset, never from an index", () => {
    const urlset = `<urlset><url><loc>https://www.tienda.es/</loc></url><url><loc>https://www.tienda.es/products</loc></url><url><loc>https://www.tienda.es/producto/mesa</loc></url></urlset>`;
    expect(findProductCandidate({ ...base, sitemapBody: urlset })).toEqual({
      url: "https://www.tienda.es/producto/mesa",
      source: "sitemap"
    });
    const index = `<sitemapindex><sitemap><loc>https://www.tienda.es/product/sitemap.xml</loc></sitemap></sitemapindex>`;
    expect(findProductCandidate({ ...base, sitemapBody: index })).toBeNull();
  });

  it("falls back to a JSON-LD product url or a product link on the page", () => {
    const ld = `<script type="application/ld+json">{"@type":"Product","url":"https://www.tienda.es/p/zapato"}</script>`;
    expect(findProductCandidate({ ...base, pageHtml: ld })).toEqual({ url: "https://www.tienda.es/p/zapato", source: "home" });
    const links = `<a href="/blog/post">b</a><a href="https://otra.es/products/x">o</a><a href="/12-camisa-lino.html">c</a>`;
    expect(findProductCandidate({ ...base, pageHtml: links })).toEqual({
      url: "https://www.tienda.es/12-camisa-lino.html",
      source: "home"
    });
  });

  it("never returns the page already read, and nothing when no candidate exists", () => {
    expect(
      findProductCandidate({ ...base, currentUrl: "https://www.tienda.es/products/a", pageHtml: '<a href="/products/a/">a</a>' })
    ).toBeNull();
    expect(findProductCandidate({ ...base, pageHtml: '<a href="/contacto">c</a>' })).toBeNull();
  });
});
