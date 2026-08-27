import "server-only";

import { getEffectiveGeoScore } from "@/lib/scoring/run-scoring";
import { hasSufficientSample, MIN_RESPONSES_FOR_BAND } from "@/lib/scoring/score-reliability";
import { computeWindowedScore, readWindowRun, type WindowRunInput } from "@/lib/scoring/score-window";

/**
 * TRUST-METRICS-1 (docs/external-audit-2026-08.md, Fase 1) — the single owner
 * of every publishable figure derived from a project's runs.
 *
 * WHY THIS EXISTS. The external audit of 2026-08-26 found the same project
 * publishing four different numbers under overlapping labels: 6/100 on the
 * Overview gauge, "2 Puntuación GEO" on Dominios, "Visibilidad 2" on the
 * completion notification — and Competidores calling 45 (prompt × engine)
 * rows "45 prompts" against Prompts' own count of 15. Verified in code before
 * this module existed: Overview read the composite (`details_json.geo_score`),
 * Dominios and the notification read the raw `visibility_score` component,
 * and nothing stopped a screen from computing its own percentage.
 *
 * THE RULE THIS MODULE ENFORCES (founder decision, 2026-08-27): there is ONE
 * GEO score across the whole product, and it is the windowed score
 * (`lib/scoring/score-window.ts`, SCORE-WINDOW-1, ADR 0036) — a median over
 * the last `DEFAULT_SCORE_WINDOW_SIZE` comparable runs, built to absorb the
 * variance of live retrieval that even `temperature: 0` cannot control
 * (docs/geo-score-variability-2026-08.md). `visibility_score` — one component
 * of the composite, not a score in its own right — must NEVER be published
 * under a "Puntuación GEO" label, anywhere. SCORE-WINDOW-1 itself (the median,
 * the window size, `MIN_RUNS_FOR_WINDOW`, the comparability rules) is
 * explicitly OUT OF SCOPE for this module: it is consumed, never modified.
 *
 * WHAT THIS MODULE REFUSES TO DO. It never computes a percentage without also
 * returning the denominator that produced it — "2 % de respuestas (1/45)" is
 * one `RateMetric` value, not a bare number a caller can strip the context
 * from. And it never invents a fallback for a quantity SCORE-WINDOW-1 already
 * refuses to publish (fewer than two comparable runs): callers get the
 * documented per-run fallback, labelled as exactly that, never a value dressed
 * up as more stable than it is.
 *
 * WHAT IT DOES NOT COVER (yet). Confidence bands (`hasSufficientSample`) are
 * read here only to decide whether a headline figure is fresh enough to trust,
 * not re-implemented. The counterfactual "+N points" arithmetic in
 * Recomendaciones (P0-03) is a distinct problem — per-recommendation, not
 * per-run — and stays out of this module; it is Fase 7 of the audit plan.
 */

// ---------------------------------------------------------------------------
// The headline GEO score
// ---------------------------------------------------------------------------

export const GEO_SCORE_LABEL = "Puntuación GEO";

export type GeoScoreRunRow = {
  run_id?: string | null;
  created_at?: string | null;
  visibility_score: number | null;
  details_json: unknown;
};

export type GeoScoreBasis =
  /** SCORE-WINDOW-1 published a median over ≥2 comparable runs. */
  | "window"
  /** Fewer than two comparable runs exist yet — this project's first scan,
   *  or a scoring-method change that makes the previous run incomparable.
   *  Falls back to the most recent run's own composite, under the same
   *  label, because it is the best estimate available and invents nothing. */
  | "single_run";

export type GeoScoreResult = {
  /** Always this constant — every consumer renders the same label. */
  label: typeof GEO_SCORE_LABEL;
  /** 0–100, rounded. Never `visibility_score`. */
  value: number;
  basis: GeoScoreBasis;
  /** True below `MIN_RESPONSES_FOR_BAND` responses on the reference run — the
   *  existing confidence marker this module must never contradict. */
  lowConfidence: boolean;
  /** Run ids folded into the window, newest first. Empty when basis is
   *  "single_run". */
  runsUsed: string[];
};

