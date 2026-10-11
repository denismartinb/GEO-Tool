import { describe, expect, it } from "vitest";
import {
  buildQueryViews,
  buildSearchConsoleReport,
  isNearPageOne,
  percentDelta,
  searchWindows,
  summarizeIndex
} from "./report";

describe("percentDelta", () => {
  it("returns null without a previous value to compare against", () => {
    expect(percentDelta(10, 0)).toBeNull();
    expect(percentDelta(10, null)).toBeNull();
  });
  it("computes the relative change", () => {
    expect(percentDelta(150, 100)).toBe(50);
    expect(percentDelta(50, 100)).toBe(-50);
  });
});

describe("isNearPageOne", () => {
  it("is page 2 only: positions above 10 up to 20", () => {
    expect(isNearPageOne(10)).toBe(false);
    expect(isNearPageOne(10.1)).toBe(true);
    expect(isNearPageOne(20)).toBe(true);
    expect(isNearPageOne(20.1)).toBe(false);
  });
});

describe("buildQueryViews", () => {
  it("computes movement as previous minus current (positive = moved up)", () => {
    const views = buildQueryViews(
      [
        { query: "a", clicks: 5, impressions: 100, position: 4 },
        { query: "b", clicks: 1, impressions: 50, position: 14.26 }
      ],
      [{ query: "a", clicks: 2, impressions: 80, position: 7.5 }]
    );
    expect(views[0]).toMatchObject({ query: "a", movement: 3.5, ctr: 0.05, nearPage1: false });
    expect(views[1]).toMatchObject({ query: "b", movement: null, position: 14.3, nearPage1: true });
  });
  it("drops rows without impressions or with an empty query", () => {
    expect(
      buildQueryViews(
        [
          { query: " ", clicks: 0, impressions: 10, position: 3 },
          { query: "x", clicks: 0, impressions: 0, position: 0 }
        ],
        []
      )
    ).toEqual([]);
  });
});

describe("summarizeIndex", () => {
  it("returns null when nothing was inspected", () => {
    expect(summarizeIndex(null)).toBeNull();
    expect(summarizeIndex([])).toBeNull();
  });
  it("buckets by verdict and Google's coverage text, never guessing", () => {
    expect(
      summarizeIndex([
        { url: "1", verdict: "PASS", coverageState: "Submitted and indexed" },
        { url: "2", verdict: "NEUTRAL", coverageState: "Excluded by 'noindex' tag" },
        { url: "3", verdict: "NEUTRAL", coverageState: "Crawled - currently not indexed" },
        { url: "4", verdict: "NEUTRAL", coverageState: "URL is unknown to Google" }
      ])
    ).toEqual({ indexed: 1, crawledNotIndexed: 1, excludedNoindex: 1, other: 1, total: 4 });
  });
});

describe("buildSearchConsoleReport", () => {
  it("marks the report empty when Google has no impressions", () => {
    const report = buildSearchConsoleReport({
      current: { clicks: 0, impressions: 0, position: 0 },
      previous: null,
      daily: [],
      queries: [],
      previousQueries: [],
      inspections: null
    });
    expect(report.empty).toBe(true);
    expect(report.position).toEqual({ value: null, delta: null });
    expect(report.index).toBeNull();
  });
  it("fills KPIs, sorts days and lists page-2 queries by impressions", () => {
    const report = buildSearchConsoleReport({
      current: { clicks: 120, impressions: 4000, position: 12.34 },
      previous: { clicks: 100, impressions: 5000, position: 14 },
      daily: [
        { date: "2026-10-02", clicks: 2, impressions: 10 },
        { date: "2026-10-01", clicks: 1, impressions: 5 }
      ],
      queries: [
        { query: "near-low", clicks: 0, impressions: 30, position: 15 },
        { query: "near-high", clicks: 0, impressions: 300, position: 12 },
        { query: "top", clicks: 9, impressions: 90, position: 2 }
      ],
      previousQueries: [],
      inspections: null
    });
    expect(report.clicks).toEqual({ value: 120, deltaPct: 20 });
    expect(report.impressions.deltaPct).toBe(-20);
    expect(report.position).toEqual({ value: 12.3, delta: 1.7 });
    expect(report.daily.map((d) => d.date)).toEqual(["2026-10-01", "2026-10-02"]);
    expect(report.nearPage1.map((q) => q.query)).toEqual(["near-high", "near-low"]);
    expect(report.queries[0].query).toBe("top");
  });
});

describe("searchWindows", () => {
  it("ends 3 days ago and spans 28 days, with the previous 28 just before", () => {
    const w = searchWindows(new Date("2026-10-11T15:00:00Z"));
    expect(w.current).toEqual({ startDate: "2026-09-11", endDate: "2026-10-08" });
    expect(w.previous).toEqual({ startDate: "2026-08-14", endDate: "2026-09-10" });
  });
});
