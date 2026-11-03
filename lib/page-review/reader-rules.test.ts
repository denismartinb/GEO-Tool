import { describe, expect, it } from "vitest";
import { reviewPage } from "./review";
import type { AgenticFetchResult } from "@/lib/agentic-audit/fetch";

/**
 * AGENTS-READ-FIX-1 (log §464): the reader rules that the 33-page test across
 * sectors showed wrong, each with the shape of the page that showed it
 * (tariffs, insurance, a bookshop, a perfumery, telcos). Read on the server,
 * the same code as the extension.
 */

const NOW = Date.parse("2026-11-03T12:00:00Z");
const ROBOTS_OPEN = {
  status: 200,
  body: "User-agent: *\nAllow: /\n",
  type: "text/plain",
};

type File = { status: number; body: string; type?: string; finalUrl?: string };

function site(files: Record<string, File>) {
  const fetch = async (url: string): Promise<AgenticFetchResult> => {
    const u = new URL(url);
    const f = files[u.pathname] ?? { status: 404, body: "" };
    return {
      kind: "response",
      status: f.status,
      finalUrl: f.finalUrl ?? url,
      headers: { "content-type": f.type ?? "text/html" },
      body: f.body,
      ms: 1,
    };
  };
  return fetch;
}

function page(opts: {
  title: string;
  h1: string;
  ld?: unknown;
  body: string;
}): string {
  return `<!doctype html><html lang="es"><head><title>${opts.title}</title>
<meta name="description" content="Página de prueba con texto suficiente para que la descripción tenga una longitud razonable.">
${opts.ld ? `<script type="application/ld+json">${JSON.stringify(opts.ld)}</script>` : ""}
</head><body><header><nav><a href="/">Inicio</a><a href="/comprar">Comprar</a></nav></header>
<main><h1>${opts.h1}</h1>
<p>Este es el párrafo que explica lo que se vende en esta página, para quién es y qué lo diferencia del resto de opciones.</p>
${opts.body}</main><footer><a href="/aviso-legal">Aviso legal</a></footer></body></html>`;
}

async function review(
  path: string,
  html: string,
  extra: Record<string, File> = {},
) {
  const out = await reviewPage(`https://www.example.es${path}`, {
    fetch: site({
      [path]: { status: 200, body: html },
      "/robots.txt": ROBOTS_OPEN,
      ...extra,
    }),
    now: () => NOW,
  });
  if (out.kind !== "ok") throw new Error(`review failed: ${out.reason}`);
  return out.review;
}

const crit = (r: Awaited<ReturnType<typeof review>>, id: string) =>
  r.score.criteria.find((c) => c.id === id);

