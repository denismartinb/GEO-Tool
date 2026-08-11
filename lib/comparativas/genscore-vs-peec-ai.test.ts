import { describe, expect, it } from "vitest";
import { COMPARISON_ROWS } from "./genscore-vs-peec-ai";

describe("COMPARISON_ROWS (genscore-vs-peec-ai)", () => {
  it("has at least one row", () => {
    expect(COMPARISON_ROWS.length).toBeGreaterThan(0);
  });

  it("every row has non-empty Genscore and Peec AI values", () => {
    for (const row of COMPARISON_ROWS) {
      expect(row.label.length).toBeGreaterThan(0);
      expect(row.genscore.length).toBeGreaterThan(0);
      expect(row.peec.length).toBeGreaterThan(0);
    }
  });

  it("includes at least one row where the competitor wins — an honest comparison never sweeps every column", () => {
    expect(COMPARISON_ROWS.some((row) => row.peecWins)).toBe(true);
  });

  /**
   * Revisión del fundador (2026-08-11): la tabla marcaba con insignia SOLO las
   * filas donde ganaba el competidor, así que al escanearla las únicas marcas
   * visibles estaban en su columna y la página se leía como si Peec AI ganara
   * en todo — aunque el reparto real de filas estuviera equilibrado. Ahora
   * ambos lados se marcan, y este test impide volver a publicar una tabla que
   * solo reconozca las victorias de un lado (log §58).
   */
  it("marca victorias en los dos lados, no solo las del competidor", () => {
    expect(COMPARISON_ROWS.some((row) => row.genscoreWins)).toBe(true);
    expect(COMPARISON_ROWS.some((row) => row.peecWins)).toBe(true);
  });

  it("ninguna fila se marca como victoria de los dos a la vez", () => {
    for (const row of COMPARISON_ROWS) {
      expect(row.genscoreWins && row.peecWins, `${row.label}: marcada para ambos`).toBeFalsy();
    }
  });
});
