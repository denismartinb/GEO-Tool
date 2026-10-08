import {
  resolveDelta,
  type ComparableRun,
  type DeltaVerdict
} from "@/lib/scoring/score-reliability";
import { computeWindowedScore, computeWindowedSeries, type WindowRunInput } from "@/lib/scoring/score-window";

/**
 * What the Overview gauge shows, decided in one place so it can be tested
 * against real run data instead of read off a page component.
 *
 * Extracted verbatim from `app/dashboard/projects/[projectId]/page.tsx`
 * (SCORE-WINDOW-1 / GEO-SCORE-RELIABILITY-1) when MEASUREMENT-BASIS-1 needed
 * the reason a median was withheld to reach the screen. The rules are
 * unchanged; the new output is `withheldReason`.
 *
 * The invariant this module exists to keep visible: when the window cannot
 * publish — because the model, the questions, the engines or the web-search
 * mode differ between scans — ONLY the median and the variation go away. The
 * latest scan's own score stays on screen, and the reason is stated.
 */
export type GaugeHeadline = {
  /** The number the gauge shows: the window when it exists, the latest scan otherwise. */
  score: number;
  /** True when `score` is the windowed median. */
  windowPublished: boolean;
  /** The series the sparkline plots, in the same unit as `score`. */
  trend: number[];
  /** Verdict for the "vs. escaneo anterior" delta; null when there is nothing to compare. */
  deltaVerdict: DeltaVerdict | null;
  /**
   * Why the headline is the latest scan and not a median, or why its variation
   * is absent, when the cause is that two scans did not measure the same
   * thing. Null when nothing was withheld for that reason.
   */
  withheldReason: string | null;
};

export function resolveGaugeHeadline(input: {
  /** Newest-last, as the page reads them. */
  windowRuns: readonly WindowRunInput[];
  /** The latest scan's own composite, rounded. */
  perRunScore: number;
  /** One rounded composite per scan, oldest first. */
  perRunTrend: readonly number[];
  currentRun: ComparableRun;
  previousRun: ComparableRun | null;
}): GaugeHeadline {
  const { windowRuns, perRunScore, perRunTrend, currentRun, previousRun } = input;

  const window = computeWindowedScore(windowRuns);
  const windowPublished = window.verdict === "published" && window.value !== null;
  const score = windowPublished ? Math.round(window.value as number) : perRunScore;

  // The sparkline must plot the same quantity as the gauge above it. Gaps
  // (null) stay gaps — never zeroes.
  const trend = windowPublished
    ? computeWindowedSeries(windowRuns)
        .filter((value): value is number => value !== null)
        .map((value) => Math.round(value))
    : [...perRunTrend];

  // Window-over-window, not window-minus-run: subtracting last scan's raw
  // score from this window's median would compare two different quantities
  // and call the difference a change.
  const previousWindow = computeWindowedScore(windowRuns.slice(0, -1));
  const delta = windowPublished
    ? previousWindow.verdict === "published" && previousWindow.value !== null
      ? Math.round(window.value as number) - Math.round(previousWindow.value)
      : 0
    : perRunTrend.length >= 2
      ? score - perRunTrend[perRunTrend.length - 2]
      : 0;

  const deltaVerdict: DeltaVerdict | null =
    trend.length >= 2 && previousRun ? resolveDelta(delta, currentRun, previousRun) : null;

  const withheldReason =
    window.verdict === "not_comparable" && window.reason
      ? window.reason
      : deltaVerdict?.kind === "not_comparable"
        ? deltaVerdict.reason
        : null;

  return { score, windowPublished, trend, deltaVerdict, withheldReason };
}
