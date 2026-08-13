import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ENGINE_META } from "@/lib/scan/engine-meta";
import { MIN_RESPONSES_FOR_BAND } from "@/lib/scoring/score-reliability";
import { DEFAULT_SCORE_WINDOW_SIZE } from "@/lib/scoring/score-window";

/**
 * SEO-POS-1 Fase C, S6 (log §71) — el artículo de métricas publica NÚMEROS DEL
 * PRODUCTO, no buenas prácticas genéricas: el suelo de respuestas antes de
 * publicar una franja, el tamaño de la ventana de la mediana, el peso del
 * único componente determinista, y qué motores pueden citar y cuáles no.
 *
 * Esa es justo la razón por la que la pieza vale algo — y también por la que
 * caduca sola. Si `MIN_RESPONSES_FOR_BAND` pasa a 15, o Claude gana grounding
 * real, el artículo pasa a afirmar algo falso sobre nuestra propia metodología
 * sin que nada falle: es prosa en un MDX, no hay compilador que la mire. Estos
 * tests atan el texto publicado a las constantes reales, así que el cambio de
 * código y el refresco del artículo ocurren en el mismo PR o no ocurre
 * ninguno de los dos.
 *
 * Mismo criterio que `alternativas-a-otterly.test.ts` y que el bloque de S5 en
 * `article-recipes.test.ts`: una regla de honestidad que no es un test no
 * existe.
 */

function readArticle(slug: string): string {
  return readFileSync(join(process.cwd(), "app", "blog", slug, "page.mdx"), "utf8");
}

const METRICAS = readArticle("metricas-geo-que-medir");
const PILAR = readArticle("que-es-el-geo-score");

/** Valores de los `<Stat value="…">` de un artículo, en orden. */
function statValues(source: string): string[] {
  return [...source.matchAll(/<Stat\s+value="([^"]+)"/g)].map((m) => m[1]);
}

describe("las cifras del artículo de métricas salen del código, no de la memoria", () => {
  it("el suelo de respuestas que publica es MIN_RESPONSES_FOR_BAND", () => {
    expect(statValues(METRICAS)).toContain(String(MIN_RESPONSES_FOR_BAND));

    // El cuerpo lo escribe en letra ("diez respuestas"), así que el número no
    // basta: si la constante deja de ser 10, esta comprobación falla y obliga
    // a releer la prosa, que es justo lo que se quiere.
    expect(
      MIN_RESPONSES_FOR_BAND,
      "el artículo dice «diez respuestas» en tres sitios en prosa. Si el umbral " +
        "cambia, reescríbelos en el mismo PR y actualiza este test."
    ).toBe(10);
    expect(METRICAS).toContain("menos de diez respuestas");
  });

  it("el tamaño de la ventana que publica es DEFAULT_SCORE_WINDOW_SIZE", () => {
    expect(statValues(METRICAS)).toContain(String(DEFAULT_SCORE_WINDOW_SIZE));
  });

  it("no promete una posición media al estilo de Google: la mide solo cuando apareces", () => {
    expect(METRICAS).toMatch(/solo sobre las respuestas donde apareces/i);
  });
});

/**
 * El párrafo que saca a Claude del denominador de citación es correcto sólo
 * mientras Claude corra sin búsqueda web. `ENGINE_META.grounded` es la copia
 * declarada de `GROUNDED_PROVIDERS` (lib/scoring/run-scoring.ts lo dice
 * explícitamente y pide actualizar las dos), así que sirve de ancla.
 */
describe("qué motores pueden citar, según el código", () => {
  it("Gemini y ChatGPT buscan; Claude no — que es lo que afirma el artículo", () => {
    expect(ENGINE_META.gemini.grounded).toBe(true);
    expect(ENGINE_META.openai.grounded).toBe(true);
    expect(
      ENGINE_META.claude.grounded,
      "si Claude gana grounding real, el artículo de métricas deja de ser cierto: " +
        "hay que reescribir la sección de tasa de citación en ese mismo PR"
    ).toBe(false);
  });
});

/**
 * Decisión del fundador, 2026-08-13 (log §75): *"no quiero exponer cosas tan
 * concretas del producto, como pesos reales para un cálculo"*. Los pesos del
 * compuesto y los códigos ADR salen de todo el contenido público.
 *
 * Esto **sustituye** al bloque anterior de este fichero, que exigía justo lo
 * contrario: que el pilar publicara los pesos vigentes leídos de
 * `run-scoring.ts`. Aquel test resolvía un problema real —el artículo llevaba
 * ocho días publicando la fórmula v2, retirada (log §74)— y la decisión nueva
 * lo resuelve mejor: lo que no se publica no se puede quedar rancio.
 *
 * Lo que sí se conserva es la garantía que hacía falta de verdad: el número
 * del gauge sigue siendo la media ponderada real de las filas que la maqueta
 * enseña (`article-recipes.test.ts`), porque los pesos siguen en el fuente del
 * MDX aunque `ProductMock` ya no los pinte.
 */
describe("el pilar del GEO Score no publica el reparto de pesos", () => {
  it("ninguna cifra de su rejilla es un porcentaje", () => {
    const porcentajes = statValues(PILAR).filter((v) => v.includes("%"));
    expect(
      porcentajes,
      `el pilar publica ${porcentajes.join(", ")} en su StatGrid. Un porcentaje ahí ` +
        "es el reparto de pesos, que es configuración interna del producto."
    ).toEqual([]);
  });

  it("los pesos siguen en el fuente para que el gauge sea verificable, pero no se renderizan", () => {
    expect(PILAR, "mockRows necesita sus pesos: es lo que hace comprobable el número del gauge").toMatch(
      /weight:\s*\d+/
    );
    const mock = readFileSync(join(process.cwd(), "components", "blog", "article", "figure.tsx"), "utf8");
    expect(
      mock,
      "ProductMock volvería a pintar «peso N%» y el reparto sería público otra vez"
    ).not.toMatch(/peso \{?row\.weight/);
  });
});
