import { describe, expect, it } from "vitest";
import { COMPARISON_ROWS, FAQ_ITEMS, SOURCES } from "./genscore-vs-rankscale";

describe("genscore-vs-rankscale", () => {
  it("marca victorias en los dos lados y nunca en ambos a la vez", () => {
    expect(COMPARISON_ROWS.some((r) => r.genscoreWins)).toBe(true);
    expect(COMPARISON_ROWS.some((r) => r.rankscaleWins)).toBe(true);
    for (const r of COMPARISON_ROWS) expect(r.genscoreWins && r.rankscaleWins).toBeFalsy();
  });

  it("tiene fuentes primarias fechadas", () => {
    for (const s of Object.values(SOURCES)) {
      expect(s.primary).toBe(true);
      expect(s.consulted).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("FAQ con preguntas, respuestas y sin cifras absolutas de preguntas o respuestas", () => {
    for (const i of FAQ_ITEMS) {
      expect(i.question.endsWith("?")).toBe(true);
      expect(i.answer.length).toBeGreaterThan(40);
      expect(i.answer).not.toMatch(/\d+ (preguntas|respuestas)/i);
    }
  });
});
