import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { geoScoreFromRows, loadGeoScoresByProject } from "./geo-scores";
import { resolveGeoScore } from "@/lib/metrics/run-metrics";

const run = (id: string, createdAt: string, composite: number, totalResults = 60) => ({
  run_id: id,
  created_at: createdAt,
  visibility_score: 5,
  details_json: { geo_score: { score: composite }, total_results: totalResults }
});

describe("geoScoreFromRows", () => {
  it("is 'unscored' with no rows, never a zero", () => {
    expect(geoScoreFromRows([])).toEqual({ state: "unscored" });
    expect(geoScoreFromRows(null)).toEqual({ state: "unscored" });
  });

  it("returns exactly what the dashboard resolves (resolveGeoScore), not visibility_score", () => {
    const rows = [run("r2", "2026-11-02T06:00:00Z", 61), run("r1", "2026-11-01T06:00:00Z", 55)];
    const result = geoScoreFromRows(rows);
    expect(result).toEqual({
      state: "scored",
      value: resolveGeoScore(rows).value,
      lowConfidence: resolveGeoScore(rows).lowConfidence,
      scoredAt: "2026-11-02T06:00:00Z"
    });
    expect(result.state === "scored" && result.value).not.toBe(5);
  });

  it("flags a small sample", () => {
    const result = geoScoreFromRows([run("r1", "2026-11-02T06:00:00Z", 40, 3)]);
    expect(result).toMatchObject({ state: "scored", lowConfidence: true });
  });
});

describe("loadGeoScoresByProject", () => {
  it("marks a failed read as 'unavailable' and keeps the others", async () => {
    const service = {
      from: () => ({
        select: () => ({
          eq: (_c: string, projectId: string) => ({
            order: () => ({
              limit: () =>
                projectId === "bad"
                  ? Promise.resolve({ data: null, error: { code: "42P01", message: "x" } })
                  : Promise.resolve({ data: [run("r1", "2026-11-02T06:00:00Z", 50)], error: null })
            })
          })
        })
      })
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const map = await loadGeoScoresByProject(service as never, ["ok", "bad", "ok"]);
    expect(map.get("bad")).toEqual({ state: "unavailable" });
    expect(map.get("ok")).toMatchObject({ state: "scored", value: 50 });
    expect(map.size).toBe(2);
  });
});
