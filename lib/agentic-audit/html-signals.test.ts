import { describe, expect, it } from "vitest";
import { classifyOffer, extractPageSignals, flattenNodes, isProductPage, parseJsonLd, visibleText } from "./html-signals";

const PRODUCT_LD = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "Cumbre Trail 3",
  gtin13: "8412345678905",
  sku: "CT3-42",
  aggregateRating: { "@type": "AggregateRating", ratingValue: 4.6, reviewCount: 31 },
  offers: {
    "@type": "Offer",
    price: "89.00",
    priceCurrency: "EUR",
    availability: "https://schema.org/InStock",
    shippingDetails: { "@type": "OfferShippingDetails" },
    hasMerchantReturnPolicy: { "@type": "MerchantReturnPolicy", merchantReturnDays: 30 }
  }
};

function page(body: string, head = "") {
  return `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
}

describe("parseJsonLd / flattenNodes", () => {
  it("reads every block, walks @graph and skips blocks that do not parse", () => {
    const html = page(
      `<script type="application/ld+json">{"@graph":[{"@type":"Organization","name":"X"},{"@type":"WebSite"}]}</script>` +
        `<script type="application/ld+json">{broken,}</script>`
    );
    const blocks = parseJsonLd(html);
    expect(blocks).toHaveLength(1);
    const types = flattenNodes(blocks).map((n) => n["@type"]);
    expect(types).toContain("Organization");
    expect(types).toContain("WebSite");
  });
});

describe("extractPageSignals", () => {
  it("reads a complete product page", () => {
    const html = page(
      `<script type="application/ld+json">${JSON.stringify(PRODUCT_LD)}</script>
       <form action="/cart/add"><button>Añadir al carrito</button></form>
       <div class="shopify-payment-button"></div>
       <a href="/pages/devoluciones">Devoluciones</a><a href="/aviso-legal">Aviso legal</a><a href="/contacto">Contacto</a>
       <p>${"Zapatilla de trail ligera. ".repeat(40)}</p>`,
      `<script src="https://cdn.shopify.com/s/files/theme.js"></script>`
    );
    const s = extractPageSignals(html);
    expect(s).toMatchObject({
      hasProductData: true,
      hasOffer: true,
      structuredPrice: true,
      availability: true,
      gtin: true,
      skuOrMpn: true,
      shippingData: true,
      returnPolicyData: true,
      reviewData: true,
      platform: "Shopify",
      addToCart: true,
      captcha: null
    });
    expect(s.quickPay).toContain("Shop Pay");
    expect(s.links).toEqual({ returns: true, shipping: false, legal: true, contact: true, cancellation: false });
    expect(isProductPage(s)).toBe(true);
  });

  it("does not count a price that is only text as structured", () => {
    const s = extractPageSignals(page(`<div itemscope itemtype="https://schema.org/Product"><span>89,00 €</span></div>`));
    expect(s.hasProductData).toBe(true);
    expect(s.structuredPrice).toBe(false);
    expect(s.textPrice).toBe(true);
  });

  it("finds the offer price in an AggregateOffer", () => {
    const ld = { "@type": "Product", offers: { "@type": "AggregateOffer", lowPrice: 20, priceCurrency: "EUR" } };
    const s = extractPageSignals(page(`<script type="application/ld+json">${JSON.stringify(ld)}</script>`));
    expect(s.structuredPrice).toBe(true);
  });

  it("detects captchas on the page", () => {
    const s = extractPageSignals(page(`<script src="https://www.google.com/recaptcha/api.js"></script>`));
    expect(s.captcha).toBe("reCAPTCHA");
  });

  it("a home page with add-to-cart buttons is not a product page", () => {
    const s = extractPageSignals(page(`<button class="add-to-cart">Añadir al carrito</button>`));
    expect(s.addToCart).toBe(true);
    expect(isProductPage(s)).toBe(false);
  });

  it("a JavaScript shell has almost no visible text", () => {
    const s = extractPageSignals(page(`<div id="root"></div><script>${"x".repeat(5000)}</script>`));
    expect(s.visibleTextChars).toBeLessThan(10);
  });

  it("og:type product marks a product page", () => {
    const s = extractPageSignals(page("", `<meta property="og:type" content="product">`));
    expect(isProductPage(s)).toBe(true);
  });
});

describe("visibleText", () => {
  it("drops scripts, styles and tags", () => {
    expect(visibleText("<style>.a{}</style><p>Hola <b>mundo</b></p><script>var x</script>")).toBe("Hola mundo");
  });
});

describe("classifyOffer (log §324)", () => {
  const ld = (node: object) => `<script type="application/ld+json">${JSON.stringify(node)}</script>`;
  const read = (body: string, url = "https://x.es/", head = "") => classifyOffer(extractPageSignals(page(body, head)), url);

  it("a physical product stays physical", () => {
    expect(read(ld(PRODUCT_LD), "https://x.es/p/1")).toEqual({ kind: "physical", pricingPage: false });
  });

  it("a home page that declares software with a price is a software page (the genscore.es case)", () => {
    const sw = { "@type": "SoftwareApplication", name: "GenScore", offers: { "@type": "Offer", price: "29", priceCurrency: "EUR" } };
    expect(read(ld(sw))).toEqual({ kind: "software", pricingPage: false });
    expect(extractPageSignals(page(ld(sw))).structuredPrice).toBe(true);
  });

  it("reads services, courses, events and bookings from their data", () => {
    expect(read(ld({ "@type": "Service", name: "Auditoría" }))?.kind).toBe("service");
    expect(read(ld({ "@type": "Course", name: "GEO" }))?.kind).toBe("course");
    expect(read(ld({ "@type": "MusicEvent", name: "Concierto" }))?.kind).toBe("event");
    expect(read(ld({ "@type": "Restaurant", acceptsReservations: true }))?.kind).toBe("booking");
  });

  it("a pricing page with monthly prices is a subscription pricing page", () => {
    expect(read("<p>Pro 99 € al mes</p>", "https://x.es/precios")).toEqual({ kind: "subscription", pricingPage: true });
  });

  it("reads the path, a booking widget, and the safety net of price plus button", () => {
    expect(read("<p>Hola</p>", "https://x.es/servicios/seo")?.kind).toBe("service");
    expect(read('<a href="https://calendly.com/x">Agenda</a>')?.kind).toBe("booking");
    expect(read("<p>Desde 450 €</p><a href='/c'>Pedir presupuesto</a>")?.kind).toBe("offer");
  });

  it("a page with nothing to sell is null, and so is a store's home with a product grid", () => {
    expect(read("<p>Quiénes somos</p><a href='/contacto'>Contacto</a>")).toBeNull();
    expect(
      read(
        "<p>Gorra 19,00 €</p><a href='/products/gorra'>Comprar</a>",
        "https://x.es/",
        '<script src="https://cdn.shopify.com/x.js"></script>'
      )
    ).toBeNull();
  });

  it("a blog link called «Entradas» is not a buy button", () => {
    expect(extractPageSignals(page("<a href='/blog'>Entradas</a>")).buyCta).toBe(false);
  });
});
