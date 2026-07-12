import { describe, expect, it } from "vitest";
import { buildGlobalScore } from "@/lib/web-audit/global-score";

describe("buildGlobalScore", () => {
  it("returns null score with zero included components when nothing has a value", () => {
    const result = buildGlobalScore({ coveragePct: null, surfacingPct: null, technicalScore: null });
    expect(result.score).toBeNull();
    expect(result.includedCount).toBe(0);
    expect(result.components).toEqual([
      { key: "content", value: null },
      { key: "surfacing", value: null },
      { key: "technical", value: null }
    ]);
  });

  it("averages only the components that have a value", () => {
    // coverage 69 + surfacing 0, technical never run → mean of 2, not 3
    const result = buildGlobalScore({ coveragePct: 69, surfacingPct: 0, technicalScore: null });
    expect(result.score).toBe(Math.round((69 + 0) / 2));
    expect(result.includedCount).toBe(2);
    expect(result.components.find((c) => c.key === "technical")?.value).toBeNull();
  });

  it("uses all three components when present, rounding the mean", () => {
    const result = buildGlobalScore({ coveragePct: 69, surfacingPct: 0, technicalScore: 13 });
    expect(result.score).toBe(Math.round((69 + 0 + 13) / 3)); // 27
    expect(result.includedCount).toBe(3);
  });

  it("keeps a real 0 as a real component — a 0% rate is data, not absence", () => {
    const result = buildGlobalScore({ coveragePct: null, surfacingPct: 0, technicalScore: null });
    expect(result.score).toBe(0);
    expect(result.includedCount).toBe(1);
  });

  it("clamps out-of-range inputs into 0-100 before averaging", () => {
    const result = buildGlobalScore({ coveragePct: 140, surfacingPct: -20, technicalScore: null });
    expect(result.components.find((c) => c.key === "content")?.value).toBe(100);
    expect(result.components.find((c) => c.key === "surfacing")?.value).toBe(0);
    expect(result.score).toBe(50);
  });
});
