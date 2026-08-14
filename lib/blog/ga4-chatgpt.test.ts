import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BLOG_POSTS, getMetaDescription, getSeoTitle } from "./posts";

/**
 * SEO-POS-1 Fase C, S8 — invariantes de `/blog/como-medir-trafico-chatgpt-ga4`.
 *
 * Este artículo es el primero de la cola cuyo contenido **no depende de nada
 * nuestro**: todo lo que afirma es sobre GA4 y sobre un estudio de terceros.
 * Eso cambia qué hay que vigilar. En S6 el riesgo era publicar configuración
 * del producto; aquí son otros tres, y los tres son invisibles en revisión:
 *
 * 1. **La expresión regular publicada.** El artículo le pide al lector que la
 *    pegue en su propiedad de GA4. Una expresión que no compile, o que no case
 *    con los dominios que el propio artículo nombra dos párrafos más arriba, es
 *    un fallo que ningún compilador ve —es prosa dentro de un MDX— y que el
 *    lector descubre en su cuenta, no en la nuestra. Es la misma línea que
 *    `.claude/rules/growth-content.md` traza para las cifras del producto
 *    ("si llega a publicarse, se ata con un test"), aplicada a lo único
 *    ejecutable que publica esta pieza.
 * 2. **La atribución de las cifras de terceros.** Las tres del `StatGrid`
 *    vienen de un único estudio ajeno. La regla dura de honestidad prohíbe
 *    presentar cifra de mercado de terceros como dato propio, y la forma en
 *    que este proyecto la cumple es el `source` del `<Stat>`: sin él, la cifra
 *    se lee como nuestra.
 * 3. **Perplexity fuera de la metadata.** El artículo está en el allow-list de
 *    `article-honesty.test.ts` porque su cuerpo tiene un motivo legítimo para
 *    nombrarlo (GA4 lo deja en Referencia). Ese permiso cubre el cuerpo, no el
 *    `<title>` ni la descripción, donde sigue vigente la regla de que la
 *    metadata no nombra motores que el producto no ejecuta.
 */

const SLUG = "como-medir-trafico-chatgpt-ga4";

const ARTICLE = readFileSync(join(process.cwd(), "app", "blog", SLUG, "page.mdx"), "utf8");

const POST = BLOG_POSTS.find((p) => p.slug === SLUG);

/**
 * El MDX va con las líneas partidas a ~80 columnas, así que cualquier
 * aserción sobre una frase choca con un salto de línea que no significa nada.
 * Se colapsa el espacio antes de buscar prosa — si no, el test pasa a
 * depender de dónde cayó el ajuste de línea, y basta reflowear un párrafo
 * para ponerlo rojo sin que el artículo haya cambiado.
 */
const PROSE = ARTICLE.replace(/\s+/g, " ");

/**
 * La expresión regular tal y como se publica, extraída del `CodeBlock` — no
 * copiada aquí a mano. Copiarla haría que el test siguiera pasando con el
 * artículo publicando otra cosa, que es exactamente el fallo que persigue.
 */
function publishedSourceRegex(): string {
  const block = ARTICLE.match(/<CodeBlock[^>]*>\s*([\s\S]*?)\s*<\/CodeBlock>/);
  expect(block, "el artículo ya no publica ningún CodeBlock con la expresión de fuente").toBeTruthy();
  return (block?.[1] ?? "").trim();
}

/** Dominios de asistente que el artículo nombra en su prosa como fuentes a capturar. */
const MUST_MATCH = [
  "chatgpt.com",
  "chat.openai.com",
  "perplexity.ai",
  "claude.ai",
  "gemini.google.com",
  "copilot.microsoft.com"
];

describe("la expresión regular que el artículo le pide al lector que pegue en GA4", () => {
  it("compila", () => {
    expect(() => new RegExp(publishedSourceRegex())).not.toThrow();
  });

  it("casa con todos los asistentes que el propio artículo nombra", () => {
    const re = new RegExp(publishedSourceRegex());
    const missing = MUST_MATCH.filter((host) => !re.test(host));
    expect(
      missing,
      `la expresión publicada no captura ${missing.join(", ")}, aunque el artículo los nombra. ` +
        "Un lector la pegaría en su propiedad y perdería justo esas fuentes."
    ).toEqual([]);
  });

  it("no captura la búsqueda de Google, que el artículo dice explícitamente que va por otro canal", () => {
    const re = new RegExp(publishedSourceRegex());
    // Los AI Overviews llegan con referente `google` y el artículo insiste en
    // que se quedan en Búsqueda orgánica. Si la expresión los recogiera, el
    // grupo personalizado se comería el canal orgánico entero y el consejo
    // publicado sería activamente dañino.
    for (const host of ["google", "google.com", "bing.com"]) {
      expect(re.test(host), `la expresión captura ${host}`).toBe(false);
    }
  });

  it("escapa los puntos, para que no actúen como comodín", () => {
    const raw = publishedSourceRegex();
    const unescaped = [...raw.matchAll(/(^|[^\\])\./g)].map((m) => m[0]);
    expect(
      unescaped,
      "un punto sin escapar en GA4 casa con cualquier carácter: `claude.ai` marcaría también `claudexai`"
    ).toEqual([]);
  });
});

describe("las cifras de terceros van atribuidas", () => {
  it("todo <Stat> declara su fuente y ninguna se presenta como dato de Genscore", () => {
    const stats = [...ARTICLE.matchAll(/<Stat\s+([^>]*?)\/>/g)].map((m) => m[1]);
    expect(stats.length, "el artículo ya no publica cifras en StatGrid").toBeGreaterThan(0);
    for (const attrs of stats) {
      const source = attrs.match(/source="([^"]+)"/)?.[1] ?? "";
      expect(source, `un <Stat> sin fuente: ${attrs}`).not.toBe("");
      expect(
        source,
        `"${source}" atribuye a Genscore una cifra que no hemos medido nosotros`
      ).not.toMatch(/Genscore/i);
    }
  });

  it("dice de cuántas sesiones sale el estudio que cita", () => {
    // Una cifra de terceros sin su tamaño de muestra es la misma trampa que el
    // artículo hermano de métricas denuncia: un porcentaje sin denominador.
    expect(PROSE).toMatch(/41,2 (millones|M) de sesiones/);
  });

  it("declara la fecha en que se consultó todo lo referido a GA4", () => {
    expect(
      PROSE,
      "las interfaces y los canales de GA4 cambian: sin fecha de consulta, el artículo " +
        "envejece sin que se note"
    ).toMatch(/14 de agosto de 2026/);
  });
});

describe("los límites del artículo se mantienen", () => {
  it("no promete que GA4 mida menciones", () => {
    expect(PROSE).toMatch(/no puede decirte si saliste en la respuesta/i);
  });

  it("la metadata no nombra motores que el producto no ejecuta", () => {
    expect(POST, "el post no está en BLOG_POSTS").toBeTruthy();
    if (!POST) return;
    for (const field of [getSeoTitle(POST), getMetaDescription(POST), POST.description]) {
      expect(field, `la metadata nombra Perplexity: "${field}"`).not.toMatch(/Perplexity/i);
    }
  });

  it("el CTA nombra los tres motores que Genscore sí ejecuta", () => {
    const cta = PROSE.match(/<ArticleCta.*?\/>/)?.[0] ?? "";
    expect(cta).toMatch(/ChatGPT, Gemini y Claude/);
    expect(cta, "el CTA no puede insinuar cobertura que no tenemos").not.toMatch(/Perplexity/i);
  });
});
