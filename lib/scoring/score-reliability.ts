/**
 * GEO-SCORE-RELIABILITY-1 (Fase 0 de la auditoría de variabilidad, agosto 2026).
 *
 * Pure, dependency-free reliability layer over an already-computed run score.
 * This module deliberately does NOT change any score: it answers two
 * questions the product was previously answering by omission, and answering
 * wrong.
 *
 *   1. "How precise is this number?" — a GEO score computed over 3 AI
 *      responses and one computed over 300 were rendered identically, with
 *      the same integer, the same qualitative band and the same "+N pt"
 *      delta. See `computeMentionInterval` / `MIN_RESPONSES_FOR_BAND`.
 *   2. "Are these two runs even comparable?" — the Overview's delta
 *      subtracted two consecutive `run_scores` rows with no check that they
 *      measure the same thing. See `compareRuns`.
 *
 * Motivating incident (2026-08-02): a project with ONE prompt scanned across
 * three engines — 3 AI responses total — moved 44 GEO points between two
 * consecutive scans with no user action. Reproduced exactly against
 * `computeRunScoresFromResults`: at n=3 a single response is worth ~24 GEO
 * points, and the run's mention rate went 1/3 -> 3/3.
 *
 * Scope boundary, stated explicitly because it matters: this layer makes the
 * product honest about precision. It does NOT make the underlying
 * measurement correct, and it would NOT have suppressed that particular
 * +44 — the root cause there is brand identity (the AI recommended
 * "Firefox" while the tracked brand string was "Mozilla"), which is a
 * separate phase. What this layer does catch: deltas across incomparable
 * runs, qualitative bands asserted over samples too small to support them,
 * and the absence of any stated margin of error.
 */

import { wilsonInterval } from "@/lib/stats/wilson";

/**
 * Minimum number of AI responses (prompt × engine rows, NOT prompts) before
 * the Overview publishes the qualitative band ("Franja «competitivo»") or a
 * "vs. escaneo anterior" delta for the GEO score.
 *
 * Set to 10 because below it a single AI response is worth ≥10 points of
 * mention rate — and the mention rate transfers into the composite at a
 * measured ~0.71x (presence carries weight .40, but `prominence` penalizes
 * unmentioned prompts with position N+1 and `standing`'s numerator is the
 * brand mention count, so three of the four components move together). A
 * band boundary at 70/40 cannot be asserted when one response moves the
 * score by more than 7 points.
 *
 * This is a floor for *display of derived claims*, not for the score itself:
 * the score is always shown, because suppressing it entirely would hide real
 * evidence the user paid for. What gets withheld is the interpretation.
 */
export const MIN_RESPONSES_FOR_BAND = 10;

export type MentionInterval = {
  /** Point estimate, 0–100, as already shown in the UI. */
  rate: number;
  /** Wilson lower bound, 0–100. */
  low: number;
  /** Wilson upper bound, 0–100. */
  high: number;
  /**
   * Single "±" figure for compact display, in percentage points: the LARGER
   * of the two half-widths, since the Wilson interval is asymmetric near 0%
   * and 100%. Conservative on purpose — a margin shown smaller than it is
   * would be the same false precision this module exists to remove.
   */
  marginPoints: number;
  /** Responses the interval is computed over (prompt × engine rows). */
  responses: number;
};

/**
 * Wilson score interval (`lib/stats/wilson.ts`) for the brand mention rate,
 * expressed in percentage points for display. The choice of Wilson matters
 * most exactly here: the founder's motivating run was literally 3 of 3, where
 * the textbook normal interval would report a width of zero — "100%, no
 * margin" from three coin flips.
 *
 * Returns null for n = 0: there is no interval around no data.
 */
export function computeMentionInterval(mentions: number, responses: number): MentionInterval | null {
  const interval = wilsonInterval(mentions, responses);
  if (!interval) return null;

  const n = Math.floor(responses);
  const k = Math.min(Math.max(Math.floor(mentions), 0), n);

  const round1 = (x: number) => Number((x * 100).toFixed(1));
  const rate = round1(k / n);
  const lowPct = round1(interval.low);
  const highPct = round1(interval.high);

  return {
    rate,
    low: lowPct,
    high: highPct,
    marginPoints: Number(Math.max(rate - lowPct, highPct - rate).toFixed(1)),
    responses: n
  };
}

