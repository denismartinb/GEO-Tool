/**
 * Wilson score interval — the one implementation.
 *
 * Two independent surfaces of this product measure a proportion from a small,
 * noisy LLM sample and then have to say how precise it is:
 *
 * - Web audit coverage/implementation percentages (WEB-AUDIT-R6,
 *   `lib/web-audit/sample-confidence.ts`).
 * - The GEO score's brand mention rate (GEO-SCORE-RELIABILITY-1,
 *   `lib/scoring/score-reliability.ts`).
 *
 * Both arrived at Wilson for the same reason, and for a while both carried
 * their own copy of the formula with subtly different constants and rounding
 * — two answers to the same question, which is precisely the class of
 * inconsistency the metric ADRs exist to eliminate. This module is the shared
 * primitive; callers own their own thresholds, rounding and presentation,
 * which genuinely do differ between the two surfaces.
 *
 * Wilson rather than the textbook normal approximation because the normal
 * interval degenerates exactly where this product lives: at p̂ = 0 or p̂ = 1
 * it returns a width of zero — claiming perfect certainty from "0 of 3" or
 * "3 of 3" — and it can produce bounds outside [0, 1]. Wilson stays
 * well-behaved at both extremes and at small n.
 */

/** z-score for a 95% two-sided normal interval. */
export const Z_95 = 1.959963984540054;

export type WilsonInterval = {
  /** Lower bound as a proportion in [0, 1]. */
  low: number;
  /** Upper bound as a proportion in [0, 1]. */
  high: number;
};

/**
 * Wilson score interval for `successes` out of `trials`, as proportions in
 * [0, 1]. Rounding and percentage conversion are deliberately left to the
 * caller — the web audit rounds to whole points, the GEO score keeps one
 * decimal, and baking either choice in here would force one surface to
 * misreport.
 *
 * Returns null when there are no trials: there is no interval around an empty
 * sample, and callers must render nothing rather than a fabricated range.
 * `successes` is clamped into [0, trials] so impossible inputs degrade to a
 * saturated bound instead of producing a NaN interval.
 */
export function wilsonInterval(successes: number, trials: number, z: number = Z_95): WilsonInterval | null {
  if (!Number.isFinite(successes) || !Number.isFinite(trials)) return null;
  const n = Math.floor(trials);
  if (n <= 0) return null;

  const k = Math.min(Math.max(Math.floor(successes), 0), n);
  const p = k / n;
  const z2 = z * z;

  const denominator = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denominator;
  const halfWidth = (z / denominator) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));

  return {
    low: Math.max(0, center - halfWidth),
    high: Math.min(1, center + halfWidth)
  };
}
