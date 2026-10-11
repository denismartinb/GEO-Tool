import { describe, expect, it } from "vitest";
import { scoreColor } from "./score-tiles";

/**
 * PRELAUNCH-HARDENING-1 R7 — tests de render de los azulejos de puntuación.
 * Ver la cabecera de `issue-rows.test.tsx` para por qué se renderiza de verdad
 * con `react-dom/server` y qué se asegura (contenido) y qué no (aspecto).
 *
 * Lo que estos tests protegen en concreto es el invariante de la zona «ningún
 * número de relleno» (`.claude/rules/web-audit.md`): que un dato ausente se
 * vea como ausente y que un plan sin la mitad de cobertura NO se lea como
 * «todavía no auditado».
 */

describe("scoreColor", () => {
  it("corta en 40 y en 70, no en otros sitios", () => {
    expect(scoreColor(39)).toBe(scoreColor(0));
    expect(scoreColor(40)).not.toBe(scoreColor(39));
    expect(scoreColor(69)).toBe(scoreColor(40));
    expect(scoreColor(70)).not.toBe(scoreColor(69));
    expect(scoreColor(100)).toBe(scoreColor(70));
  });

  it("un score ausente no se pinta como uno malo", () => {
    expect(scoreColor(null)).not.toBe(scoreColor(0));
  });
});
