import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BLOG_POSTS, getMetaDescription, getSeoTitle } from "./posts";

/**
 * SEO-POS-1 Fase C, S9 — invariantes de
 * `/blog/como-hacer-que-chatgpt-recomiende-tu-negocio`.
 *
 * El riesgo de esta pieza no es publicar configuración del producto (S6) ni
 * publicar algo ejecutable que se rompa por el camino (S8). Es **la promesa**:
 * la keyword que ataca —"cómo hacer que ChatGPT recomiende mi negocio"— la
 * ocupan hoy páginas que prometen resultados, y el borrador de un artículo así
 * se desliza solo hacia el mismo sitio. Basta con que una revisión futura
 * suavice un "no se puede garantizar" para convertir la pieza en lo que
 * PRICING-TRUTH-1 obligó a retirar del producto.
 *
 * Lo que vigila este fichero es, por tanto, lo que el artículo **se niega** a
 * decir, más la atribución de las cifras ajenas — que aquí son todas.
 */

const SLUG = "como-hacer-que-chatgpt-recomiende-tu-negocio";

const ARTICLE = readFileSync(join(process.cwd(), "app", "blog", SLUG, "page.mdx"), "utf8");

/** El MDX va partido a ~80 columnas: se colapsa el espacio antes de buscar prosa. */
const PROSE = ARTICLE.replace(/\s+/g, " ");

const POST = BLOG_POSTS.find((p) => p.slug === SLUG);

describe("el artículo no promete lo que nadie puede cumplir", () => {
  it("declara que OpenAI no ha publicado cómo elige los negocios locales", () => {
    expect(
      PROSE,
      "es el hecho que sostiene todo el techo del artículo: sin él, las cuatro palancas " +
        "se leen como una receta con resultado garantizado"
    ).toMatch(/no ha publicado cómo elige los negocios locales/i);
  });

  it("dice explícitamente que nadie puede garantizar una recomendación", () => {
    expect(PROSE).toMatch(/[Nn]adie puede garantizarte una recomendación/);
  });

  it("no promete posiciones, apariciones ni resultados", () => {
    // El vocabulario de las páginas que hoy ocupan esta keyword. Si aparece
    // aquí, el artículo ha cruzado la línea que lo diferencia de ellas.
    const promesas = [
      /garantiza(mos|do|r)? (que|tu|la) (aparición|aparecer|recomendación)/i,
      /aparecerás en ChatGPT/i,
      /te posicionamos en (ChatGPT|la IA)/i,
      /en \d+ (días|semanas) (aparecerás|estarás)/i
    ];
    const encontradas = promesas.flatMap((p) => PROSE.match(p) ?? []);
    expect(encontradas, `el artículo promete un resultado: ${encontradas.join(", ")}`).toEqual([]);
  });

  it("avisa de que no se puede comprar el sitio", () => {
    // Es el consejo con más valor económico directo de la pieza: hay quien
    // cobra por "aparecer en ChatGPT".
    expect(PROSE).toMatch(/no hay dónde comprar el sitio/i);
  });
});

describe("las cifras son todas de terceros y van atribuidas", () => {
  it("todo <Stat> declara su fuente y ninguna se presenta como dato de Genscore", () => {
    const stats = [...ARTICLE.matchAll(/<Stat\s+([^>]*?)\/>/g)].map((m) => m[1]);
    expect(stats.length, "el artículo ya no publica cifras en StatGrid").toBeGreaterThan(0);
    for (const attrs of stats) {
      const source = attrs.match(/source="([^"]+)"/)?.[1] ?? "";
      expect(source, `un <Stat> sin fuente: ${attrs}`).not.toBe("");
      expect(source, `"${source}" atribuye a Genscore una cifra ajena`).not.toMatch(/Genscore/i);
    }
  });

  it("declara la fecha de consulta y que ninguna cifra es medición propia", () => {
    expect(PROSE).toMatch(/15 de agosto de 2026/);
    expect(
      PROSE,
      "sin esta frase, tres cifras de terceros a media página se leen como nuestras"
    ).toMatch(/ninguna cifra es medición propia/i);
  });

  it("la figura no inventa el desglose que las fuentes no publican", () => {
    // Sólo se conoce el peso de los directorios en consultas subjetivas (46 %).
    // El borrador podía haber repartido el 54 % restante entre "web" y
    // "menciones" para que la tabla quedara simétrica: eso habría sido
    // fabricar el dato más visible de la pieza. Las celdas van con guion.
    const figura = ARTICLE.match(/<Figure[\s\S]*?<\/Figure>/)?.[0] ?? "";
    expect(figura, "el artículo ya no tiene la figura del reparto de fuentes").toContain("46 %");
    const filaWeb = figura.split("\n").find((l) => l.includes("Web del propio negocio")) ?? "";
    expect(
      filaWeb,
      "la columna de consultas subjetivas tiene que quedar vacía donde no hay dato publicado"
    ).toMatch(/\|\s*—\s*\|/);
  });
});

describe("los límites de la pieza se mantienen", () => {
  it("dice que la analítica ve una fracción y con retraso", () => {
    expect(PROSE).toMatch(/una fracción pequeña y con retraso/i);
  });

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
});