describe("price: amount with its unit, never a loose number", () => {
  it("an electricity tariff shows the energy price per kWh, not the power price", async () => {
    const r = await review(
      "/tarifas-luz/plan-estable",
      page({
        title: "Plan Estable · Luz",
        h1: "Plan Estable",
        ld: {
          "@type": "Product",
          name: "Plan Estable",
          offers: { "@type": "Offer", price: "0.1499", priceCurrency: "EUR" },
        },
        body: "<p>Término de potencia 0,12 €/kW día. Término de energía 0,1499 €/kWh.</p><button>Contratar</button>",
      }),
    );
    expect(r.score.service).toBe(true);
    expect(crit(r, "price")?.value).toBe("0,1499 €/kWh");
    expect(crit(r, "avail")).toBeUndefined();
    expect(crit(r, "returns")).toBeUndefined();
    expect(crit(r, "cancel")?.label).toBe("Permanencia o desistimiento");
  });

  it("a price with six decimals is read whole, never its tail as an amount", async () => {
    const r = await review(
      "/luz/tarifas/plan-online",
      page({
        title: "Plan Online · Luz",
        h1: "Plan Online",
        body: "<p>Potencia 0,078055 €/kW día. Energía 0,098902 €/kWh.</p><button>Contratar</button>",
      }),
    );
    expect(crit(r, "price")?.value).toBe("Sólo en el texto: 0,098902 €/kWh");
  });

  it("a reward or a saving is not the price", async () => {
    const r = await review(
      "/luz/tarifa-24h",
      page({
        title: "Tarifa 24h · Luz",
        h1: "Tarifa 24h",
        body: "<p>100 € en puntos. Ahorra hasta 120 € al año. Energía 0,148435 €/kWh.</p><button>Contratar</button>",
      }),
    );
    expect(crit(r, "price")?.value).toBe("Sólo en el texto: 0,148435 €/kWh");
  });

  it("decimals after an apostrophe in their own tag stay with the price (lowi.es)", async () => {
    const r = await review(
      "/tarifas/fibra",
      page({
        title: "Fibra y móvil",
        h1: "Fibra y móvil",
        body: '<p><span>30</span><sup>\'00</sup><sub>€/mes</sub></p><button>Contratar</button>',
      }),
    );
    expect(crit(r, "price")?.value).toBe("Sólo en el texto: 30,00 €/mes");
  });

  it("«desde» stays with the price, with its period", async () => {
    const r = await review(
      "/seguros/coche",
      page({
        title: "Seguro de coche",
        h1: "Seguro de coche",
        body: "<p>Tu seguro desde 160 €/año.</p><button>Contratar ahora</button>",
      }),
    );
    expect(r.score.service).toBe(true);
    expect(crit(r, "price")?.value).toBe("Sólo en el texto: desde 160 €/año");
  });

  it("a free plan beside paid ones is not «0 EUR», and several prices say so", async () => {
    const r = await review(
      "/precios",
      page({
        title: "Precios · Programa de gestión",
        h1: "Precios",
        ld: {
          "@type": "SoftwareApplication",
          name: "Programa de gestión",
          offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
        },
        body: "<p>Gratis 0 €/mes</p><p>Básico 7,50 €/mes</p><p>Estándar 15 €/mes</p><p>Avanzado 30 €/mes</p><button>Prueba gratis</button>",
      }),
    );
    expect(crit(r, "price")?.value).toBe("Varios precios, desde 7,50 €/mes");
  });

  it("an amount of 100.000 or more is not a price", async () => {
    const r = await review(
      "/tarifa-gas",
      page({
        title: "Tarifa de gas",
        h1: "Tarifa de gas",
        body: "<p>Más de 148000 € ahorrados por nuestros clientes. Desde 9,90 €/mes.</p><button>La quiero</button>",
      }),
    );
    expect(crit(r, "price")?.value).toBe("Sólo en el texto: desde 9,90 €/mes");
  });

  it("a data price that is not the one on the page is a problem, not a pass", async () => {
    const r = await review(
      "/cursos/ilustracion",
      page({
        title: "Curso de ilustración",
        h1: "Curso de ilustración",
        ld: {
          "@type": "Product",
          name: "Curso de ilustración",
          offers: {
            "@type": "Offer",
            price: "149.50",
            priceCurrency: "EUR",
            availability: "https://schema.org/InStock",
          },
        },
        body: "<p>Precio 129,50 €</p><button>Comprar</button>",
      }),
    );
    const price = crit(r, "price");
    expect(price?.v).toBe(0);
    expect(price?.value).toBe("Los datos dicen 149,50 €, la página 129,50 €");
    expect(r.score.fixes.find((f) => f.id === "price")?.t).toBe(
      "Que el precio de los datos sea el que se ve",
    );
  });
});

