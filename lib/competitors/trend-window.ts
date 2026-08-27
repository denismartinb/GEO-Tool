/**
 * TREND-WINDOW-1 — decides which scans the position-evolution chart actually
 * draws.
 *
 * Two real defects on the founder's Movistar project (21 completed scans,
 * 2026-08-04) motivated this:
 *
 * 1. **A blank vertical band mid-chart.** Every run got an x slot, including
 *    runs with no persisted ranking at all (no `run_scores` row, or a
 *    `details_json` without `brand_position.ranking`). For those the value of
 *    EVERY series is null, so every line breaks at the same x and the chart
 *    shows a hole. A single series going null is meaningful — "this brand was
 *    not mentioned in that scan" — but a column where nobody has a value
 *    carries no information at all, and rendering it as a gap reads as a
 *    broken chart. Founder: *"eso no puede suceder en ningún caso"*.
 *
 * 2. **Too many points.** With scans accumulating daily the line turns into
 *    noise. The chart is capped to a recent window.
 *
 * Order matters: drop the empty runs FIRST, then take the last N. Slicing
 * first would spend slots of the window on columns that draw nothing.
 */

export type TrendWindowPoint = {
  date: string;
  /** Matches PositionTrendChart's own TrendPoint: a series can be absent, null or a real position. */
  values: Record<string, number | null | undefined>;
};

/** Recent scans drawn by default. */
export const MAX_TREND_POINTS = 15;

/**
 * Scans needed before a trend is drawn at all.
 *
 * Was 2, which is the mathematical minimum for a line and the wrong number for
 * a product: two points render as two flat strokes spanning the full width and
 * read as a broken chart rather than a short one. Founder raised it to 4 on
 * 2026-08-04 after seeing three different projects in exactly that state.
 */
export const MIN_TREND_POINTS = 4;

/**
 * SVG path connecting a series' measured points.
 *
 * Straight segments between consecutive measurements, NOT a staircase. The
 * chart used `H`/`V` pairs with the rationale that "a rank does not slide
 * through the values in between" — but a step asserts the value stayed put
 * until the instant of the next scan, which is a stronger unmeasured claim
 * than a diagonal, and it renders as a staircase that reads like a bug
 * (founder, 2026-08-04: "es un gráfico en escalera que no tiene sentido").
 * The dots carry "here is a real measurement"; the line only connects them.
 *
 * A null value breaks the path into a new segment, so a scan where the entity
 * had no rank leaves a real gap instead of a line through it.
 */
export function buildSeriesPaths(
  points: Array<{ x: number; y: number } | null>
): string[] {
  const segments: string[] = [];
  let current = "";

  for (const p of points) {
    if (!p) {
      if (current) segments.push(current);
      current = "";
      continue;
    }
    const x = p.x.toFixed(1);
    const y = p.y.toFixed(1);
    current = current ? `${current} L${x} ${y}` : `M${x} ${y}`;
  }

  if (current) segments.push(current);
  return segments;
}

/** True when at least one series has a real position at this point (`!= null` also covers undefined). */
function carriesData(point: TrendWindowPoint): boolean {
  return Object.values(point.values).some((v) => v != null);
}

export function selectTrendWindow<T extends TrendWindowPoint>(input: {
  /** Chronological, oldest first. */
  points: T[];
  limit?: number;
}): T[] {
  const limit = input.limit ?? MAX_TREND_POINTS;
  const informative = input.points.filter(carriesData);
  return limit > 0 && informative.length > limit ? informative.slice(-limit) : informative;
}

/**
 * Cuántas series de CONTEXTO dibuja el gráfico antes de que el resto haya que
 * encenderlas a mano.
 *
 * Ocho líneas superpuestas no las lee nadie —la captura del fundador era la
 * marca más siete competidores, todos escalones del mismo azul— y cuatro es
 * donde los tonos siguen distinguiéndose (también bajo daltonismo) y las
 * etiquetas de final de línea todavía caben sin chocar.
 *
 * **Vive aquí y no en `position-trend-chart.tsx` a la fuerza** (log §177): ese
 * fichero es `"use client"`, y Next convierte los exports de un módulo cliente
 * en referencias de cliente cuando los importa un componente de servidor. La
 * página la usaba como número para calcular qué series nacen encendidas, le
 * llegaba algo que no era 4, `slice(0, cap)` devolvía vacío y **el gráfico
 * salía con una sola línea**. Ni el typecheck ni los tests lo ven: los tipos
 * son correctos y los tests no cruzan la frontera servidor/cliente. Sólo se ve
 * mirando la pantalla. Una constante que lee el servidor no se importa de un
 * módulo cliente.
 */
export const DEFAULT_VISIBLE_SERIES = 4;