/**
 * Resolves the single GEO score for a project from its recent runs.
 *
 * `runs` should be the project's most recent completed runs, newest first,
 * each carrying enough rows for `computeWindowedScore` to judge comparability
 * (at least `DEFAULT_SCORE_WINDOW_SIZE`, when available — fewer is fine, it
 * just means fewer runs are eligible for the window). An empty array is a
 * caller error, not a valid "no scans yet" state: every caller of this
 * function already knows a completed run exists.
 */
export function resolveGeoScore(runs: readonly GeoScoreRunRow[]): GeoScoreResult {
  if (runs.length === 0) {
    throw new Error("resolveGeoScore: at least one completed run is required");
  }

  const windowRuns: WindowRunInput[] = runs
    .map((row) => readWindowRun(row))
    .filter((row): row is WindowRunInput => row !== null);

  const windowed = computeWindowedScore(windowRuns);
  const reference = runs[0];
  const responseCount = readTotalResults(reference.details_json);

  if (windowed.verdict === "published" && windowed.value !== null) {
    return {
      label: GEO_SCORE_LABEL,
      value: Math.round(windowed.value),
      basis: "window",
      lowConfidence: !hasSufficientSample(responseCount ?? 0),
      runsUsed: windowed.runsUsed
    };
  }

  return {
    label: GEO_SCORE_LABEL,
    value: Math.round(getEffectiveGeoScore(reference)),
    basis: "single_run",
    lowConfidence: !hasSufficientSample(responseCount ?? 0),
    runsUsed: []
  };
}

function readTotalResults(detailsJson: unknown): number | null {
  if (!detailsJson || typeof detailsJson !== "object") return null;
  const value = (detailsJson as Record<string, unknown>).total_results;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// Re-exported so a caller reasoning about `lowConfidence` does not need a
// second import to name the threshold it is testing against.
export { MIN_RESPONSES_FOR_BAND };

// ---------------------------------------------------------------------------
// Percentages — always with their denominator
// ---------------------------------------------------------------------------

/**
 * A percentage that carries the numbers that produced it. `label` is the
 * metric's name; `denominatorLabel` is the fragment every renderer must show
 * beside the percentage — "2 % de respuestas (1/45)", never "2 %" alone.
 */
export type RateMetric = {
  label: string;
  /** Rounded percentage, 0–100. `0` when `denominator` is 0 — never invented. */
  percent: number;
  numerator: number;
  denominator: number;
  /** e.g. "1/45" — always present, even at 0/0. */
  denominatorLabel: string;
};

function rate(label: string, numerator: number, denominator: number): RateMetric {
  const percent = denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
  return { label, percent, numerator, denominator, denominatorLabel: `${numerator}/${denominator}` };
}

/**
 * Mention rate over ANSWERS (prompt × engine rows) — what Overview already
 * measured correctly. Competidores called this same quantity "45 prompts";
 * the audit's P0-02. `answerCount` is `promptCount × engineCount` only when
 * every prompt ran on every engine — pass the real row count, not a product.
 */
export function mentionRateByAnswer(mentionedAnswers: number, answerCount: number): RateMetric {
  return rate("Tasa de mención por respuesta", mentionedAnswers, answerCount);
}

/** Coverage over PROMPTS — the quantity Prompts' own screen measured (1/15). */
export function promptCoverage(promptsWithMention: number, promptCount: number): RateMetric {
  return rate("Cobertura de prompts", promptsWithMention, promptCount);
}

export function citationRate(citedAnswers: number, answerCount: number): RateMetric {
  return rate("Tasa de citas", citedAnswers, answerCount);
}

/**
 * Competidores' "45 prompts" (P0-02): the actual unit is prompt × engine
 * answers, and the label must say so. `promptCount` and `engineCount` are
 * shown separately — "45 respuestas (15 prompts × 3 motores)" — rather than
 * folded into one figure, because collapsing them is exactly what produced
 * the wrong label in the first place.
 */
export function answerCountLabel(promptCount: number, engineCount: number, answerCount: number): string {
  return `${answerCount} respuestas (${promptCount} prompts × ${engineCount} motores)`;
}
