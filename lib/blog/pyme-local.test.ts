import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BLOG_POSTS, getMetaDescription, getSeoTitle } from "./posts";

/**
 * SEO-POS-1 Fase C, S9 — invariantes de
 * `/blog/como-hacer-que-chatgpt-recomiende-tu-negocio`.
 *
 * **Por qué este artículo necesita un guardián propio, y de una forma que
 * ningún otro del blog necesita.** Su keyword —"cómo hacer que ChatGPT
 * recomiende mi negocio"— la ocupan hoy páginas que **garantizan resultados**,
 * y un texto que enumera cuatro palancas de mejora se desliza solo hacia ese
 * registro: basta con que un refresco futuro suavice o borre el techo para que
 * la pieza pase a prometer sin que nadie lo haya decidido. Es el mismo reclamo
 * que `PRICING-TRUTH-1` obligó a retirar del producto, sólo que en contenido.
 *
 * Por eso lo que vigila este fichero es, sobre todo, **lo que el artículo se
 * niega a decir**. Es el primer test de contenido del repositorio que persigue
 * una ausencia en vez de una presencia: los demás comprueban que algo esté;
 * éste comprueba que el límite siga estando y que la promesa siga sin estar.
 *
 * El techo se añadió después de publicar (log §91): la primera versión era
 * honesta —no inventaba cifras y decía "nada de esto se compra ni se fuerza"—
 * pero no declaraba que nadie de fuera sabe cómo elige el motor, ni que no hay
 * dónde comprar el sitio. Un límite implícito no sobrevive a una reescritura.
 */

const SLUG = "como-hacer-que-chatgpt-recomiende-tu-negocio";

const ARTICLE = readFileSync(join(process.cwd(), "app", "blog", SLUG, "page.mdx"), "utf8");

/** El MDX va partido a ~80 columnas: se colapsa el espacio antes de buscar prosa. */
const PROSE = ARTICLE.replace(/\s+/g, " ");

const POST = BLOG_POSTS.find((p) => p.slug === SLUG);

describe("el techo del artículo sigue en pie", () => {
  it("declara que OpenAI no ha publicado cómo elige los negocios locales", () => {
    expect(
      PROSE,
      "es el hecho que sostiene el techo: sin él, las cuatro palancas se leen como " +
        "una receta con resultado garantizado"
    ).toMatch(/no ha publicado\*\* cómo elige|no ha publicado cómo elige/i);
  });

  it("dice que nadie puede garantizar una recomendación", () => {
    expect(PROSE).toMatch(/[Nn]adie puede garantizarte una recomendación/);
  });

  it("avisa de que no se puede comprar el sitio", () => {
    // Es el consejo con más valor económico directo de la pieza: hay quien
    // cobra por "aparecer en ChatGPT", y el lector de esta keyword es
    // exactamente a quien se lo intentan vender.
    expect(PROSE).toMatch(/no hay dónde comprar ese sitio/i);
  });

  it("distingue mover la probabilidad de garantizar el resultado", () => {
    expect(PROSE).toMatch(/mueve la probabilidad, no el resultado/i);
  });

  it("no da por medible una sola consulta", () => {
    expect(PROSE).toMatch(/te contesta distinto en dos intentos seguidos/i);
  });
});

describe("el artículo no adopta el vocabulario de las páginas que prometen", () => {
  it("no promete apariciones, posiciones ni plazos", () => {
    const promesas = [
      /garantiza(mos|do|r)? (que|tu|la) (aparición|aparecer|recomendación)/i,
      /aparecerás en ChatGPT/i,
      /te posicionamos en (ChatGPT|la IA)/i,
      /en \d+ (días|semanas) (aparecerás|estarás|verás resultados)/i,
      /asegura(mos)? (tu|la) (aparición|recomendación)/i
    ];
    const encontradas = promesas.flatMap((p) => PROSE.match(p) ?? []);
    expect(encontradas, `el artículo promete un resultado: ${encontradas.join(", ")}`).toEqual([]);
  });

  it("sigue desaconsejando comprar reseñas y listados", () => {
    expect(PROSE).toMatch(/No compres reseñas ni listados/i);
  });
});

describe("los límites de producto se mantienen", () => {
  it("el CTA nombra los tres motores que Genscore sí ejecuta", () => {
    const cta = PROSE.match(/<ArticleCta.*?\/>/)?.[0] ?? "";
    expect(cta).toMatch(/ChatGPT, Gemini y Claude/);
  });

  it("la metadata no nombra motores que el producto no ejecuta", () => {
    expect(POST, "el post no está en BLOG_POSTS").toBeTruthy();
    if (!POST) return;
    for (const field of [getSeoTitle(POST), getMetaDescription(POST), POST.description]) {
      expect(field, `la metadata nombra un motor que no ejecutamos: "${field}"`).not.toMatch(
        /Perplexity|Copilot|DeepSeek|Grok/i
      );
    }
  });

  it("la figura declara que su respuesta es ilustrativa, no capturada", () => {
    // ADR 0028: ningún visual finge ser una captura real. El ejemplo nombra
    // clínicas inventadas, y el pie tiene que decirlo.
    const figura = ARTICLE.match(/<Figure[\s\S]*?<\/Figure>/)?.[0] ?? "";
    expect(figura).toMatch(/ilustrativo|no una respuesta real capturada/i);
  });
});