/** True when the run has enough responses to support a band / delta claim. */
export function hasSufficientSample(responses: number): boolean {
  return Number.isFinite(responses) && responses >= MIN_RESPONSES_FOR_BAND;
}

/**
 * The subset of a persisted `run_scores` row this module needs. Everything
 * here already exists in `details_json` (written by
 * `computeRunScoresFromResults`) — no schema change, no migration, no
 * backfill. Legacy runs simply have fields missing, which `compareRuns`
 * treats as "unknown", never as "equal".
 */
export type ComparableRun = {
  /** `details_json.total_results` — prompt × engine rows scored. */
  responses: number | null;
  /** `details_json.geo_score.composite_version`, absent on pre-composite runs. */
  compositeVersion: string | null;
  /** `details_json.geo_score.inputs_used` — which components survived. */
  inputsUsed: readonly string[] | null;
  /** Providers present in the run, from `details_json.citation_by_provider`. */
  engines: readonly string[] | null;
};

/**
 * Reads the comparability fingerprint out of a persisted
 * `run_scores.details_json`, defensively. Every field is optional by design:
 * pre-composite and pre-multi-engine runs genuinely lack them, and the honest
 * representation of "this run never recorded which engines it used" is
 * `null` — which `compareRuns` then treats as different-from-anything rather
 * than silently equal. Guessing a default here would manufacture exactly the
 * false equivalence this module exists to prevent.
 */
export function readComparableRun(detailsJson: unknown): ComparableRun {
  const details =
    detailsJson && typeof detailsJson === "object" ? (detailsJson as Record<string, unknown>) : {};

  const geoScore =
    details.geo_score && typeof details.geo_score === "object"
      ? (details.geo_score as Record<string, unknown>)
      : null;

  const inputsUsed = Array.isArray(geoScore?.inputs_used)
    ? (geoScore.inputs_used as unknown[]).filter((v): v is string => typeof v === "string")
    : null;

  const citationByProvider =
    details.citation_by_provider && typeof details.citation_by_provider === "object"
      ? (details.citation_by_provider as Record<string, unknown>)
      : null;

  return {
    responses: typeof details.total_results === "number" ? details.total_results : null,
    compositeVersion:
      typeof geoScore?.composite_version === "string" ? (geoScore.composite_version as string) : null,
    inputsUsed,
    engines: citationByProvider ? Object.keys(citationByProvider) : null
  };
}

export type RunComparison =
  | { comparable: true }
  | { comparable: false; reason: string };

function sortedKey(values: readonly string[] | null): string | null {
  if (!values) return null;
  return [...values].sort().join(",");
}

/**
 * Decides whether a "vs. escaneo anterior" delta between two runs describes
 * a real change in the brand's visibility, or an artefact of the two runs
 * measuring different things.
 *
 * Every rule here corresponds to a discontinuity reproduced against the real
 * scoring function:
 *
 * - **Different `composite_version`** — the v1→v2 transition changed what
 *   `standing` means (ADR 0015). `lib/scan/score-alert.ts` already refuses to
 *   compare across versions for the email alert; the Overview did not, so the
 *   same step that was deliberately suppressed in email was rendered as a
 *   real delta on screen.
 * - **Different `inputs_used`** — absent components are dropped and the
 *   remaining weights renormalized (ADR 0008 §3). A run scored on
 *   presence+prominence+standing+authority and one scored on
 *   presence+prominence+standing are on different scales: with identical
 *   underlying data, dropping `authority` alone moved a reproduced run from
 *   71.67 to 84.31.
 * - **Different engine set** — a prompt job succeeds if *at least one* engine
 *   returns (`lib/scan/executor.ts`), so a transient provider outage silently
 *   rescopes the whole measurement. Engines differ systematically: ungrounded
 *   ones can never contribute citation evidence (ADR 0012).
 * - **Different response count** — the prompt set changed, or an engine
 *   partially failed. Either way the two scores are computed over different
 *   samples.
 *
 * Order matters only for the quality of the message shown to the user: the
 * most specific, most actionable cause is reported first.
 */
