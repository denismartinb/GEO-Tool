/**
 * GEO-SCORE-V4 Fase D — the windowed score.
 *
 * Pure and dependency-free, same contract as `lib/scan/sampling.ts` and
 * `lib/scoring/score-reliability.ts`: no database, no clock, no I/O.
 *
 * WHAT THIS IS FOR. Fases A–C attack variance that has a cause we can remove:
 * a wrong alias, too small a sample, a silent engine outage, a component
 * flickering in and out. One source is left over that no formula can remove,
 * and it is worth naming precisely rather than pretending otherwise: the
 * engines run live retrieval. `temperature: 0` is pinned on all three
 * providers (ADR 0009 addendum) but temperature does not control what Google
 * Search or OpenAI's `web_search` return on any given call, so two identical
 * scans genuinely see a different internet
 * (docs/geo-score-variability-2026-08.md §2, "Causas secundarias").
 *
 * Against irreducible per-observation noise the only honest instrument is to
 * stop treating one observation as the answer. A window over the last K
 * comparable runs is the same move `computeMentionInterval` already makes for
 * precision, applied to the point estimate itself.
 *
 * WHY THE MEDIAN, not the mean. One anomalous run — a provider having a bad
 * hour, a grounding result that briefly stopped naming the brand — pulls a
 * 3-run mean by a third of its own error. The median ignores it entirely
 * unless it is sustained, which is exactly the behaviour wanted: react to
 * change, not to noise. The cost, stated because it is real: a genuine step
 * change takes ceil(K/2) runs to fully move the windowed figure.
 *
 * WHAT THIS MODULE REFUSES TO DO. It never mixes runs that
 * `lib/scoring/score-reliability.ts` would refuse to compare. A window that
 * silently averaged a v3 score with a v4 score, or a 3-response run with a
 * 300-response one, would launder exactly the incomparability ADR 0024 exists
 * to surface — and it would do it inside a number presented as more reliable
 * than the individual scores. The eligibility rules here are deliberately
 * stricter than "recent".
 */

/** Runs considered for the window, newest first. */
export const DEFAULT_SCORE_WINDOW_SIZE = 3;

/**
 * Minimum eligible runs before a windowed figure may be published at all.
 *
 * Two, not one: a "window" over a single run is that run, and presenting it
 * as a stabilised figure would claim a property it does not have.
 */
export const MIN_RUNS_FOR_WINDOW = 2;

export type WindowRunInput = {
  run_id: string;
  /** The run's own composite score, 0–100. */
  score: number;
  /** `geo_score.composite_version` — runs from different versions never mix. */
  composite_version: string | null;
  /** `geo_score.inputs_used` — a 4-component and a 2-component score are not the same measurement. */
  inputs_used: readonly string[] | null;
  /** `details_json.total_results` — the AI responses the score was computed over. */
  total_results: number | null;
  /** When the run finished, for ordering. ISO string. */
  finished_at: string | null;
};

export type WindowedScoreVerdict =
  /** A windowed figure was computed. */
  | "published"
  /** Not enough eligible runs yet. */
  | "insufficient_runs"
  /** There are runs, but none comparable to the most recent one. */
  | "not_comparable";

export type WindowedScore = {
  verdict: WindowedScoreVerdict;
  /** The windowed figure, 0–100, or null unless verdict is "published". */
  value: number | null;
  /** Run ids actually folded into the figure, newest first. */
  runsUsed: string[];
  /** The per-run score of the most recent eligible run, always available for display beside the window. */
  latest: number | null;
  /** Requested window size. */
  windowSize: number;
};

