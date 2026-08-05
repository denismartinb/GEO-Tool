import { describe, expect, it } from "vitest";
import {
  buildSeriesPaths,
  MAX_TREND_POINTS,
  MIN_TREND_POINTS,
  selectTrendWindow,
  type TrendWindowPoint
} from "./trend-window";

function point(date: string, values: Record<string, number | null | undefined>): TrendWindowPoint {
  return { date, values };
}

describe("selectTrendWindow", () => {
  it("1. drops a run where no series has any position — that column is the blank band the founder reported", () => {
    const out = selectTrendWindow({
      points: [
        point("a", { brand: 2, rival: 3 }),
        point("b", { brand: null, rival: null }),
        point("c", { brand: 2.5, rival: 3.5 })
      ]
    });

    expect(out.map((p) => p.date)).toEqual(["a", "c"]);
  });

  it("2. KEEPS a run where only some series are null — that gap is real information", () => {
    // A brand genuinely not mentioned in one scan must still break its own
    // line; only all-null columns are noise.
    const out = selectTrendWindow({
      points: [
        point("a", { brand: 2, rival: 3 }),
        point("b", { brand: null, rival: 3.2 }),
        point("c", { brand: 2.5, rival: 3.5 })
      ]
    });

    expect(out.map((p) => p.date)).toEqual(["a", "b", "c"]);
  });

  it("3. keeps only the most recent N scans", () => {
    const points = Array.from({ length: 21 }, (_, i) => point(`d${i}`, { brand: i }));
    const out = selectTrendWindow({ points, limit: 15 });

    expect(out).toHaveLength(15);
    expect(out[0].date).toBe("d6");
    expect(out[out.length - 1].date).toBe("d20");
  });

  it("4. filters BEFORE capping, so the window is never spent on empty columns", () => {
    // 3 empty runs at the start; with a limit of 3 the window must be the 3
    // most recent REAL points, not "last 3 of the raw list".
    const points = [
      point("empty1", { brand: null }),
      point("empty2", { brand: null }),
      point("empty3", { brand: null }),
      point("r1", { brand: 1 }),
      point("r2", { brand: 2 }),
      point("r3", { brand: 3 })
    ];

    expect(selectTrendWindow({ points, limit: 3 }).map((p) => p.date)).toEqual(["r1", "r2", "r3"]);
  });

  it("5. returns everything when there is less than a full window", () => {
    const points = [point("a", { brand: 1 }), point("b", { brand: 2 })];
    expect(selectTrendWindow({ points })).toHaveLength(2);
  });

  it("6. an all-empty history collapses to nothing rather than to a chart of holes", () => {
    const points = [point("a", { brand: null }), point("b", { brand: null, rival: null })];
    expect(selectTrendWindow({ points })).toEqual([]);
  });

  it("7. handles an empty input", () => {
    expect(selectTrendWindow({ points: [] })).toEqual([]);
  });

  it("8. defaults to 15 points", () => {
    expect(MAX_TREND_POINTS).toBe(15);
    const points = Array.from({ length: 40 }, (_, i) => point(`d${i}`, { brand: 1 }));
    expect(selectTrendWindow({ points })).toHaveLength(15);
  });

  it("9. preserves the caller's own point shape, so extra fields survive the window", () => {
    const points = [
      { date: "a", runId: "run-a", values: { brand: 1 } },
      { date: "b", runId: "run-b", values: { brand: 2 } }
    ];
    expect(selectTrendWindow({ points }).map((p) => p.runId)).toEqual(["run-a", "run-b"]);
  });
});

describe("buildSeriesPaths", () => {
  it("10. connects points with straight segments — never a staircase", () => {
    const [path] = buildSeriesPaths([
      { x: 0, y: 10 },
      { x: 50, y: 30 }
    ]);

    expect(path).toBe("M0.0 10.0 L50.0 30.0");
    // The exact defect the founder reported: H/V pairs draw a step, which
    // claims the value held flat until the instant of the next scan.
    expect(path).not.toContain("H");
    expect(path).not.toContain("V");
  });

  it("11. breaks into separate segments around a gap, so a missing scan is not drawn through", () => {
    const paths = buildSeriesPaths([
      { x: 0, y: 10 },
      { x: 10, y: 12 },
      null,
      { x: 30, y: 20 },
      { x: 40, y: 22 }
    ]);

    expect(paths).toHaveLength(2);
    expect(paths[0]).toBe("M0.0 10.0 L10.0 12.0");
    expect(paths[1]).toBe("M30.0 20.0 L40.0 22.0");
  });

  it("12. a lone point still emits a move, so its dot is not orphaned by an empty path", () => {
    expect(buildSeriesPaths([{ x: 5, y: 5 }])).toEqual(["M5.0 5.0"]);
  });

  it("13. an all-null series produces no path at all", () => {
    expect(buildSeriesPaths([null, null])).toEqual([]);
  });

  it("14. a trend needs 4 points, not the mathematical minimum of 2", () => {
    expect(MIN_TREND_POINTS).toBe(4);
  });
});
