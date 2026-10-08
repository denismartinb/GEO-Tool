import { describe, expect, it } from "vitest";
import { ALL_PROPOSAL_COPY, COVERAGE_NOTE, PROMPTS_NATURE_NOTE } from "./proposal-copy";

describe("copy de propuestas", () => {
  it("no afirma «principales competidores», garantías ni volumen de búsquedas", () => {
    const joined = ALL_PROPOSAL_COPY.join(" ").toLowerCase();
    expect(joined).not.toMatch(/principales competidores/);
    expect(joined).not.toMatch(/garantiz/);
    expect(joined).not.toMatch(/mejores datos/);
    expect(joined).not.toMatch(/búsquedas mensuales|volumen de búsqueda/);
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
