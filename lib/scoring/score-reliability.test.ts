import { describe, expect, it } from "vitest";
import {
  MIN_RESPONSES_FOR_BAND,
  compareRuns,
  computeMentionInterval,
  deltaWithheldReason,
  hasSufficientSample,
  readComparableRun,
  resolveDelta,
  type ComparableRun
} from "@/lib/scoring/score-reliability";

/** A run that is comparable to itself — the baseline every case mutates. */
function run(overrides: Partial<ComparableRun> = {}): ComparableRun {
  return {
    responses: 75,
    compositeVersion: "geo-score-v2",
    inputsUsed: ["presence", "prominence", "standing", "authority"],
    engines: ["gemini", "openai", "claude"],
    ...overrides
  };
}

describe("computeMentionInterval", () => {
  it("does not claim certainty at 100% (the founder's 3-of-3 run)", () => {
    const interval = computeMentionInterval(3, 3);
    expect(interval).not.toBeNull();
    // The normal approximation would return a width of ZERO here — "100%,
    // no margin" from three coin flips. Wilson does not.
    expect(interval!.rate).toBe(100);
    expect(interval!.low).toBeCloseTo(43.9, 1);
    expect(interval!.high).toBe(100);
    expect(interval!.marginPoints).toBeCloseTo(56.1, 1);
  });

  it("does not claim certainty at 0% either", () => {
    const interval = computeMentionInterval(0, 3);
    expect(interval!.rate).toBe(0);
    expect(interval!.low).toBe(0);
    expect(interval!.high).toBeGreaterThan(50);
  });

  it("the two runs behind the +44 pt jump have overlapping intervals", () => {
    // 1 of 3 responses mentioned the brand, then 3 of 3. Rendered as
    // "+66.67 pt" of mention rate and "+44 pt" of GEO score, with no stated
    // uncertainty. The intervals overlap across most of their range: at this
    // sample size the two scans are not distinguishable measurements.
    const before = computeMentionInterval(1, 3)!;
    const after = computeMentionInterval(3, 3)!;
    expect(before.high).toBeGreaterThan(after.low);
  });

  it("tightens as the sample grows", () => {
    const small = computeMentionInterval(5, 10)!;
    const large = computeMentionInterval(150, 300)!;
    expect(small.rate).toBe(large.rate);
    expect(large.marginPoints).toBeLessThan(small.marginPoints / 3);
  });

  it("stays inside [0, 100] and never exceeds the full range", () => {
    for (const n of [1, 2, 3, 7, 10, 75, 300]) {
      for (let k = 0; k <= n; k += 1) {
        const interval = computeMentionInterval(k, n)!;
        expect(interval.low).toBeGreaterThanOrEqual(0);
        expect(interval.high).toBeLessThanOrEqual(100);
        expect(interval.low).toBeLessThanOrEqual(interval.high);
        expect(interval.marginPoints).toBeGreaterThan(0);
      }
    }
  });

  it("clamps nonsensical inputs instead of producing a bogus interval", () => {
    expect(computeMentionInterval(0, 0)).toBeNull();
    expect(computeMentionInterval(5, -1)).toBeNull();
    expect(computeMentionInterval(Number.NaN, 10)).toBeNull();
    // More mentions than responses is impossible; treat as saturated.
    expect(computeMentionInterval(99, 3)!.rate).toBe(100);
  });
});

describe("hasSufficientSample", () => {
  it("rejects the sample sizes where one response outweighs a band boundary", () => {
    expect(hasSufficientSample(3)).toBe(false);
    expect(hasSufficientSample(MIN_RESPONSES_FOR_BAND - 1)).toBe(false);
    expect(hasSufficientSample(MIN_RESPONSES_FOR_BAND)).toBe(true);
    expect(hasSufficientSample(300)).toBe(true);
  });
});

describe("compareRuns", () => {
  it("accepts two runs that measured the same thing", () => {
    expect(compareRuns(run(), run())).toEqual({ comparable: true });
  });

  it("rejects a composite-version step (the v1 -> v2 transition, ADR 0015)", () => {
    const result = compareRuns(run(), run({ compositeVersion: "geo-score-v1" }));
    expect(result.comparable).toBe(false);
  });

  it("rejects a legacy run with no composite at all", () => {
    const result = compareRuns(run(), run({ compositeVersion: null }));
    expect(result.comparable).toBe(false);
  });

  it("rejects a change in which components survived", () => {
    // Reproduced against computeRunScoresFromResults: identical underlying
    // data scores 71.67 with authority present and 84.31 without it.
    const result = compareRuns(run(), run({ inputsUsed: ["presence", "prominence", "standing"] }));
    expect(result.comparable).toBe(false);
  });

  it("ignores the ORDER of components and engines", () => {
    const reordered = run({
      inputsUsed: ["authority", "standing", "prominence", "presence"],
      engines: ["claude", "gemini", "openai"]
    });
    expect(compareRuns(run(), reordered)).toEqual({ comparable: true });
  });

  it("rejects a change in the engine set (a transient provider outage)", () => {
    const result = compareRuns(run(), run({ engines: ["gemini", "openai"] }));
    expect(result.comparable).toBe(false);
  });

  it("rejects a change in the number of responses (prompt added, or partial failure)", () => {
    const result = compareRuns(run(), run({ responses: 72 }));
    expect(result.comparable).toBe(false);
  });

  it("reports the most specific cause first when several differ at once", () => {
    const result = compareRuns(
      run(),
      run({ compositeVersion: "geo-score-v1", engines: ["gemini"], responses: 3 })
    );
    expect(result).toEqual({
      comparable: false,
      reason: "la metodología de puntuación cambió entre estos dos escaneos"
    });
  });
});