describe("stock and the buy button", () => {
  it("icon names leave the label, and «En stock» in the data against «No está disponible» on the page is flagged", async () => {
    const r = await review(
      "/perfume-x",
      page({
        title: "Perfume X",
        h1: "Perfume X",
        ld: {
          "@type": "Product",
          name: "Perfume X",
          offers: {
            "@type": "Offer",
            price: "45.90",
            priceCurrency: "EUR",
            availability: "https://schema.org/InStock",
          },
        },
        body: '<p>45,90 €</p><p>No está disponible</p><button><span class="icon">tote-simple</span> Añadir al carrito</button>',
      }),
    );
    expect(crit(r, "buy")?.value).toBe("«Añadir al carrito»");
    expect(crit(r, "avail")?.v).toBe(0);
    expect(crit(r, "avail")?.value).toBe(
      "Los datos dicen «En stock», la página «No disponible»",
    );
    expect(
      r.score.fixes.some(
        (f) => f.id === "avail" && /stock de los datos/.test(f.t),
      ),
    ).toBe(true);
  });

  it("a FAQ question, a dialog, a recommender and the menu are never the buy button", async () => {
    const r = await review(
      "/tarifas-fibra-movil",
      page({
        title: "Fibra y móvil",
        h1: "Fibra y móvil",
        body: `<p>35 €/mes</p>
          <details><summary><a href="#q1">¿Puedo contratar Fibra y Móvil por separado?</a></summary><p>Sí.</p></details>
          <div class="faq-item"><button>Contratar online</button></div>
          <div class="modal"><button>SI, VOLVER A EMPEZAR</button></div>
          <div role="dialog"><button>Contratar</button></div>
          <button>Empezar recomendador</button>`,
      }),
    );
    expect(crit(r, "buy")?.value).toBe("No");
  });

  it("«LA QUIERO» and «Contrátala» are buy buttons", async () => {
    const r1 = await review(
      "/tarifas/movil",
      page({
        title: "Tarifa móvil",
        h1: "Tarifa 20 GB",
        body: "<p>10 €/mes</p><button>LA QUIERO</button>",
      }),
    );
    expect(crit(r1, "buy")?.v).toBe(1);
    const r2 = await review(
      "/tarifas/fibra",
      page({
        title: "Tarifa fibra",
        h1: "Fibra 1 Gb",
        body: "<p>30 €/mes</p><a href='/alta'>Contrátala</a>",
      }),
    );
    expect(crit(r2, "buy")?.value).toBe("«Contrátala»");
  });

  it("«Calcula tu seguro» asks for contact: half a button, with its card", async () => {
    const r = await review(
      "/seguros/hogar",
      page({
        title: "Seguro de hogar",
        h1: "Seguro de hogar",
        body: "<p>Desde 90 €/año</p><button>Calcula tu seguro</button>",
      }),
    );
    const buy = crit(r, "buy");
    expect(buy?.v).toBe(0.5);
    expect(buy?.value).toBe("Sólo pide contacto: «Calcula tu seguro»");
    expect(r.score.fixes.find((f) => f.id === "buy")?.t).toBe(
      "Añade un botón para contratar ya",
    );
  });

  it("the h1 names the product when the data name is a slogan", async () => {
    const r = await review(
      "/tarifas/tarifa-noche",
      page({
        title: "Tarifa Noche",
        h1: "Tarifa Noche",
        ld: {
          "@type": "Product",
          name: "Descubre nuestra tarifa de luz más barata",
          offers: { "@type": "Offer", price: "0.09", priceCurrency: "EUR" },
        },
        body: "<p>0,09 €/kWh</p><button>Contratar</button>",
      }),
    );
    expect(crit(r, "prod")?.value).toBe("Tarifa Noche");
  });

  it("a Book with its offer is a product", async () => {
    const r = await review(
      "/libro/novela-x/9788400000000",
      page({
        title: "Novela X",
        h1: "Novela X",
        ld: {
          "@type": "Book",
          name: "Novela X",
          offers: {
            "@type": "Offer",
            price: "22.70",
            priceCurrency: "EUR",
            availability: "https://schema.org/PreOrder",
          },
        },
        body: "<p>22,70 €</p><button>Reservar ahora</button>",
      }),
    );
    expect(r.score.commerce).toBe(true);
    expect(r.score.service).toBe(false);
    expect(crit(r, "price")?.value).toBe("22,70 €");
    expect(crit(r, "buy")?.value).toBe("«Reservar ahora»");
  });
});

