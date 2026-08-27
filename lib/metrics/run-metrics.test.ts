import { describe, expect, it } from "vitest";

import {
  answerCountLabel,
  citationRate,
  GEO_SCORE_LABEL,
  mentionRateByAnswer,
  MIN_RESPONSES_FOR_BAND,
  promptCoverage,
  resolveGeoScore,
  type GeoScoreRunRow
} from "@/lib/metrics/run-metrics";

function run(input: {
  runId: string;
  createdAt: string;
  score: number;
  totalResults: number;
  compositeVersion?: string;
  inputsUsed?: string[];
  visibilityScore?: number;
}): GeoScoreRunRow {
  const {
    runId,
    createdAt,
    score,
    totalResults,
    compositeVersion = "v4",
    inputsUsed = ["visibility", "citation", "competitor"],
    visibilityScore
  } = input;
  return {
    run_id: runId,
    created_at: createdAt,
    visibility_score: visibilityScore ?? score,
    details_json: {
      total_results: totalResults,
      geo_score: { score, composite_version: compositeVersion, inputs_used: inputsUsed }
    }
  };
}

describe("resolveGeoScore", () => {
  it("throws on an empty run list — never a silent 0", () => {
    expect(() => resolveGeoScore([])).toThrow();
  });

  it("falls back to the single run's own composite with basis 'single_run' below MIN_RUNS_FOR_WINDOW", () => {
    const result = resolveGeoScore([run({ runId: "r1", createdAt: "2026-08-20T00:00:00Z", score: 6, totalResults: 45 })]);
    expect(result.basis).toBe("single_run");
    expect(result.value).toBe(6);
    expect(result.label).toBe(GEO_SCORE_LABEL);
    expect(result.runsUsed).toEqual([]);
  });

  it("publishes the window median across ≥2 comparable runs, newest-first input", () => {
    const runs = [
      run({ runId: "r2", createdAt: "2026-08-22T00:00:00Z", score: 10, totalResults: 45 }),
      run({ runId: "r1", createdAt: "2026-08-20T00:00:00Z", score: 6, totalResults: 45 })
    ];
    const result = resolveGeoScore(runs);
    expect(result.basis).toBe("window");
    expect(result.runsUsed.length).toBe(2);
    expect(result.value).toBe(8); // median(10, 6)
  });

  /**
   * The exact bug the audit found: `visibility_score` and the composite
   * diverge, and only the composite (via the window) may be labelled
   * "Puntuación GEO".
   */
  it("NEVER returns visibility_score's raw value when it differs from the composite", () => {
    const result = resolveGeoScore([
      run({ runId: "r1", createdAt: "2026-08-20T00:00:00Z", score: 6, totalResults: 45, visibilityScore: 2 })
    ]);
    expect(result.value).toBe(6);
    expect(result.value).not.toBe(2);
  });

  it("does not fold an incomparable run (different composite_version) into the window", () => {
    const runs = [
      run({ runId: "r2", createdAt: "2026-08-22T00:00:00Z", score: 40, totalResults: 45, compositeVersion: "v5" }),
      run({ runId: "r1", createdAt: "2026-08-20T00:00:00Z", score: 6, totalResults: 45, compositeVersion: "v4" })
    ];
    const result = resolveGeoScore(runs);
    expect(result.basis).toBe("single_run");
    expect(result.value).toBe(40); // the reference run's own composite
  });

  it("flags lowConfidence below MIN_RESPONSES_FOR_BAND, and not above it", () => {
    const low = resolveGeoScore([
      run({ runId: "r1", createdAt: "2026-08-20T00:00:00Z", score: 6, totalResults: MIN_RESPONSES_FOR_BAND - 1 })
    ]);
    const high = resolveGeoScore([
      run({ runId: "r1", createdAt: "2026-08-20T00:00:00Z", score: 6, totalResults: MIN_RESPONSES_FOR_BAND })
    ]);
    expect(low.lowConfidence).toBe(true);
    expect(high.lowConfidence).toBe(false);
  });
});

describe("percentage helpers — always carry their denominator", () => {
  it("mentionRateByAnswer: the auditor's 1/45 (2%), not 1/15", () => {
    const result = mentionRateByAnswer(1, 45);
    expect(result.percent).toBe(2);
    expect(result.denominatorLabel).toBe("1/45");
  });

  it("promptCoverage: the same mention as a fraction of PROMPTS, not answers — 1/15 (7%)", () => {
    const result = promptCoverage(1, 15);
    expect(result.percent).toBe(7);
    expect(result.denominatorLabel).toBe("1/15");
  });

  it("citationRate at 0 denominator never divides by zero or invents a percent", () => {
    const result = citationRate(0, 0);
    expect(result.percent).toBe(0);
    expect(result.denominatorLabel).toBe("0/0");
  });

  it("rounds down/up like the rest of the product (Math.round)", () => {
    expect(mentionRateByAnswer(1, 3).percent).toBe(33);
    expect(mentionRateByAnswer(2, 3).percent).toBe(67);
  });
});

describe("answerCountLabel — P0-02", () => {
  it("never calls prompt×engine rows 'prompts'", () => {
    const label = answerCountLabel(15, 3, 45);
    expect(label).toBe("45 respuestas (15 prompts × 3 motores)");
    expect(label).not.toMatch(/^45 prompts/);
  });
});
