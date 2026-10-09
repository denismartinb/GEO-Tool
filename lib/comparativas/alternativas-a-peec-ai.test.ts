import { describe, expect, it } from "vitest";
import { ALTERNATIVES, LEAVE_REASONS, PEEC_PLANS, PEEC_STRENGTHS, SOURCES } from "./alternativas-a-peec-ai";

/**
 * GEO-SELF-1 Fase 2 (log §257). Mismas reglas que `alternativas-a-otterly.test.ts`:
 * cada alternativa declara qué resuelve y qué no, GenScore incluida, y las
 * ventajas del competidor se declaran enteras y con su contexto.
 */
describe("alternativas-a-peec-ai", () => {
  it("cada alternativa declara qué motivo resuelve, y ese motivo existe", () => {
    const ids = new Set(LEAVE_REASONS.map((r) => r.id));
    for (const alt of ALTERNATIVES) {
      expect(alt.solves.length, `${alt.name}: no declara ningún motivo`).toBeGreaterThan(0);
      for (const id of alt.solves) {
        expect(ids.has(id), `${alt.name}: el motivo "${id}" no existe en LEAVE_REASONS`).toBe(true);
      }
    }
  });

  it("cada motivo tiene al menos una alternativa que lo resuelve", () => {
    const covered = new Set(ALTERNATIVES.flatMap((a) => a.solves));
    const orphans = LEAVE_REASONS.filter((r) => !covered.has(r.id)).map((r) => r.id);
    expect(orphans).toEqual([]);
  });

  it("toda alternativa declara su contrapartida, GenScore incluida", () => {
    for (const alt of ALTERNATIVES) {
      expect(alt.tradeoff.length, `${alt.name}: sin contrapartida declarada`).toBeGreaterThan(40);
    }
  });

  it("la contrapartida de GenScore nombra los límites reales del producto", () => {
    const genscore = ALTERNATIVES.find((a) => a.slug === "genscore");
    expect(genscore, "GenScore debe aparecer en la lista").toBeDefined();
    expect(genscore?.ours).toBe(true);
    expect(genscore?.tradeoff).toMatch(/Perplexity/i);
    expect(genscore?.tradeoff).toMatch(/pa[íi]s/i);
  });

  it("sólo GenScore se declara como herramienta nuestra", () => {
    expect(ALTERNATIVES.filter((a) => a.ours).map((a) => a.slug)).toEqual(["genscore"]);
  });

  it("cada ventaja de Peec AI se declara entera y con su contexto", () => {
    expect(PEEC_STRENGTHS.length).toBeGreaterThanOrEqual(3);
    for (const s of PEEC_STRENGTHS) {
      expect(s.claim.length, "una ventaja sin enunciar").toBeGreaterThan(20);
      expect(s.context.length, `"${s.claim}" se lista sin contexto`).toBeGreaterThan(60);
      expect(s.sources.length, `"${s.claim}" sin fuente`).toBeGreaterThan(0);
    }
  });

  it("la escalera de Peec AI declara precio y tope de prompts en cada plan de autoservicio", () => {
    const selfServe = PEEC_PLANS.filter((p) => p.plan !== "Enterprise");
    expect(selfServe.length).toBeGreaterThanOrEqual(3);
    for (const plan of selfServe) {
      expect(plan.price, `${plan.plan}: sin precio`).toMatch(/\d/);
      expect(plan.prompts, `${plan.plan}: sin tope de prompts`).toMatch(/\d/);
    }
  });

  it("hay alternativas de sobra además de la nuestra", () => {
    expect(ALTERNATIVES.filter((a) => !a.ours).length).toBeGreaterThanOrEqual(3);
  });

  it("toda alternativa ajena lleva al menos una fuente", () => {
    for (const alt of ALTERNATIVES.filter((a) => !a.ours)) {
      expect(alt.sources.length, `${alt.name}: sin fuente`).toBeGreaterThan(0);
    }
  });

  /**
   * NOTAS de investigación del 2026-10-09: la sede de GEO Metrics sólo la
   * sugiere una nota de prensa, y nada confirma que la aplicación de ninguna
   * de las herramientas ajenas esté en castellano. Se dice «no consta», nunca
   * que no exista.
   */
  it("no afirma datos no verificados sobre las herramientas ajenas", () => {
    const text = JSON.stringify({ ALTERNATIVES, LEAVE_REASONS, PEEC_STRENGTHS });
    expect(text).not.toMatch(/Granada|granadin/i);
    expect(text).not.toMatch(/no tiene (interfaz|versión) en (castellano|español)/i);
  });

  it("toda fuente de terceros se marca como tal y todas llevan URL https", () => {
    for (const s of Object.values(SOURCES)) {
      expect(s.url).toMatch(/^https:\/\//);
      expect(s.consulted).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(Object.values(SOURCES).some((s) => !s.primary)).toBe(true);
  });
});