describe("home pages and listings are not product pages", () => {
  const home = page({
    title: "Librería online",
    h1: "Librería online",
    body: Array.from(
      { length: 6 },
      (_, i) =>
        `<div class="product-card"><a href="/libro/${i}">Libro ${i}</a><span>1${i},90 €</span><button>Añadir</button></div>`,
    ).join(""),
  });

  it("never proposes Product data on the home page, and says why Agentes is not measured there", async () => {
    const r = await review("/", home);
    expect(r.score.commerce).toBe(false);
    expect(r.score.lanes.agent).toBeNull();
    const ld = r.score.fixes.find((f) => f.id === "ld");
    expect(ld?.snippet ?? "").toContain('"@type": "Organization"');
    expect(ld?.snippet ?? "").not.toContain('"@type": "Product"');
    expect(r.score.agentWhy).toMatch(/portada/);
    expect(crit(r, "fresh")?.value).toBe("No aplica en una portada");
  });

  it("takes Agentes from a product page found from the home page, and names it with its checks", async () => {
    const product = page({
      title: "Libro 0",
      h1: "Libro 0",
      ld: {
        "@type": "Book",
        name: "Libro 0",
        offers: {
          "@type": "Offer",
          price: "10.90",
          priceCurrency: "EUR",
          availability: "https://schema.org/InStock",
        },
      },
      body: "<p>10,90 €</p><button>Añadir al carrito</button>",
    });
    const r = await review("/", home, {
      "/libro/0": { status: 200, body: product },
    });
    expect(r.score.shop?.state).toBe("found");
    if (r.score.shop?.state !== "found") return;
    expect(r.score.shop.path).toBe("/libro/0");
    expect(r.score.shop.criteria.find((c) => c.id === "price")?.value).toBe(
      "10,90 €",
    );
    expect(r.score.agentWhy).toBeNull();
  });

  it("without JavaScript and without a price or button, Agentes says so", async () => {
    const r = await review(
      "/maquina-cafe",
      page({
        title: "Máquina de café",
        h1: "Máquina de café",
        body: "<div id='app'></div>",
      }),
    );
    expect(r.score.lanes.agent).toBeNull();
    expect(r.score.agentWhy).toMatch(/Sin JavaScript/);
  });
});

describe("robots.txt and reading failures", () => {
  it("says which «*» line to take out, once, naming every engine it blocks", async () => {
    const out = await reviewPage("https://www.example.es/content/tarifa", {
      fetch: site({
        "/content/tarifa": {
          status: 200,
          body: page({ title: "Tarifa", h1: "Tarifa", body: "<p>Hola</p>" }),
        },
        "/robots.txt": {
          status: 200,
          body: "User-agent: *\nDisallow: /content/*\nDisallow: /privado\n",
          type: "text/plain",
        },
      }),
      now: () => NOW,
    });
    if (out.kind !== "ok") throw new Error("failed");
    const robotsCards = out.review.score.fixes.filter(
      (f) => f.id === "index" || f.id.startsWith("bot-"),
    );
    expect(
      robotsCards.every(
        (f) =>
          /Quita/.test(f.t) &&
          f.t.includes("Disallow: /content/*") &&
          !f.snippet,
      ),
    ).toBe(true);
    const bots = robotsCards.filter((f) => f.id.startsWith("bot-"));
    expect(bots).toHaveLength(1);
    expect(bots[0].why).toMatch(/ChatGPT, Claude y Perplexity/);
  });

  it("tells a block, a slow page and a missing page apart, and a redirect", async () => {
    const blocked = await reviewPage("https://www.example.es/x", {
      fetch: site({
        "/x": {
          status: 200,
          body: "<html><title>Just a moment...</title></html>",
        },
      }),
    });
    expect(blocked).toEqual({ kind: "failed", reason: "blocked" });
    const missing = await reviewPage("https://www.example.es/x", {
      fetch: site({}),
    });
    expect(missing).toEqual({ kind: "failed", reason: "not_found" });
    const slow = await reviewPage("https://www.example.es/x", {
      fetch: async () => ({ kind: "error", reason: "timeout" }),
    });
    expect(slow).toEqual({ kind: "failed", reason: "timeout" });

    const moved = await review(
      "/oferta",
      page({ title: "Catálogo", h1: "Catálogo", body: "<p>Hola</p>" }),
      {},
    );
    expect(moved.redirectedFrom).toBeUndefined();
    const out = await reviewPage("https://www.example.es/oferta", {
      fetch: site({
        "/oferta": {
          status: 200,
          body: page({
            title: "Catálogo",
            h1: "Catálogo",
            body: "<p>Hola</p>",
          }),
          finalUrl: "https://www.example.es/catalogo",
        },
        "/robots.txt": ROBOTS_OPEN,
      }),
      now: () => NOW,
    });
    expect(out.kind === "ok" && out.review.redirectedFrom).toBe(
      "https://www.example.es/oferta",
    );
  });
});
