/**
 * Statistical honesty for the coverage/implementation percentages
 * (WEB-AUDIT-R6, phase 1 — geo-strategy methodology review 2026-07-17).
 *
 * Root cause of the founder-reported "Evolución" instability: coverage and
 * citation are both sampled fresh from Gemini's Google Search grounding per
 * scan (lib/recommendations/domain-coverage.ts, lib/web-audit/opportunity-matrix.ts)
 * — a noisy sensor with an asymmetric error profile (a resolved grounding
 * citation is strong positive evidence; a "not found" is weak evidence of
 * absence, since it can just mean that scan's retrieval missed it). With a
 * small denominator (e.g. 2/6 topics), a single sampling flip swings the
 * percentage by double digits — that swing is sampling noise, not real
 * progress or regression, and presenting it as a bare "+17 pt" reads as
 * fake precision the product doesn't have.
 *
 * The interval itself now comes from `lib/stats/wilson.ts`, shared with the
 * GEO score's own reliability layer (GEO-SCORE-RELIABILITY-1) — same formula,
 * one implementation. This module keeps what is genuinely web-audit-specific:
 * the small-sample threshold, whole-point rounding, and the delta rule.
 *
 * geo-strategy's recommendation (rejected persistent-verification and the
 * "cited in ANY of the last N scans" window as biasing metrics upward —
 * see the phase's Task Intake): fix the PRESENTATION first, honestly, with
 * zero risk of inflating anything. This module computes a Wilson score
 * confidence interval for a proportion — the standard interval for a small
 * binomial sample, always inside [0, trials] and never asserting more
 * precision than the sample supports.
 */

import { wilsonInterval } from "@/lib/stats/wilson";

/** Below this many trials, a single flip can swing the percentage enough that showing it as a bare point value (or a delta against it) reads as more precise than the sample supports. geo-strategy review 2026-07-17. */
export const SMALL_SAMPLE_THRESHOLD = 5;

export type SampleConfidence = {
  /** 0-100, rounded — never below 0 or above 100. */
  lowerPct: number;
  upperPct: number;
  isSmallSample: boolean;
};

/**
 * Wilson score interval for `successes` out of `trials`, at 95% confidence.
 * Returns null when there are no trials — there is no interval to compute
 * over an empty sample, and callers must not render one.
 */
export function computeSampleConfidence(successes: number, trials: number): SampleConfidence | null {
  const interval = wilsonInterval(successes, trials);
  if (!interval) return null;

  return {
    lowerPct: Math.round(interval.low * 100),
    upperPct: Math.round(interval.high * 100),
    isSmallSample: trials < SMALL_SAMPLE_THRESHOLD
  };
}

/**
 * Whether a delta between two points is trustworthy enough to show. A
 * comparison is only as reliable as its WEAKER side — if either the current
 * or the previous sample is small, the "change" between them can be pure
 * sampling noise, not a real shift.
 */
export function isDeltaTrustworthy(currentTrials: number, previousTrials: number): boolean {
  return currentTrials >= SMALL_SAMPLE_THRESHOLD && previousTrials >= SMALL_SAMPLE_THRESHOLD;
}