export function compareRuns(current: ComparableRun, previous: ComparableRun): RunComparison {
  // Unknown is not "equal". A run that never recorded its composite version,
  // its surviving components or its engine set cannot be shown to measure the
  // same thing as another — and two runs that are BOTH unknown are not
  // thereby comparable, they are two unverifiable measurements. Checked first
  // and explicitly, because the field-by-field equality below would otherwise
  // read `null === null` as a match and publish a delta on no evidence.
  const unknown = (run: ComparableRun) =>
    run.responses === null || run.compositeVersion === null || run.inputsUsed === null || run.engines === null;

  if (unknown(current) || unknown(previous)) {
    return {
      comparable: false,
      reason: "uno de los escaneos no registró con qué configuración se midió"
    };
  }

  if (
    current.compositeVersion !== previous.compositeVersion &&
    (current.compositeVersion !== null || previous.compositeVersion !== null)
  ) {
    return {
      comparable: false,
      reason: "la metodología de puntuación cambió entre estos dos escaneos"
    };
  }

  const currentInputs = sortedKey(current.inputsUsed);
  const previousInputs = sortedKey(previous.inputsUsed);
  if (currentInputs !== previousInputs) {
    return {
      comparable: false,
      reason: "estos dos escaneos no pudieron medir los mismos componentes del score"
    };
  }

  const currentEngines = sortedKey(current.engines);
  const previousEngines = sortedKey(previous.engines);
  if (currentEngines !== previousEngines) {
    return {
      comparable: false,
      reason: "el conjunto de motores de IA cambió entre estos dos escaneos"
    };
  }

  if (current.responses !== previous.responses) {
    return {
      comparable: false,
      reason: "el número de respuestas analizadas cambió entre estos dos escaneos"
    };
  }

  return { comparable: true };
}

export type DeltaVerdict =
  | { kind: "publish"; value: number }
  | { kind: "insufficient_sample"; responses: number }
  | { kind: "not_comparable"; reason: string };

/**
 * Single decision point for every "vs. escaneo anterior" delta on the
 * Overview, so the gauge and the KPI cards cannot drift apart in what they
 * are willing to assert.
 *
 * Returns the delta only when both runs carry enough responses to support the
 * claim AND measure the same thing. Callers render the other two cases as an
 * explicit, honest absence — never as "— sin cambio", which would read as
 * evidence of stability the data does not contain.
 */
/**
 * The one-line explanation for a delta this layer refuses to publish, for use
 * as a tooltip where the withheld state renders as an em dash (DELTA-GUARD-1).
 *
 * Lives here, next to the verdicts, because the wording is part of the claim:
 * a caller that invented its own phrasing could describe "we cannot compare
 * these two runs" as "no change", which is the specific falsehood this whole
 * module exists to prevent. `null` (no previous run at all) is a genuine
 * absence of history, not a withheld comparison, and says so.
 */
export function deltaWithheldReason(verdict: DeltaVerdict | null): string {
  if (!verdict) return "Sin escaneo anterior con el que comparar";

  switch (verdict.kind) {
    case "publish":
      // Callers render the value in this case; a reason would be meaningless.
      return "";
    case "insufficient_sample":
      return `Muestra insuficiente para afirmar un cambio: ${verdict.responses} ${
        verdict.responses === 1 ? "respuesta" : "respuestas"
      } de IA (hacen falta ${MIN_RESPONSES_FOR_BAND})`;
    case "not_comparable":
      return `Sin comparación fiable: ${verdict.reason}`;
  }
}

export function resolveDelta(
  value: number,
  current: ComparableRun,
  previous: ComparableRun
): DeltaVerdict {
  const responses = current.responses ?? 0;
  if (!hasSufficientSample(responses)) {
    return { kind: "insufficient_sample", responses };
  }

  const comparison = compareRuns(current, previous);
  if (!comparison.comparable) {
    return { kind: "not_comparable", reason: comparison.reason };
  }

  return { kind: "publish", value };
}
