import { describe, expect, it } from "vitest";
import { wilsonInterval, Z_95 } from "@/lib/stats/wilson";

describe("wilsonInterval", () => {
  it("does not degenerate to zero width at the extremes (the reason it exists)", () => {
    // The normal approximation returns p ± z·sqrt(p(1-p)/n), which is exactly
    // 0 at p = 0 and p = 1 — "3 of 3 responses, therefore 100% with no
    // uncertainty". Both surfaces that consume this module hit that case
    // routinely on small samples.
    const saturated = wilsonInterval(3, 3)!;
    expect(saturated.high).toBe(1);
    expect(saturated.low).toBeGreaterThan(0);
    expect(saturated.low).toBeLessThan(0.6);

    const empty = wilsonInterval(0, 3)!;
    expect(empty.low).toBe(0);
    expect(empty.high).toBeGreaterThan(0.4);
  });

  it("always stays within [0, 1]", () => {
    for (const n of [1, 2, 3, 5, 10, 37, 300]) {
      for (let k = 0; k <= n; k += 1) {
        const interval = wilsonInterval(k, n)!;
        expect(interval.low).toBeGreaterThanOrEqual(0);
        expect(interval.high).toBeLessThanOrEqual(1);
        expect(interval.low).toBeLessThanOrEqual(interval.high);
      }
    }
  });

  it("contains the point estimate", () => {
    for (const n of [3, 10, 75]) {
      for (let k = 0; k <= n; k += 1) {
        const interval = wilsonInterval(k, n)!;
        const p = k / n;
        // Allow floating-point slack at the clamped boundaries.
        expect(interval.low).toBeLessThanOrEqual(p + 1e-9);
        expect(interval.high).toBeGreaterThanOrEqual(p - 1e-9);
      }
    }
  });

  it("narrows monotonically as the sample grows at a fixed proportion", () => {
    const widths = [4, 10, 40, 100, 400].map((n) => {
      const interval = wilsonInterval(n / 2, n)!;
      return interval.high - interval.low;
    });

    for (let i = 1; i < widths.length; i += 1) {
      expect(widths[i]).toBeLessThan(widths[i - 1]);
    }
  });

  it("returns null for an empty or invalid sample rather than a fabricated range", () => {
    expect(wilsonInterval(0, 0)).toBeNull();
    expect(wilsonInterval(1, -5)).toBeNull();
    expect(wilsonInterval(Number.NaN, 10)).toBeNull();
    expect(wilsonInterval(5, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("clamps impossible success counts instead of producing NaN", () => {
    const overflow = wilsonInterval(99, 3)!;
    expect(Number.isFinite(overflow.low)).toBe(true);
    expect(overflow).toEqual(wilsonInterval(3, 3));

    const negative = wilsonInterval(-4, 3)!;
    expect(negative).toEqual(wilsonInterval(0, 3));
  });

  it("widens with a higher confidence level", () => {
    const at95 = wilsonInterval(5, 10, Z_95)!;
    const at99 = wilsonInterval(5, 10, 2.5758)!;
    expect(at99.high - at99.low).toBeGreaterThan(at95.high - at95.low);
  });
});
