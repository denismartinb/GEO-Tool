import { describe, expect, it } from "vitest";
import { ALL_PROPOSAL_COPY, COVERAGE_NOTE, PROMPTS_NATURE_NOTE, PROMPTS_SHORT_NOTICE } from "./proposal-copy";

describe("copy de propuestas", () => {
  it("no afirma «principales competidores», garantías ni volumen de búsquedas", () => {
    const joined = ALL_PROPOSAL_COPY.join(" ").toLowerCase();
    expect(joined).not.toMatch(/principales competidores/);
    expect(joined).not.toMatch(/garantiz/);
    expect(joined).not.toMatch(/mejores datos/);
    expect(joined).not.toMatch(/búsquedas mensuales/);
  });

  it("solo menciona «volumen» para negarlo (sin volumen medido), nunca para afirmarlo", () => {
    for (const text of ALL_PROPOSAL_COPY) {
      if (/volumen/i.test(text)) expect(text).toMatch(/sin volumen|no hay volumen/i);
    }
    expect(PROMPTS_SHORT_NOTICE).toMatch(/sin volumen de búsqueda medido/);
  });

  it("dice que 15 es cobertura y no una garantía estadística", () => {
    expect(COVERAGE_NOTE).toMatch(/recomendación de cobertura/);
    expect(COVERAGE_NOTE).toMatch(/no una garantía estadística/);
  });

  it("dice que las preguntas no son búsquedas reales", () => {
    expect(PROMPTS_NATURE_NOTE).toMatch(/no búsquedas reales/);
    expect(PROMPTS_NATURE_NOTE).toMatch(/No hay volumen de demanda medido/);
  });
});
