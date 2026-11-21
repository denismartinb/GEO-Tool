import { describe, expect, it } from "vitest";
import { findDiscoveryCandidate, findProductCandidate, findSellCandidate, looksLikeStorefront, type FindProductInput } from "./find-product";

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

describe("findDiscoveryCandidate (SHOP-DETECT-2, log §407)", () => {
  const peec = {
    ...base,
    origin: "https://peec.ai",
    baseDomain: "peec.ai",
    currentUrl: "https://peec.ai/",
    sitemapBody: `<urlset><url><loc>https://peec.ai/product/brand-perception</loc></url></urlset>`,
    pageHtml: `<nav><a href="./product/brand-perception">Product</a><a href="./pricing">Pricing</a></nav>`
  };

  it("off a shop, the pricing page in the menu beats a «/product/x» feature page", () => {
    expect(findDiscoveryCandidate({ ...peec, storefront: false })).toEqual({ url: "https://peec.ai/pricing", source: "home" });
  });

  it("names a pricing page by its menu text, or by a pricing word inside the path", () => {
    const telco = { ...base, pageHtml: `<a href="/movil/">Móvil</a><a href="/fibra-movil">Tarifas Fibra y Móvil</a>`, storefront: false };
    expect(findDiscoveryCandidate(telco)?.url).toBe("https://www.tienda.es/fibra-movil");
    const hr = { ...base, pageHtml: `<a href="/event/launch">Evento</a><a href="/plan-de-precios">Ver</a>`, storefront: false };
    expect(findDiscoveryCandidate(hr)?.url).toBe("https://www.tienda.es/plan-de-precios");
  });

  it("an event page goes after a service or an insurance page", () => {
    const html = `<a href="/eventos/black-friday">Black Friday</a><a href="/particulares/seguros-de-salud">Salud</a>`;
    expect(findDiscoveryCandidate({ ...base, pageHtml: html, storefront: false })?.url).toBe("https://www.tienda.es/particulares/seguros-de-salud");
  });

  it("a product card's link or, failing that, the link before a price wins over guesses", () => {
    const cards = `<a href="/ofertas">Ofertas</a><a class="product-item-link" href="/es_es/crema-hidratante-50ml">Crema</a>`;
    expect(findDiscoveryCandidate({ ...base, pageHtml: cards, storefront: true })?.url).toBe("https://www.tienda.es/es_es/crema-hidratante-50ml");
    const priced = `<a href="/faq">Ayuda</a><div><a href="/gafas/halo-black-HHLO26.html"><img></a><span>39,99 €</span></div>`;
    expect(findDiscoveryCandidate({ ...base, pageHtml: priced, storefront: false })?.url).toBe("https://www.tienda.es/gafas/halo-black-HHLO26.html");
    const faq = `<div><a href="/faq">Ayuda</a><span>39,99 €</span></div>`;
    expect(findDiscoveryCandidate({ ...base, pageHtml: faq, storefront: false })).toBeNull();
  });

  it("knows a shop window from a page that only mentions a price", () => {
    expect(looksLikeStorefront("<p>Desde 29 €</p>", null, false)).toBe(false);
    expect(looksLikeStorefront("<b>9,99 €</b><b>19,99 €</b><b>4,50 €</b><b>12,00 €</b>", null, false)).toBe(false);
    expect(looksLikeStorefront('<a class="product-card" href="/a">a</a><a class="product-card" href="/b">b</a><a data-product-id="3" href="/c">c</a>', null, false)).toBe(true);
    expect(looksLikeStorefront(null, "Magento", false)).toBe(true);
  });
});

describe("candidates that are never the page to judge (log §407)", () => {
  it("skips files and legal pages", () => {
    const pdf = `<a href="/pdfs/planes_extincion.pdf">Planes</a>`;
    expect(findDiscoveryCandidate({ ...base, pageHtml: pdf, storefront: false })).toBeNull();
    const legal = `<div><a href="/politica-de-cookies">Cookies</a><span>9,99 €</span></div>`;
    expect(findDiscoveryCandidate({ ...base, pageHtml: legal, storefront: false })).toBeNull();
  });
});
