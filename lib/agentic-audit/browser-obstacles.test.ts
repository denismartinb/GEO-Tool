import { describe, expect, it } from "vitest";
import { BROWSER_READ_RULES, browserReadIsFresh, isAgenticBrowserRead, readBrowserObstacles } from "./browser-obstacles";

const AT = "2026-11-03T09:00:00.000Z";
const filler = "<p>" + "Chaqueta impermeable ligera con capucha ajustable y bolsillos con cremallera. ".repeat(6) + "</p>";

function page(body: string, head = ""): string {
  return `<html><head>${head}</head><body><header><a href="/carrito">Carrito</a></header><main><h1>Chaqueta Brisa</h1>${filler}${body}</main><footer>Pie</footer></body></html>`;
}

describe("readBrowserObstacles", () => {
  it("reads a clean product page", () => {
    const r = readBrowserObstacles(page(`<p class="price">149,00 €</p><button class="single_add_to_cart_button">Añadir a la cesta</button>`), AT);
    expect(r).toEqual({
      state: "ok",
      measuredAt: AT,
      cookies: false,
      cookieCover: false,
      price: { state: "exact", text: "149,00 €" },
      options: "none",
      buy: { state: "named", text: "Añadir a la cesta" },
      name: "Chaqueta Brisa",
      stock: null,
      productData: false,
      rules: BROWSER_READ_RULES
    });
  });

  it("reads the product name, stock and data a script added", () => {
    const ld = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Cafetera Duo","offers":{"@type":"Offer","price":"149","priceCurrency":"EUR","availability":"https://schema.org/InStock"}}</script>`;
    expect(readBrowserObstacles(page(`<p>149 €</p>`, ld), AT)).toMatchObject({ name: "Chaqueta Brisa", stock: "En stock", productData: true });
    expect(readBrowserObstacles(page(`<p>149 €</p><p>Agotado</p>`), AT)).toMatchObject({ stock: "Agotado" });
    expect(readBrowserObstacles(page(`<p>149 €</p><p>No disponible</p>`), AT)).toMatchObject({ stock: "Agotado" });
  });

  it("sees a consent tool's banner and ignores it once it is hidden inline", () => {
    const shown = page(`<p>149 €</p>`) + `<div id="onetrust-banner-sdk"><p>Usamos cookies</p><button>Aceptar</button></div>`;
    expect(readBrowserObstacles(shown, AT)).toMatchObject({ cookies: true });
    const hidden = page(`<p>149 €</p>`) + `<div id="onetrust-banner-sdk" style="display: none"><button>Aceptar</button></div>`;
    expect(readBrowserObstacles(hidden, AT)).toMatchObject({ cookies: false });
  });

  it("reads what else is sold with its offer as product data, like the review without JavaScript (log §458)", () => {
    const ld = `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "SoftwareApplication", name: "Starter", offers: { "@type": "Offer", price: "29", priceCurrency: "EUR" } })}</script>`;
    expect(readBrowserObstacles(page(`<p>29 €</p>`) + ld, AT)).toMatchObject({ productData: true });
  });

  it("tells a banner that covers the page from a strip (log §457)", () => {
    const strip = page(`<p>149 €</p>`) + `<div id="onetrust-banner-sdk" class="otFlat"><p>Usamos cookies</p><button>Aceptar</button></div>`;
    expect(readBrowserObstacles(strip, AT)).toMatchObject({ cookies: true, cookieCover: false });
    const centered = page(`<p>149 €</p>`) + `<div id="onetrust-banner-sdk" class="otCenterRounded"><p>Usamos cookies</p><button>Aceptar</button></div>`;
    expect(readBrowserObstacles(centered, AT)).toMatchObject({ cookies: true, cookieCover: true });
    const modal = page(`<p>149 €</p>`) + `<div class="cookie-box" role="dialog" aria-modal="true"><p>Usamos cookies</p><button>Aceptar</button></div>`;
    expect(readBrowserObstacles(modal, AT)).toMatchObject({ cookieCover: true });
    const backdrop = page(`<p>149 €</p>`) + `<div class="cookie-overlay"></div><div class="cookie-bar"><button>Aceptar</button></div>`;
    expect(readBrowserObstacles(backdrop, AT)).toMatchObject({ cookieCover: true });
    const popup = page(`<p>149 €</p>`) + `<div id="didomi-popup"><button>Aceptar</button></div>`;
    expect(readBrowserObstacles(popup, AT)).toMatchObject({ cookieCover: true });
  });

  it("sees a hand-made cookie box only with an accept button", () => {
    const withButton = page(`<p>149 €</p><div class="cookie-bar"><span>Cookies</span><a href="#">Acepto</a></div>`);
    expect(readBrowserObstacles(withButton, AT)).toMatchObject({ cookies: true });
    const policyLink = page(`<p>149 €</p><div class="cookie-policy-link"><a href="/cookies">Política de cookies</a></div>`);
    expect(readBrowserObstacles(policyLink, AT)).toMatchObject({ cookies: false });
  });

  it("tells a «desde» price from an exact one, and a page with no price", () => {
    expect(readBrowserObstacles(page(`<p>Desde 129,00 €</p>`), AT)).toMatchObject({ price: { state: "from", text: "Desde 129,00 €" } });
    expect(readBrowserObstacles(page(`<p>Sin precio publicado</p>`), AT)).toMatchObject({ price: { state: "missing", text: null } });
  });

  it("does not take the cookie banner's text for the price", () => {
    const html = page(`<p>Pide información</p>`) + `<div id="CybotCookiebotDialog"><p>Desde 0 €</p></div>`;
    expect(readBrowserObstacles(html, AT)).toMatchObject({ price: { state: "missing" } });
  });

  it("reads product options and whether they say what they choose", () => {
    const labeled = page(`<form class="variations_form cart"><label for="talla">Talla</label><select id="talla" name="attribute_talla"><option>M</option></select></form>`);
    expect(readBrowserObstacles(labeled, AT)).toMatchObject({ options: "labeled" });
    const bare = page(`<form class="variations_form cart"><select name="attribute_talla"><option>Elige</option></select></form>`);
    expect(readBrowserObstacles(bare, AT)).toMatchObject({ options: "unlabeled" });
    const unrelated = page(`<select name="idioma"><option>ES</option></select>`);
    expect(readBrowserObstacles(unrelated, AT)).toMatchObject({ options: "none" });
  });

  it("tells an icon-only buy button from no button at all", () => {
    expect(readBrowserObstacles(page(`<button class="add-to-cart"><svg></svg></button>`), AT)).toMatchObject({ buy: { state: "unnamed" } });
    expect(readBrowserObstacles(page(`<a href="/contacto">Contacto</a>`), AT)).toMatchObject({ buy: { state: "missing" } });
    expect(readBrowserObstacles(page(`<button aria-label="Añadir al carrito"><svg></svg></button>`), AT)).toMatchObject({ buy: { state: "named" } });
  });

  it("counts a button that only says «Añadir» and not «Añadir a mi lista» (log §456)", () => {
    expect(readBrowserObstacles(page(`<button>Añadir a mi lista</button><button>Añadir</button>`), AT)).toMatchObject({ buy: { state: "named", text: "Añadir" } });
    expect(readBrowserObstacles(page(`<button>Añadir a mi lista</button>`), AT)).toMatchObject({ buy: { state: "missing" } });
  });

  it("never takes the header's cart link for a buy button", () => {
    expect(readBrowserObstacles(page(""), AT)).toMatchObject({ buy: { state: "missing" } });
  });

  it("calls a challenge blocked and an empty render unmeasured", () => {
    expect(readBrowserObstacles("<html><head><title>Just a moment...</title></head><body>cf-chl-</body></html>", AT)).toEqual({ state: "blocked", measuredAt: AT, rules: BROWSER_READ_RULES });
    expect(readBrowserObstacles("<html><body><main>Hola</main></body></html>", AT)).toEqual({ state: "unmeasured", measuredAt: AT, rules: BROWSER_READ_RULES });
  });
});

