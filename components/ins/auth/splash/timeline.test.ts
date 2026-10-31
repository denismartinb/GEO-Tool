import { describe, expect, it } from "vitest";
import { LANDING_AT, SPLASH_VARIANTS, ease, pickVariant, seg } from "./timeline";
import { gMarkInner } from "./g-mark";

describe("pickVariant", () => {
  it("never repeats the last variant", () => {
    for (const last of SPLASH_VARIANTS) {
      for (const r of [0, 0.3, 0.5, 0.99]) {
        expect(pickVariant(last, () => r)).not.toBe(last);
      }
    }
  });

  it("reaches every other variant", () => {
    const seen = new Set([pickVariant("calibre", () => 0), pickVariant("calibre", () => 0.99)]);
    expect(seen).toEqual(new Set(["compas", "bruma"]));
  });

  it("picks any variant when nothing is remembered", () => {
    const seen = new Set([0, 0.4, 0.9].map((r) => pickVariant(null, () => r)));
    expect(seen.size).toBe(3);
  });

  it("ignores an unknown stored value", () => {
    expect(SPLASH_VARIANTS).toContain(pickVariant("otra", () => 0.5));
  });
});

describe("timeline helpers", () => {
  it("clamps seg and eases to the ends", () => {
    expect(seg(-5, 0, 10)).toBe(0);
    expect(seg(50, 0, 10)).toBe(1);
    expect(seg(5, 0, 10)).toBe(0.5);
    for (const e of [ease.o, ease.io, ease.back]) {
      expect(e(0)).toBeCloseTo(0, 5);
      expect(e(1)).toBeCloseTo(1, 5);
    }
  });

  it("hands over to the login before 2 s", () => {
    for (const v of SPLASH_VARIANTS) expect(LANDING_AT[v]).toBeLessThan(2000);
  });
});

describe("gMarkInner", () => {
  it("draws three cuts and uses the given id", () => {
    const s = gMarkInner("gx");
    expect(s.match(/<line /g)).toHaveLength(3);
    expect(s).toContain('id="gxm"');
    expect(s).toContain('clip-path="url(#gxc)"');
  });

  it("has no long dash", () => {
    expect(gMarkInner("a")).not.toContain("—");
  });
});
