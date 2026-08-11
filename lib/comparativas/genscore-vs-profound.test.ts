import { describe, expect, it } from "vitest";
import { COMPARISON_ROWS } from "./genscore-vs-profound";

describe("COMPARISON_ROWS (genscore-vs-profound)", () => {
  it("has at least one row", () => {
    expect(COMPARISON_ROWS.length).toBeGreaterThan(0);
  });

  it("every row has non-empty Genscore and Profound values", () => {
    for (const row of COMPARISON_ROWS) {
      expect(row.label.length).toBeGreaterThan(0);
      expect(row.genscore.length).toBeGreaterThan(0);
      expect(row.profound.length).toBeGreaterThan(0);
    }
  });

  it("includes at least one row where the competitor wins — an honest comparison never sweeps every column", () => {
    expect(COMPARISON_ROWS.some((row) => row.profoundWins)).toBe(true);
  });

  it("no row states a specific Profound price — their pricing page is demo-gated and third-party figures conflict", () => {
    for (const row of COMPARISON_ROWS) {
      expect(row.profound, `${row.label}: no debería afirmar un precio concreto de Profound`).not.toMatch(
        /^\d+\s*\$/
      );
    }
  });
});