describe("isAgenticBrowserRead / browserReadIsFresh", () => {
  it("checks the stored shape", () => {
    expect(isAgenticBrowserRead(readBrowserObstacles(page(`<p>9 €</p>`), AT))).toBe(true);
    expect(isAgenticBrowserRead({ state: "ok", measuredAt: AT, rules: BROWSER_READ_RULES })).toBe(false);
    expect(isAgenticBrowserRead(null)).toBe(false);
  });

  it("keeps a read a week and retries a failed one after a day", () => {
    const t = Date.parse(AT);
    expect(browserReadIsFresh({ state: "blocked", measuredAt: AT, rules: BROWSER_READ_RULES }, t + 6 * 86_400_000)).toBe(true);
    expect(browserReadIsFresh({ state: "blocked", measuredAt: AT, rules: BROWSER_READ_RULES }, t + 8 * 86_400_000)).toBe(false);
    expect(browserReadIsFresh({ state: "unmeasured", measuredAt: AT, rules: BROWSER_READ_RULES }, t + 25 * 3_600_000)).toBe(false);
    expect(browserReadIsFresh(undefined, t)).toBe(false);
  });
});

describe("readBrowserObstacles: what the 33-page test found (log §464)", () => {
  const product = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Perfume","offers":{"@type":"Offer","price":"49","priceCurrency":"EUR","availability":"https://schema.org/InStock"}}</script>`;

  it("reads the Spanish Cloudflare page as a block, not as a page without price", () => {
    const html = `<html><head><title>Un momento…</title></head><body><main><h1>www.tienda.es</h1><p>Verificación de seguridad en curso</p></main></body></html>`;
    expect(readBrowserObstacles(html, AT).state).toBe("blocked");
  });

  it("reads an error page as unmeasured, never as the product", () => {
    const html = page("<p>49 €</p>", "<title>Página no encontrada | Tienda</title>");
    expect(readBrowserObstacles(html, AT)).toEqual({ state: "unmeasured", measuredAt: AT, reason: "not_found", rules: BROWSER_READ_RULES });
  });

  it("never takes a FAQ question, a dialog or a recommender for the buy button", () => {
    const faq = page(`<p>30 € al mes</p><div class="faq"><button>¿Puedo contratar Fibra y Móvil?</button></div>`);
    expect(readBrowserObstacles(faq, AT)).toMatchObject({ buy: { state: "missing" } });
    const modal = page(`<p>30 € al mes</p><div role="dialog"><button>SI, VOLVER A EMPEZAR</button></div>`);
    expect(readBrowserObstacles(modal, AT)).toMatchObject({ buy: { state: "missing" } });
    const quiz = page(`<p>30 € al mes</p><a href="/r">Empezar recomendador</a>`);
    expect(readBrowserObstacles(quiz, AT)).toMatchObject({ buy: { state: "missing" } });
  });

  it("accepts «La quiero», strips icon names and tells a lead from a buy button", () => {
    expect(readBrowserObstacles(page(`<p>30 € al mes</p><button>LA QUIERO</button>`), AT)).toMatchObject({ buy: { state: "named", text: "LA QUIERO" } });
    expect(readBrowserObstacles(page(`<p>49 €</p><button>tote-simple Añadir al carrito</button>`), AT)).toMatchObject({
      buy: { state: "named", text: "Añadir al carrito" }
    });
    expect(readBrowserObstacles(page(`<p>Desde 160 €/año</p><a href="/c">Calcula tu seguro</a>`), AT)).toMatchObject({
      buy: { state: "lead", text: "Calcula tu seguro" }
    });
  });

  it("prefers the button in the product's own block", () => {
    const html = page(`<a href="/x">Comprar ahora otros</a><form class="product-form"><p>49 €</p><button>Añadir al carrito</button></form>`);
    expect(readBrowserObstacles(html, AT)).toMatchObject({ buy: { text: "Añadir al carrito" } });
  });

  it("gives a tariff no stock and its energy price", () => {
    const html = page(`<p>Potencia 0,12 €/kW día</p><p>Energía 0,1499 €/kWh</p><p>Contratación disponible online</p><button>Contratar</button>`);
    const r = readBrowserObstacles(html, AT);
    expect(r).toMatchObject({ tariff: true, stock: null, price: { state: "exact", text: "0,1499 €/kWh" } });
  });

  it("flags data that says «en stock» on a page that says it is not available (Druni)", () => {
    const r = readBrowserObstacles(page(`<p>49 €</p><p>No está disponible</p>`, product), AT);
    expect(r).toMatchObject({ stock: "Agotado", conflicts: ["stock"] });
  });

  it("flags a declared price the page does not show", () => {
    const r = readBrowserObstacles(page(`<p>59 €</p><button>Comprar</button>`, product), AT);
    expect(r).toMatchObject({ conflicts: ["price"] });
  });

  it("does not judge price or button on a home page or a listing", () => {
    const home = page(`<p>19 €</p><button>Añadir</button><p>29 €</p><button>Añadir</button>`);
    expect(readBrowserObstacles(home, AT, "https://tienda.es/")).toMatchObject({ listing: true, price: { state: "missing" }, buy: { state: "missing" } });
    const grid = page(`<p>19 €</p><button>Añadir al carrito</button><p>29 €</p><button>Añadir al carrito</button><p>39 €</p><button>Añadir al carrito</button>`);
    expect(readBrowserObstacles(grid, AT, "https://tienda.es/libros")).toMatchObject({ listing: true });
  });
});

