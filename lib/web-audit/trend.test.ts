import { describe, it, expect } from "vitest";
import { buildCoverageTrend } from "./trend";
import type { DomainCoverageMap } from "./coverage-map";
import type { PromptResultLite } from "./opportunity-matrix";

const PROJECT_DOMAIN = "acme.com";

function map(scanId: string, generatedAt: string, found: boolean): DomainCoverageMap {
  return {
    scanId,
    generatedAt,
    topics: [{ promptId: "p1", topic: "t1", found, pages: found ? [{ url: "https://acme.com/a", title: "A" }] : [], note: "n" }]
  };
}

const results = new Map<string, PromptResultLite[]>([
  ["scan-1", [{ prompt_id: "p1", extracted_json: { citations: [] }, provider: "gemini", mentioned_competitors_count: 0 }]],
  ["scan-2", [{ prompt_id: "p1", extracted_json: { citations: [] }, provider: "gemini", mentioned_competitors_count: 0 }]]
]);

describe("buildCoverageTrend", () => {
  it("sorts points ascending by generatedAt regardless of input order", () => {
    const trend = buildCoverageTrend({
      maps: [map("scan-2", "2026-06-02T00:00:00.000Z", true), map("scan-1", "2026-06-01T00:00:00.000Z", false)],
      resultsByScanId: results,
      projectDomain: PROJECT_DOMAIN
    });
    expect(trend.map((p) => p.scanId)).toEqual(["scan-1", "scan-2"]);
  });

  it("dedupes repeated scanIds keeping the most recently generated map", () => {
    const stale = map("scan-1", "2026-06-01T00:00:00.000Z", false);
    const fresh = map("scan-1", "2026-06-05T00:00:00.000Z", true);
    const trend = buildCoverageTrend({
      maps: [stale, fresh],
      resultsByScanId: results,
      projectDomain: PROJECT_DOMAIN
    });
    expect(trend).toHaveLength(1);
    expect(trend[0].coveragePct).toBe(100);
  });

  it("caps the series at the last 8 points", () => {
    const maps = Array.from({ length: 12 }, (_, i) =>
      map(`scan-${i}`, `2026-06-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`, true)
    );
    const resultsByScanId = new Map(
      maps.map((m) => [m.scanId, [{ prompt_id: "p1", extracted_json: { citations: [] }, provider: "gemini", mentioned_competitors_count: 0 }]])
    );
    const trend = buildCoverageTrend({ maps, resultsByScanId, projectDomain: PROJECT_DOMAIN });
    expect(trend).toHaveLength(8);
    expect(trend[trend.length - 1].scanId).toBe("scan-11");
  });
});
