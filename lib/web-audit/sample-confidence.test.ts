import { describe, expect, it } from "vitest";
import { computeSampleConfidence, isDeltaTrustworthy, SMALL_SAMPLE_THRESHOLD } from "@/lib/web-audit/sample-confidence";

describe("computeSampleConfidence", () => {
  it("returns null for zero trials — no interval over an empty sample", () => {
    expect(computeSampleConfidence(0, 0)).toBeNull();
  });

  it("widens the interval for a small sample and flags it as small", () => {
    // 2/3 — a tiny sample, wide interval, clearly flagged.
    const result = computeSampleConfidence(2, 3);
    expect(result).not.toBeNull();
    expect(result!.isSmallSample).toBe(true);
    expect(result!.lowerPct).toBeLessThan(50);
    expect(result!.upperPct).toBeGreaterThan(80);
  });

  it("narrows the interval and stops flagging as small once trials clears the threshold", () => {
    // 50/100 — plenty of trials, tight interval around 50%.
    const result = computeSampleConfidence(50, 100);
    expect(result!.isSmallSample).toBe(false);
    expect(result!.lowerPct).toBeGreaterThan(39);
    expect(result!.upperPct).toBeLessThan(61);
  });

  it("never returns a bound outside [0, 100]", () => {
    const allZero = computeSampleConfidence(0, 4);
    expect(allZero!.lowerPct).toBeGreaterThanOrEqual(0);
    expect(allZero!.upperPct).toBeLessThanOrEqual(100);

    const allOnes = computeSampleConfidence(4, 4);
    expect(allOnes!.lowerPct).toBeGreaterThanOrEqual(0);
    expect(allOnes!.upperPct).toBeLessThanOrEqual(100);
  });

  it("flags exactly at the SMALL_SAMPLE_THRESHOLD boundary", () => {
    const belowThreshold = computeSampleConfidence(2, SMALL_SAMPLE_THRESHOLD - 1);
    expect(belowThreshold!.isSmallSample).toBe(true);

    const atThreshold = computeSampleConfidence(2, SMALL_SAMPLE_THRESHOLD);
    expect(atThreshold!.isSmallSample).toBe(false);
  });
});

describe("isDeltaTrustworthy", () => {
  it("is untrustworthy when either side is a small sample", () => {
    expect(isDeltaTrustworthy(2, 10)).toBe(false);
    expect(isDeltaTrustworthy(10, 2)).toBe(false);
    expect(isDeltaTrustworthy(2, 2)).toBe(false);
  });

  it("is trustworthy only when both sides clear the threshold", () => {
    expect(isDeltaTrustworthy(SMALL_SAMPLE_THRESHOLD, SMALL_SAMPLE_THRESHOLD)).toBe(true);
    expect(isDeltaTrustworthy(10, 10)).toBe(true);
  });
});
