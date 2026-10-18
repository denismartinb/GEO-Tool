import { describe, expect, it } from "vitest";
import { findProductCandidate, findSellCandidate, type FindProductInput } from "./find-product";

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

describe("findSellCandidate (log §325)", () => {
  it("prefers a pricing page over a service page, from the page links first", () => {
    expect(
      findSellCandidate({
        ...base,
        pageHtml: '<a href="/servicios/seo">SEO</a><a href="/blog/x">Blog</a><a href="/precios">Precios</a>',
        sitemapBody: "<urlset><url><loc>https://www.tienda.es/pricing</loc></url></urlset>"
      })
    ).toEqual({ url: "https://www.tienda.es/precios", source: "home" });
  });

  it("falls back to the sitemap, and never leaves the domain or returns the current page", () => {
    expect(
      findSellCandidate({
        ...base,
        currentUrl: "https://www.tienda.es/reservar",
        pageHtml: '<a href="https://otra.es/precios">x</a><a href="/reservar">y</a>',
        sitemapBody: "<urlset><url><loc>https://www.tienda.es/cursos/geo</loc></url></urlset>"
      })
    ).toEqual({ url: "https://www.tienda.es/cursos/geo", source: "sitemap" });
  });

  it("returns null when nothing looks like a selling page", () => {
    expect(findSellCandidate({ ...base, pageHtml: '<a href="/contacto">x</a><a href="/servicios">y</a>' })).toBeNull();
  });
});
