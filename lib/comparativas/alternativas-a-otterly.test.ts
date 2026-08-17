import { describe, expect, it } from "vitest";
import { ALTERNATIVES, LEAVE_REASONS, OTTERLY_PLANS, OTTERLY_STRENGTHS } from "./alternativas-a-otterly";

describe("alternativas-a-otterly", () => {
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

    expect(
      orphans,
      "Estos motivos se plantean pero la página no ofrece ninguna alternativa para ellos, " +
        "así que quien llega con ese problema se va con las manos vacías:\n" +
        orphans.join(", ")
    ).toEqual([]);
  });

  /**
   * La regla de honestidad de esta pieza, y la razón de que `tradeoff` sea un
   * campo obligatorio y no un comentario opcional. Un listicle de
   * "alternativas a X" escrito por un competidor tiende solo en una dirección:
   * cinco fichas de virtudes y ninguna pega. Aquí cada alternativa —incluida
   * la nuestra— declara qué NO resuelve, y el test impide publicar una ficha
   * que se olvide de hacerlo (mismo criterio que log §61 sobre marcar las
   * victorias de los dos lados).
   */
  it("toda alternativa declara su contrapartida, GenScore incluida", () => {
    for (const alt of ALTERNATIVES) {
      expect(alt.tradeoff.length, `${alt.name}: sin contrapartida declarada`).toBeGreaterThan(40);
    }
  });

  it("la contrapartida de GenScore nombra los límites reales del producto", () => {
    const genscore = ALTERNATIVES.find((a) => a.slug === "genscore");
    expect(genscore, "GenScore debe aparecer en la lista").toBeDefined();

    // Perplexity y Copilot no son motores soportados (docs/launch-plan.md Fase
    // 8) y el GEO Score no se desglosa por país. Son justo las dos cosas que
    // Otterly sí hace, así que omitirlas sería el sesgo que este test existe
    // para impedir.
    expect(genscore?.tradeoff).toMatch(/Perplexity/i);
    expect(genscore?.tradeoff).toMatch(/pa[íi]s/i);
  });

  /**
   * La ventaja del competidor se declara sin recortarla —eso es la línea de
   * PRICING-TRUTH-1 y no se toca—, pero nunca suelta. La primera versión de
   * esta página listaba las cuatro a pelo y el efecto era el contrario del
   * buscado: cuatro victorias del competidor arriba del todo se leen como
   * "Otterly gana", aunque tres de las cuatro le sean irrelevantes al lector
   * (fundador, 2026-08-12; log §65). El test exige las dos mitades: que la
   * ventaja siga ahí, y que lleve el contexto que dice a quién le sirve.
   */
  it("cada ventaja de Otterly se declara entera y con su contexto", () => {
    expect(OTTERLY_STRENGTHS.length).toBeGreaterThanOrEqual(3);
    for (const s of OTTERLY_STRENGTHS) {
      expect(s.claim.length, "una ventaja sin enunciar").toBeGreaterThan(20);
      expect(
        s.context.length,
        `"${s.claim}" se lista sin contexto: a quién le sirve de verdad`
      ).toBeGreaterThan(60);
    }
  });

  it("la escalera de precios de Otterly va de menos a más y declara su tope de prompts", () => {
    expect(OTTERLY_PLANS.length).toBeGreaterThanOrEqual(3);
    for (const plan of OTTERLY_PLANS) {
      expect(plan.price, `${plan.plan}: sin precio`).toMatch(/\d/);
      expect(plan.prompts, `${plan.plan}: sin tope de prompts`).toMatch(/\d/);
    }
  });

  /**
   * GenScore no se coloca la primera por ser nuestra: se coloca donde le toca
   * por los motivos que resuelve. Pero sí se impone que NO sea la única — una
   * página de alternativas con una sola alternativa real es un anuncio con
   * otro nombre.
   */
  it("hay alternativas de sobra además de la nuestra", () => {
    const others = ALTERNATIVES.filter((a) => a.slug !== "genscore");
    expect(others.length).toBeGreaterThanOrEqual(3);
  });
});