describe("readComparableRun", () => {
  it("reads the fingerprint out of a real details_json shape", () => {
    const result = readComparableRun({
      total_results: 75,
      citation_by_provider: {
        gemini: { total: 25, citation_found_count: 4 },
        openai: { total: 25, citation_found_count: 2 },
        claude: { total: 25, citation_found_count: 0 }
      },
      geo_score: {
        score: 61.2,
        composite_version: "geo-score-v2",
        inputs_used: ["presence", "prominence", "standing", "authority"]
      }
    });

    expect(result).toEqual({
      responses: 75,
      compositeVersion: "geo-score-v2",
      inputsUsed: ["presence", "prominence", "standing", "authority"],
      engines: ["gemini", "openai", "claude"]
    });
  });

  it("returns nulls for a legacy run instead of inventing defaults", () => {
    expect(readComparableRun({ total_results: 8 })).toEqual({
      responses: 8,
      compositeVersion: null,
      inputsUsed: null,
      engines: null
    });
  });

  it("survives malformed or absent details_json", () => {
    for (const input of [null, undefined, "nope", 42, {}, { geo_score: "broken" }]) {
      const result = readComparableRun(input);
      expect(result.responses).toBeNull();
      expect(result.compositeVersion).toBeNull();
    }
  });

  it("two legacy runs are NOT treated as comparable just because both are unknown", () => {
    // Both lack a composite; the engine sets are unknown, not equal. Reporting
    // a delta between them would be a guess presented as a measurement.
    const legacy = readComparableRun({ total_results: 12 });
    expect(compareRuns(legacy, legacy).comparable).toBe(false);
  });
});

describe("resolveDelta", () => {
  it("publishes a delta between two comparable, well-sampled runs", () => {
    expect(resolveDelta(12, run(), run())).toEqual({ kind: "publish", value: 12 });
  });

  it("withholds the delta for the founder's 3-response run", () => {
    const tiny = run({ responses: 3 });
    expect(resolveDelta(44, tiny, tiny)).toEqual({ kind: "insufficient_sample", responses: 3 });
  });

  it("checks the sample BEFORE comparability, so the message names the real problem", () => {
    // A 3-response run compared against a differently-shaped one has two
    // problems; the sample size is the one the user can act on (add prompts).
    const result = resolveDelta(44, run({ responses: 3 }), run({ compositeVersion: "geo-score-v1" }));
    expect(result.kind).toBe("insufficient_sample");
  });

  it("withholds the delta across incomparable runs even at a healthy sample", () => {
    const result = resolveDelta(13, run(), run({ engines: ["gemini"] }));
    expect(result.kind).toBe("not_comparable");
  });

  it("treats a missing response count as insufficient rather than assuming", () => {
    expect(resolveDelta(5, run({ responses: null }), run()).kind).toBe("insufficient_sample");
  });
});

describe("deltaWithheldReason (DELTA-GUARD-1)", () => {
  it("distinguishes 'no history' from 'we refuse to compare'", () => {
    // These are genuinely different states and must never collapse into one
    // message: the first is an absence of data, the second is a measurement
    // the product declines to assert.
    expect(deltaWithheldReason(null)).toBe("Sin escaneo anterior con el que comparar");
    expect(deltaWithheldReason({ kind: "not_comparable", reason: "x" })).not.toBe(
      deltaWithheldReason(null)
    );
  });

  it("names the sample size and the bar it has to clear", () => {
    // The founder's motivating run was n=3. The message has to say 3 and say
    // what would unlock the delta, or it is just a shrug.
    const text = deltaWithheldReason({ kind: "insufficient_sample", responses: 3 });
    expect(text).toContain("3 respuestas");
    expect(text).toContain(String(MIN_RESPONSES_FOR_BAND));
  });

  it("says 'respuesta' in singular for a one-response run", () => {
    expect(deltaWithheldReason({ kind: "insufficient_sample", responses: 1 })).toContain(
      "1 respuesta de IA"
    );
  });

  it("carries the comparability reason through verbatim", () => {
    // compareRuns already writes a specific, actionable cause; re-wording it
    // here would let the two layers disagree about what went wrong.
    const reason = "el conjunto de motores de IA cambió entre estos dos escaneos";
    expect(deltaWithheldReason({ kind: "not_comparable", reason })).toContain(reason);
  });

  it("returns nothing to say when the delta IS publishable", () => {
    // Callers render the value in that case; a tooltip explaining a number
    // that is right there would be noise.
    expect(deltaWithheldReason({ kind: "publish", value: 12 })).toBe("");
  });

  it("never returns a phrase that could read as 'no change'", () => {
    // The specific falsehood ADR 0024 exists to prevent: a withheld delta
    // rendered as "— sin cambio" reads as evidence of stability the data does
    // not contain.
    const withheld = [
      deltaWithheldReason(null),
      deltaWithheldReason({ kind: "insufficient_sample", responses: 3 }),
      deltaWithheldReason({ kind: "not_comparable", reason: "la metodología cambió" })
    ];
    for (const text of withheld) {
      expect(text.toLowerCase()).not.toContain("sin cambio");
      expect(text.toLowerCase()).not.toContain("igual");
    }
  });
});
