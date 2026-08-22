import { describe, expect, it } from "vitest";

import {
  GROUP_PREVIEW_SIZE,
  PLAN_SIZE,
  formatPoints,
  planScore,
  rankGroupMembers,
  selectPlan,
  type PlanCandidate
} from "./plan";
import { pointsCaption } from "./deliverable";

const rec = (over: Partial<PlanCandidate> & { recommendation_type: string }): PlanCandidate => ({
  id: over.recommendation_type + (over.id ?? ""),
  impact: "medium",
  effort: "medium",
  priority_rank: 5,
  ...over
});

/**
 * RECS-ACCION-1c. El contrafactual de una acción externa asume que TODAS las
 * fuentes citadas acaban mencionando la marca, así que sale generoso por
 * construcción y se comía el primer puesto del plan. El fundador lo vio en su
 * propio proyecto: "Consigue que 5 webs que cita la IA te mencionen", +11 pt,
 * prioridad alta, por encima de todo lo que él podía hacer ese día.
 */
describe("planScore — techo de las acciones externas", () => {
  it("una acción externa nunca supera a una propia, ni con muchos más puntos", () => {
    const externa = rec({ recommendation_type: "pursue_citation_sources", potentialPoints: 11 });
    const propia = rec({ recommendation_type: "add_citation_block", potentialPoints: 0.6 });
    expect(planScore(propia)).toBeGreaterThan(planScore(externa));
  });

  it("tampoco supera a una propia sin cifra", () => {
    const externa = rec({ recommendation_type: "pursue_media_sources", potentialPoints: 40 });
    const propia = rec({ recommendation_type: "create_faq_section", potentialPoints: null, priority_rank: 30 });
    expect(planScore(propia)).toBeGreaterThan(planScore(externa));
  });

  it("lo que se resuelve dentro del producto cuenta como propio", () => {
    const interna = rec({ recommendation_type: "track_emerging_competitor", potentialPoints: null, priority_rank: 20 });
    const externa = rec({ recommendation_type: "pursue_community_sources", potentialPoints: 9 });
    expect(planScore(interna)).toBeGreaterThan(planScore(externa));
  });

  it("entre externas se conserva el orden de siempre", () => {
    const mejor = rec({ recommendation_type: "pursue_media_sources", potentialPoints: 8 });
    const peor = rec({ recommendation_type: "pursue_community_sources", potentialPoints: 2 });
    expect(planScore(mejor)).toBeGreaterThan(planScore(peor));
  });

  it("entre propias se conserva el orden de siempre, esfuerzo bajo incluido", () => {
    const barata = rec({ recommendation_type: "add_citation_block", potentialPoints: 5, effort: "low" });
    const cara = rec({ recommendation_type: "create_faq_section", potentialPoints: 5, effort: "high" });
    expect(planScore(barata)).toBeGreaterThan(planScore(cara));
  });

  it("un tipo sin control declarado NO se penaliza", () => {
    // Misma dirección de fallo que `deliverableForType`: sin clasificar no se
    // afirma nada, y el orden se queda como estaba.
    const desconocida = rec({ recommendation_type: "some_future_rule", potentialPoints: 5 });
    const propia = rec({ recommendation_type: "add_citation_block", potentialPoints: 5 });
    expect(planScore(desconocida)).toBe(planScore(propia));
  });
});

