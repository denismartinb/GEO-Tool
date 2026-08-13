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
 * GEO-SCORE-V4 (ADR 0033) añadió el componente técnico el 2026-08-05 y
 * reescaló los otros cuatro. `/docs/metodologia/geo-score` se actualizó; el
 * artículo pilar del blog no, y siguió publicando los pesos de v2
 * (.40/.25/.20/.15) durante ocho días — el sitio contradiciéndose a sí mismo
 * sobre su propia metodología. Refrescado en este mismo PR (log §72); esto
 * impide que vuelva a quedarse atrás en silencio.
 */
describe("el pilar del GEO Score publica los pesos vigentes", () => {
  const RUN_SCORING = readFileSync(join(process.cwd(), "lib", "scoring", "run-scoring.ts"), "utf8");
  const technicalWeight = Number(RUN_SCORING.match(/const TECHNICAL_WEIGHT = ([\d.]+);/)?.[1]);
  const pesos = statValues(PILAR).map((v) => Number(v.replace("%", "")));

  it("lee el peso técnico real del código", () => {
    expect(technicalWeight, "no se pudo leer TECHNICAL_WEIGHT de lib/scoring/run-scoring.ts").toBeGreaterThan(0);
  });

  it("son cinco pesos y suman 100", () => {
    expect(pesos).toHaveLength(5);
    expect(pesos.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("el peso técnico publicado es el del código", () => {
    expect(pesos[4]).toBe(Math.round(technicalWeight * 100));
  });

  it("los otros cuatro conservan sus proporciones v3 exactas (ADR 0033 §1)", () => {
    const escala = 1 - technicalWeight;
    expect(pesos.slice(0, 4).map((p) => Math.round(p / escala))).toEqual([40, 25, 20, 15]);
  });

  it("ya no cita ADR-0015 como fuente de los pesos vigentes", () => {
    expect(
      PILAR,
      "los pesos de ADR-0015 (v2) están superados por ADR-0033 (v4): citarlos como " +
        "fuente del reparto actual publica una metodología que el producto ya no usa"
    ).not.toContain("ADR-0015");
  });
});