describe("readBrowserObstacles: what the second test pass found (log §464)", () => {
  it("reads a 404 from its short text when the title and h1 do not say it (factorial.es)", () => {
    const html = `<html><head><title>Software de RRHH todo en uno</title></head><body><p>Iniciar sesión</p><p>Lo sentimos, pero no podemos encontrar lo que estás buscando. El enlace a esta página puede ser incorrecto, estar desactualizado o la página se ha movido a otro lugar. Busquemos un lugar mejor para ti.</p><a href="/">Volver al inicio</a></body></html>`;
    expect(readBrowserObstacles(html, AT)).toEqual({ state: "unmeasured", measuredAt: AT, reason: "not_found", rules: BROWSER_READ_RULES });
  });

  it("calls an «Access Denied» page blocked", () => {
    const html = `<html><head><title>Access Denied</title></head><body><h1>Access Denied</h1><p>${"x ".repeat(150)}</p></body></html>`;
    expect(readBrowserObstacles(html, AT)).toMatchObject({ state: "blocked" });
  });

  it("does not take a question that links to a guide for the buy button (holaluz.com)", () => {
    const r = readBrowserObstacles(page(`<p>Cuota de 45 €/mes</p><a href="/luz/calcular-potencia-electrica/">qué potencia de luz contratar</a>`), AT);
    expect(r).toMatchObject({ buy: { state: "missing" } });
  });
});

describe("browserReadIsFresh and error pages (log §464)", () => {
  it("waits a week, not a day, before opening an error page again", () => {
    const twoDays = Date.parse(AT) + 2 * 24 * 60 * 60 * 1000;
    expect(browserReadIsFresh({ state: "unmeasured", measuredAt: AT, reason: "not_found", rules: BROWSER_READ_RULES }, twoDays)).toBe(true);
    expect(browserReadIsFresh({ state: "unmeasured", measuredAt: AT, rules: BROWSER_READ_RULES }, twoDays)).toBe(false);
  });
});

describe("reads made with older rules (log §464 adenda)", () => {
  it("renders the page again once, whatever its age, and then keeps the week", () => {
    const t = Date.parse(AT);
    const old = { state: "ok", measuredAt: AT, cookies: false, price: { state: "exact", text: "6,99 €" }, options: "none", buy: { state: "missing", text: null } } as const;
    expect(browserReadIsFresh(old, t + 60_000)).toBe(false);
    expect(browserReadIsFresh({ ...old, rules: BROWSER_READ_RULES - 1 }, t + 60_000)).toBe(false);
    expect(browserReadIsFresh({ ...old, rules: BROWSER_READ_RULES }, t + 60_000)).toBe(true);
  });
});
