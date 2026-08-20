/**
 * Selección del plan de acciones prioritarias, compartida entre el servidor
 * (que la necesita para calcular el techo conjunto de puntos, cosa que solo
 * puede hacerse con acceso a las filas del escaneo) y el cliente (que la
 * necesita para renderizar y ordenar las tarjetas).
 *
 * Vive aparte precisamente para que no haya dos copias que puedan divergir:
 * si el orden del plan y el número que lo acompaña se calcularan por separado,
 * la pantalla acabaría enseñando el techo de un conjunto de acciones distinto
 * del que muestra.
 */

export type PlanCandidate = {
  id: string;
  recommendation_type: string;
  impact: string;
  effort: string;
  priority_rank: number;
  consecutive_runs_open?: number;
  potentialPoints?: number | null;
};

/**
 * Cuántas acciones propone el plan por escaneo. Tres es una decisión de
 * producto, no una constante de maquetación: la investigación de este rediseño
 * encontró que el fallo de la competencia es una lista de 100 filas que nadie
 * empieza, y todas las guías revisadas prescriben un conjunto corto y acotado
 * de próximos pasos. El resto queda un scroll más abajo; nada se esconde.
 */
export const PLAN_SIZE = 3;

/**
 * Orden del plan: primero lo cuantificado (mejor pagado delante, y a igualdad
 * gana lo más barato); lo no cuantificado detrás, siguiendo el priority_rank
 * del motor, que ya pondera severidad, impacto, confianza y alcance.
 */
export function planScore(rec: PlanCandidate): number {
  const points = typeof rec.potentialPoints === "number" && rec.potentialPoints > 0 ? rec.potentialPoints : null;
  if (points !== null) {
    const effortBonus = rec.effort === "low" ? 0.3 : rec.effort === "medium" ? 0.1 : 0;
    return 1000 + points + effortBonus;
  }
  return 1000 - rec.priority_rank;
}

/**
 * Las acciones del plan, como mucho una por tipo: sin ese límite el plan
 * degenera en la misma regla tres veces sobre tres consultas distintas, que es
 * justo el defecto que este rediseño existe para quitar. Si hay menos tipos
 * que huecos, los restantes se rellenan con las siguientes mejores.
 */
export function selectPlan<T extends PlanCandidate>(recommendations: readonly T[], size = PLAN_SIZE): T[] {
  const ranked = [...recommendations].sort((a, b) => planScore(b) - planScore(a));
  const seenTypes = new Set<string>();
  const plan = ranked.filter((r) => {
    if (seenTypes.has(r.recommendation_type)) return false;
    seenTypes.add(r.recommendation_type);
    return true;
  }).slice(0, size);

  for (const rec of ranked) {
    if (plan.length >= size) break;
    if (!plan.includes(rec)) plan.push(rec);
  }
  return plan;
}

/**
 * Formato de una cifra de puntos. Un delta por debajo de 1 punto es real y
 * merece verse: redondearlo a cero y caer al impacto cualitativo escondía
 * información verdadera —en un proyecto ya maduro casi todos los deltas caen
 * ahí— y dejaba la moneda del producto invisible.
 */
export function formatPoints(points: number): string {
  return points >= 1 ? String(Math.round(points)) : points.toFixed(1).replace(".", ",");
}

/** Umbral por debajo del cual la cifra deja de ser informativa. */
export const MIN_VISIBLE_POINTS = 0.1;
