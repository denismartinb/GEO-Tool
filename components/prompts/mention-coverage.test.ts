import { describe, expect, it } from "vitest";
import { buildRanking, coveragePercent, type CoverageExtractedJson } from "./mention-coverage";

/**
 * PROMPT-DRAWER-TRUTH-1 (log §147).
 *
 * Lo que protegen estos tests es una sola frase: **el ranking no puede afirmar
 * nada que sus propias filas no sostengan**. El fallo que los motiva cabía en
 * una captura — «Gemini Mencionada · ChatGPT Ausente · Claude Ausente» y,
 * debajo, «Tu marca 100%» — porque la cobertura era `results.some(...)`
 * pintado como 100 o 0.
 */

function fila(brandMentioned: boolean) {
  return { brand_mentioned: brandMentioned };
}

/** Una extracción que evaluó a `nombres` y marcó como mencionados a `mencionados`. */
function extraccion(nombres: string[], mencionados: string[] = []): CoverageExtractedJson {
  return {
    competitors: nombres.map((name) => ({ name, mentioned: mencionados.includes(name), evidence: [] }))
  };
}

describe("coveragePercent", () => {
  it("un motor de tres es 33%, no 100%", () => {
    expect(coveragePercent(1, 3)).toBe(33);
  });

  it("mantiene los extremos", () => {
    expect(coveragePercent(3, 3)).toBe(100);
    expect(coveragePercent(0, 3)).toBe(0);
  });

  it("sin respuestas evaluadas no inventa un cero", () => {
    expect(coveragePercent(0, 0)).toBeNull();
  });
});

describe("buildRanking — la marca", () => {
  it("cuenta respuestas, no motores distintos (ADR 0030: nueve muestras, una mención)", () => {
    const results = [true, false, false, false, false, false, false, false, false].map(fila);
    const [marca] = buildRanking({
      results,
      extractedList: results.map(() => null),
      competitors: [],
      brandEvidence: [],
      brandSentiment: null
    });

    expect(marca.mentionCount).toBe(1);
    expect(marca.evaluatedCount).toBe(9);
    expect(marca.coverage).toBe(11);
  });

  it("el caso de la captura: 1 de 3 se lee 33%", () => {
    const results = [fila(true), fila(false), fila(false)];
    const [marca] = buildRanking({
      results,
      extractedList: [null, null, null],
      competitors: [],
      brandEvidence: [],
      brandSentiment: null
    });

    expect(marca.coverage).toBe(33);
    expect(marca.mentioned).toBe(true);
  });

  it("la fila propia lleva el nombre real del proyecto, no el literal «Tu marca»", () => {
    const results = [fila(true)];
    const [marca] = buildRanking({
      results,
      extractedList: [null],
      competitors: [],
      brandEvidence: [],
      brandSentiment: null,
      brandName: "GenScore"
    });

    expect(marca.name).toBe("GenScore");
  });

  it("sin nombre de marca, cae en el literal de siempre", () => {
    const results = [fila(true)];
    const [marca] = buildRanking({
      results,
      extractedList: [null],
      competitors: [],
      brandEvidence: [],
      brandSentiment: null
    });

    expect(marca.name).toBe("Tu marca");
  });

  it("3 de 3 sigue siendo 100% y 0 de 3 sigue siendo 0%", () => {
    const todas = [fila(true), fila(true), fila(true)];
    const ninguna = [fila(false), fila(false), fila(false)];
    const base = { competitors: [], brandEvidence: [], brandSentiment: null };

    expect(buildRanking({ ...base, results: todas, extractedList: [null, null, null] })[0].coverage).toBe(100);
    expect(buildRanking({ ...base, results: ninguna, extractedList: [null, null, null] })[0].coverage).toBe(0);
  });
});

describe("buildRanking — los competidores", () => {
  it("mide a cada competidor sobre las respuestas que lo evaluaron", () => {
    const results = [fila(false), fila(false)];
    const filas = buildRanking({
      results,
      extractedList: [extraccion(["Otterly", "Peec"], ["Otterly"]), extraccion(["Otterly", "Peec"], [])],
      competitors: [{ name: "Otterly" }, { name: "Peec" }],
      brandEvidence: [],
      brandSentiment: null
    });

    const otterly = filas.find((f) => f.name === "Otterly");
    const peec = filas.find((f) => f.name === "Peec");
    expect(otterly).toMatchObject({ mentionCount: 1, evaluatedCount: 2, coverage: 50 });
    expect(peec).toMatchObject({ mentionCount: 0, evaluatedCount: 2, coverage: 0 });
  });

  /**
   * Una fila cuya extracción falló no opina sobre ese competidor. Contarla en
   * el denominador convertiría un fallo nuestro en un 0% suyo — el mismo
   * criterio que `computeBrandPosition` aplica al saltarse las filas sin
   * `extracted_json`.
   */
  it("una extracción fallida no diluye la cobertura del competidor", () => {
    const results = [fila(false), fila(false)];
    const otterly = buildRanking({
      results,
      extractedList: [extraccion(["Otterly"], ["Otterly"]), null],
      competitors: [{ name: "Otterly" }],
      brandEvidence: [],
      brandSentiment: null
    }).find((f) => f.name === "Otterly");

    expect(otterly).toMatchObject({ mentionCount: 1, evaluatedCount: 1, coverage: 100 });
  });

  it("un competidor que nadie evaluó queda sin cifra, no a cero", () => {
    const results = [fila(true)];
    const [, sinEvaluar] = buildRanking({
      results,
      extractedList: [null],
      competitors: [{ name: "Semrush" }],
      brandEvidence: [],
      brandSentiment: null
    });

    expect(sinEvaluar).toMatchObject({ name: "Semrush", evaluatedCount: 0, coverage: null });
  });
});

describe("buildRanking — el orden", () => {
  it("un competidor con más cobertura sale por encima de la marca", () => {
    const results = [fila(true), fila(false), fila(false)];
    const orden = buildRanking({
      results,
      extractedList: [
        extraccion(["Otterly"], ["Otterly"]),
        extraccion(["Otterly"], ["Otterly"]),
        extraccion(["Otterly"], ["Otterly"])
      ],
      competitors: [{ name: "Otterly" }],
      brandEvidence: [],
      brandSentiment: null
    }).map((f) => f.name);

    expect(orden).toEqual(["Otterly", "Tu marca"]);
  });

  it("al empatar en cobertura, la marca propia va delante", () => {
    const results = [fila(true), fila(true)];
    const orden = buildRanking({
      results,
      extractedList: [extraccion(["Otterly"], ["Otterly"]), extraccion(["Otterly"], ["Otterly"])],
      competitors: [{ name: "Otterly" }],
      brandEvidence: [],
      brandSentiment: null
    }).map((f) => f.name);

    expect(orden).toEqual(["Tu marca", "Otterly"]);
  });

  it("lo no evaluado va al final, detrás de lo que se midió y salió a cero", () => {
    const results = [fila(false)];
    const orden = buildRanking({
      results,
      extractedList: [extraccion(["Peec"], [])],
      competitors: [{ name: "Peec" }, { name: "Semrush" }],
      brandEvidence: [],
      brandSentiment: null
    }).map((f) => f.name);

    expect(orden).toEqual(["Tu marca", "Peec", "Semrush"]);
  });
});