function sameInputs(a: readonly string[] | null, b: readonly string[] | null): boolean {
  // Unknown is never treated as equal — the same rule compareRuns applies
  // (docs/adr/0024). A missing inputs_used means we cannot show the two runs
  // measured the same components, not that they did.
  if (!a || !b) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * Whether a run may be folded into the same window as the reference run.
 *
 * `sampleTolerance` bounds how much the response count may differ. A run over
 * 60 responses and one over 12 have very different precision; averaging them
 * hides that under one number. 0.5 means "within half an order of the
 * reference", generous enough to survive a prompt being paused, strict enough
 * to exclude a plan change or a half-failed run.
 */
export function isWindowEligible(
  candidate: WindowRunInput,
  reference: WindowRunInput,
  sampleTolerance = 0.5
): boolean {
  if (!Number.isFinite(candidate.score)) return false;
  if (candidate.composite_version !== reference.composite_version) return false;
  if (!sameInputs(candidate.inputs_used, reference.inputs_used)) return false;

  const candidateN = candidate.total_results ?? 0;
  const referenceN = reference.total_results ?? 0;
  if (candidateN <= 0 || referenceN <= 0) return false;

  const ratio = candidateN / referenceN;
  return ratio >= 1 - sampleTolerance && ratio <= 1 / (1 - sampleTolerance);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Computes the windowed GEO score from a project's recent runs.
 *
 * `runs` may be in any order; the most recent by `finished_at` becomes the
 * reference every other run is judged comparable against. Runs are never
 * re-ordered by score — that would make the median a rank statistic over a
 * set chosen by its own values.
 */
export function computeWindowedScore(
  runs: readonly WindowRunInput[],
  options?: { windowSize?: number; sampleTolerance?: number }
): WindowedScore {
  const windowSize = options?.windowSize ?? DEFAULT_SCORE_WINDOW_SIZE;

  const ordered = [...runs]
    .filter((run) => Number.isFinite(run.score))
    .sort((a, b) => {
      const left = a.finished_at ? Date.parse(a.finished_at) : 0;
      const right = b.finished_at ? Date.parse(b.finished_at) : 0;
      return right - left;
    });

  if (ordered.length === 0) {
    return { verdict: "insufficient_runs", value: null, runsUsed: [], latest: null, windowSize };
  }

  const reference = ordered[0];
  const eligible = ordered
    .filter((run) => isWindowEligible(run, reference, options?.sampleTolerance))
    .slice(0, windowSize);

  if (eligible.length < MIN_RUNS_FOR_WINDOW) {
    return {
      // "Not comparable" and "not enough yet" are different facts and the UI
      // says different things about them: one resolves by scanning again, the
      // other by the user changing something back.
      verdict: ordered.length >= MIN_RUNS_FOR_WINDOW ? "not_comparable" : "insufficient_runs",
      value: null,
      runsUsed: [],
      latest: reference.score,
      windowSize
    };
  }

  return {
    verdict: "published",
    value: Number(median(eligible.map((run) => run.score)).toFixed(2)),
    runsUsed: eligible.map((run) => run.run_id),
    latest: reference.score,
    windowSize
  };
}

/**
 * The windowed value at every point of a run history, aligned index-for-index
 * with the input.
 *
 * Exists so the headline figure and the sparkline under it cannot tell
 * different stories. A gauge showing a stabilised median above a line drawn
 * from raw per-run scores would look, correctly, like two different metrics —
 * and the user would have no way to tell which one the number belongs to.
 *
 * `runs` must be in chronological order (oldest first). Each position looks
 * back over at most `windowSize` runs ending at that position; positions with
 * no publishable window get `null`, which callers render as a gap rather than
 * as a zero.
 */
export function computeWindowedSeries(
  runs: readonly WindowRunInput[],
  options?: { windowSize?: number; sampleTolerance?: number }
): Array<number | null> {
  const windowSize = options?.windowSize ?? DEFAULT_SCORE_WINDOW_SIZE;

  return runs.map((_, index) => {
    const slice = runs.slice(Math.max(0, index - windowSize + 1), index + 1);
    const windowed = computeWindowedScore(slice, options);
    return windowed.verdict === "published" ? windowed.value : null;
  });
}

/**
 * Reads a persisted `run_scores` row into the shape the window needs.
 *
 * Kept here, next to the eligibility rules it feeds, so a caller cannot get
 * the mapping subtly wrong — reading `inputs_used` from the wrong nesting or
 * defaulting a missing `composite_version` to something truthy would silently
 * let incomparable runs into the same median, which is the one thing this
 * module exists to prevent.
 */
export function readWindowRun(row: {
  run_id?: string | null;
  created_at?: string | null;
  details_json?: unknown;
}): WindowRunInput | null {
  const details = row.details_json;
  if (!details || typeof details !== "object") return null;
  const record = details as Record<string, unknown>;
  const geoScore = record.geo_score;
  if (!geoScore || typeof geoScore !== "object") return null;

  const geo = geoScore as Record<string, unknown>;
  const score = geo.score;
  if (typeof score !== "number" || !Number.isFinite(score)) return null;

  const inputsUsed = Array.isArray(geo.inputs_used)
    ? (geo.inputs_used as unknown[]).filter((value): value is string => typeof value === "string")
    : null;
  const totalResults = record.total_results;

  return {
    run_id: typeof row.run_id === "string" ? row.run_id : (row.created_at ?? ""),
    score,
    composite_version: typeof geo.composite_version === "string" ? geo.composite_version : null,
    inputs_used: inputsUsed,
    total_results: typeof totalResults === "number" ? totalResults : null,
    finished_at: row.created_at ?? null
  };
}
