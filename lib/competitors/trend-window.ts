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
