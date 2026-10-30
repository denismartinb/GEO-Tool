import { describe, expect, it } from "vitest";
import { arcGeometry, blockMeta, potentialLine } from "./audit-model";

describe("arcGeometry", () => {
  it("paints the score and a ghost up to the projection on a 270 degree track", () => {
    const g = arcGeometry(50, 75, 132);
    expect(g.span).toBeCloseTo(0.75 * g.circumference, 6);
    expect(g.now).toBeCloseTo(g.span * 0.5, 6);
    expect(g.ghost).toBeCloseTo(g.span * 0.25, 6);
  });

  it("never draws a negative ghost nor goes past 100", () => {
    expect(arcGeometry(80, 60).ghost).toBe(0);
    const full = arcGeometry(120, 150);
    expect(full.now).toBeCloseTo(full.span, 6);
    expect(full.ghost).toBe(0);
  });
});

describe("blockMeta", () => {
  it("pluralises and keeps the critical count apart", () => {
    expect(blockMeta(1, 3)).toEqual({ critical: "1 crítico", total: "3 problemas" });
    expect(blockMeta(2, 1)).toEqual({ critical: "2 críticos", total: "1 problema" });
    expect(blockMeta(0, 0)).toEqual({ critical: null, total: "Sin problemas" });
  });
});

describe("potentialLine", () => {
  it("is the real projected gain, or nothing", () => {
    expect(potentialLine(55, 77, 4)).toEqual({ gain: 22, text: "si arreglas los 4 problemas que puntúan" });
    expect(potentialLine(55, 60, 1)?.text).toBe("si arreglas el problema que puntúa");
    expect(potentialLine(77, 77, 0)).toBeNull();
    expect(potentialLine(null, null, 0)).toBeNull();
  });
});
