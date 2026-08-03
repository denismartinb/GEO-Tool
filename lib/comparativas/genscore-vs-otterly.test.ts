import { describe, expect, it } from "vitest";
import { COMPARISON_ROWS } from "./genscore-vs-otterly";

describe("COMPARISON_ROWS (genscore-vs-otterly)", () => {
  it("has at least one row", () => {
    expect(COMPARISON_ROWS.length).toBeGreaterThan(0);
  });

  it("every row has non-empty Genscore and Otterly values", () => {
    for (const row of COMPARISON_ROWS) {
      expect(row.label.length).toBeGreaterThan(0);
      expect(row.genscore.length).toBeGreaterThan(0);
      expect(row.otterly.length).toBeGreaterThan(0);
    }
  });

  it("includes at least one row where the competitor wins — an honest comparison never sweeps every column", () => {
    expect(COMPARISON_ROWS.some((row) => row.otterlyWins)).toBe(true);
  });
});