describe("selectPlan — es un techo, no un filtro", () => {
  it("relega las externas al final cuando hay acciones propias que hacer", () => {
    const plan = selectPlan([
      rec({ recommendation_type: "pursue_citation_sources", potentialPoints: 11 }),
      rec({ recommendation_type: "add_citation_block", potentialPoints: 0.6 }),
      rec({ recommendation_type: "create_faq_section", potentialPoints: 0.4 }),
      rec({ recommendation_type: "increase_brand_visibility", potentialPoints: 0.2 })
    ]);
    expect(plan).toHaveLength(PLAN_SIZE);
    expect(plan.map((r) => r.recommendation_type)).not.toContain("pursue_citation_sources");
  });

  it("pero si no hay nada propio que hacer, la externa sí sube al plan", () => {
    const plan = selectPlan([
      rec({ recommendation_type: "pursue_citation_sources", potentialPoints: 11 }),
      rec({ recommendation_type: "pursue_media_sources", potentialPoints: 3 })
    ]);
    expect(plan.map((r) => r.recommendation_type)).toEqual(["pursue_citation_sources", "pursue_media_sources"]);
  });

  it("sigue sin repetir tipo dentro del plan", () => {
    const plan = selectPlan([
      rec({ id: "a", recommendation_type: "increase_brand_visibility", potentialPoints: 9 }),
      rec({ id: "b", recommendation_type: "increase_brand_visibility", potentialPoints: 8 }),
      rec({ id: "c", recommendation_type: "add_citation_block", potentialPoints: 7 }),
      rec({ id: "d", recommendation_type: "create_faq_section", potentialPoints: 6 })
    ]);
    expect(new Set(plan.map((r) => r.recommendation_type)).size).toBe(PLAN_SIZE);
  });
});

describe("pointsCaption — la promesa dice de quién depende", () => {
  it("condiciona la cifra de una acción externa", () => {
    expect(pointsCaption("pursue_citation_sources")).toBe("si te citan");
    expect(pointsCaption("pursue_media_sources")).toBe("si te citan");
  });

  it("deja intacta la de una acción propia", () => {
    expect(pointsCaption("add_citation_block")).toBe("potenciales");
    expect(pointsCaption("increase_brand_visibility")).toBe("potenciales");
  });

  it("un tipo sin clasificar no se condiciona", () => {
    expect(pointsCaption("some_future_rule")).toBe("potenciales");
  });

  it("no toca la cifra en sí, sólo lo que declara", () => {
    expect(formatPoints(11)).toBe("11");
    expect(formatPoints(0.6)).toBe("0,6");
  });
});

/**
 * RECS-ACCION-1c. El motor emite una tarjeta por prompt, así que
 * `increase_brand_visibility` en el proyecto real del fundador eran 30 de sus
 * 36 acciones. El problema no es cómo se agrupan: es cuáles de las 30 mueven
 * la aguja.
 */
describe("rankGroupMembers — dentro del grupo, primero lo que más mueve", () => {
  it("ordena por puntos, de mayor a menor", () => {
    const ranked = rankGroupMembers([
      rec({ id: "a", recommendation_type: "increase_brand_visibility", potentialPoints: 0.2 }),
      rec({ id: "b", recommendation_type: "increase_brand_visibility", potentialPoints: 3 }),
      rec({ id: "c", recommendation_type: "increase_brand_visibility", potentialPoints: 1 })
    ]);
    expect(ranked.map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("las que no tienen cifra van detrás, por priority_rank", () => {
    const ranked = rankGroupMembers([
      rec({ id: "sin1", recommendation_type: "increase_brand_visibility", potentialPoints: null, priority_rank: 9 }),
      rec({ id: "con", recommendation_type: "increase_brand_visibility", potentialPoints: 0.2 }),
      rec({ id: "sin2", recommendation_type: "increase_brand_visibility", potentialPoints: null, priority_rank: 2 })
    ]);
    expect(ranked.map((r) => r.id)).toEqual(["con", "sin2", "sin1"]);
  });

  it("no muta el array de entrada", () => {
    const items = [
      rec({ id: "a", recommendation_type: "increase_brand_visibility", potentialPoints: 1 }),
      rec({ id: "b", recommendation_type: "increase_brand_visibility", potentialPoints: 5 })
    ];
    rankGroupMembers(items);
    expect(items.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("el cap deja ver las mejores y el resto a un clic, sin esconder nada", () => {
    const items = Array.from({ length: 30 }, (_, i) =>
      rec({ id: `p${i}`, recommendation_type: "increase_brand_visibility", potentialPoints: i / 10 })
    );
    const ranked = rankGroupMembers(items);
    const visible = ranked.slice(0, GROUP_PREVIEW_SIZE);
    expect(visible).toHaveLength(5);
    expect(visible.map((r) => r.id)).toEqual(["p29", "p28", "p27", "p26", "p25"]);
    expect(ranked.length - visible.length).toBe(25);
  });
});
