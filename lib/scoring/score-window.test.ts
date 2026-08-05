import { describe, expect, it } from "vitest";

import {
  computeWindowedScore,
  DEFAULT_SCORE_WINDOW_SIZE,
  isWindowEligible,
  MIN_RUNS_FOR_WINDOW,
  type WindowRunInput
} from "@/lib/scoring/score-window";

function run(overrides: Partial<WindowRunInput> & { run_id: string; score: number }): WindowRunInput {
  return {
    composite_version: "geo-score-v4",
    inputs_used: ["presence", "prominence", "standing", "authority", "technical"],
    total_results: 60,
    finished_at: "2026-08-05T12:00:00.000Z",
    ...overrides
  };
}

describe("computeWindowedScore (GEO-SCORE-V4 Fase D)", () => {
  it("publishes the median of the eligible window", () => {
    const result = computeWindowedScore([
      run({ run_id: "c", score: 70, finished_at: "2026-08-05T12:00:00.000Z" }),
      run({ run_id: "b", score: 40, finished_at: "2026-08-04T12:00:00.000Z" }),
      run({ run_id: "a", score: 60, finished_at: "2026-08-03T12:00:00.000Z" })
    ]);

    expect(result.verdict).toBe("published");
    expect(result.value).toBe(60);
    expect(result.runsUsed).toEqual(["c", "b", "a"]);
    expect(result.latest).toBe(70);
  });

  it("ignores a single anomalous run — the whole point of a median", () => {
    // One run where a provider had a bad hour must not drag the headline.
    const withOutlier = computeWindowedScore([
      run({ run_id: "c", score: 68, finished_at: "2026-08-05T12:00:00.000Z" }),
      run({ run_id: "b", score: 12, finished_at: "2026-08-04T12:00:00.000Z" }),
      run({ run_id: "a", score: 71, finished_at: "2026-08-03T12:00:00.000Z" })
    ]);

    expect(withOutlier.value).toBe(68);
    // The raw latest score is still available, never hidden.
    expect(withOutlier.latest).toBe(68);
  });

  it("still moves when the change is sustained rather than a one-off", () => {
    const sustained = computeWindowedScore([
      run({ run_id: "c", score: 30, finished_at: "2026-08-05T12:00:00.000Z" }),
      run({ run_id: "b", score: 32, finished_at: "2026-08-04T12:00:00.000Z" }),
      run({ run_id: "a", score: 70, finished_at: "2026-08-03T12:00:00.000Z" })
    ]);

    expect(sustained.value).toBe(32);
  });

  it("never mixes composite versions", () => {
    // A recalibration bumps the version precisely so nothing crosses it
    // (docs/adr/0031). A window that averaged across it would launder exactly
    // the incomparability the version bump exists to declare.
    const result = computeWindowedScore([
      run({ run_id: "new", score: 70, finished_at: "2026-08-05T12:00:00.000Z" }),
      run({ run_id: "old-1", score: 40, composite_version: "geo-score-v3", finished_at: "2026-08-04T12:00:00.000Z" }),
      run({ run_id: "old-2", score: 41, composite_version: "geo-score-v3", finished_at: "2026-08-03T12:00:00.000Z" })
    ]);

    expect(result.verdict).toBe("not_comparable");
    expect(result.value).toBeNull();
    expect(result.latest).toBe(70);
  });

  it("never mixes runs that measured different components", () => {
    const result = computeWindowedScore([
      run({ run_id: "four", score: 70, finished_at: "2026-08-05T12:00:00.000Z" }),
      run({ run_id: "two", score: 90, inputs_used: ["presence", "authority"], finished_at: "2026-08-04T12:00:00.000Z" })
    ]);

    expect(result.verdict).toBe("not_comparable");
  });

  it("never mixes wildly different sample sizes", () => {
    const result = computeWindowedScore([
      run({ run_id: "big", score: 70, total_results: 60, finished_at: "2026-08-05T12:00:00.000Z" }),
      run({ run_id: "tiny", score: 30, total_results: 3, finished_at: "2026-08-04T12:00:00.000Z" })
    ]);

    expect(result.verdict).toBe("not_comparable");
  });

  it("distinguishes 'not enough runs yet' from 'runs exist but are incomparable'", () => {
    const firstScan = computeWindowedScore([run({ run_id: "only", score: 55 })]);
    expect(firstScan.verdict).toBe("insufficient_runs");
    expect(firstScan.latest).toBe(55);

    const noRuns = computeWindowedScore([]);
    expect(noRuns.verdict).toBe("insufficient_runs");
    expect(noRuns.latest).toBeNull();
  });

  it("caps the window at its size, newest first", () => {
    const result = computeWindowedScore(
      Array.from({ length: 6 }, (_, i) =>
        run({ run_id: `r${i}`, score: 50 + i, finished_at: `2026-08-0${i + 1}T12:00:00.000Z` })
      )
    );

    expect(result.runsUsed).toHaveLength(DEFAULT_SCORE_WINDOW_SIZE);
    expect(result.runsUsed[0]).toBe("r5");
  });

  it("orders by finish time, not by input order or by score", () => {
    const result = computeWindowedScore([
      run({ run_id: "oldest", score: 10, finished_at: "2026-08-01T12:00:00.000Z" }),
      run({ run_id: "newest", score: 90, finished_at: "2026-08-09T12:00:00.000Z" }),
      run({ run_id: "middle", score: 50, finished_at: "2026-08-05T12:00:00.000Z" })
    ]);

    expect(result.latest).toBe(90);
    expect(result.runsUsed[0]).toBe("newest");
  });

  it("requires at least MIN_RUNS_FOR_WINDOW to call anything a window", () => {
    expect(MIN_RUNS_FOR_WINDOW).toBeGreaterThan(1);
  });
});

describe("isWindowEligible", () => {
  const reference = run({ run_id: "ref", score: 70, total_results: 60 });

  it("accepts a moderate sample-size difference", () => {
    expect(isWindowEligible(run({ run_id: "x", score: 60, total_results: 45 }), reference)).toBe(true);
  });

  it("rejects a run whose components are unknown", () => {
    expect(isWindowEligible(run({ run_id: "x", score: 60, inputs_used: null }), reference)).toBe(false);
  });

  it("rejects a run with no responses", () => {
    expect(isWindowEligible(run({ run_id: "x", score: 60, total_results: 0 }), reference)).toBe(false);
  });
});
