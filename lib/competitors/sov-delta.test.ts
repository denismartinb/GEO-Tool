import { describe, expect, it } from "vitest";
import { computeSovDeltas, type SovDeltaInputRow } from "@/lib/competitors/sov-delta";

const TRACKED = [{ name: "Leroy Merlin" }];

function row(runId: string, brandMentioned: boolean, competitorMentioned: boolean): SovDeltaInputRow {
  return {
    runId,
    extracted_json: {
      brand: { mentioned: brandMentioned },
      competitors: [{ name: "Leroy Merlin", mentioned: competitorMentioned }]
    }
  };
}

describe("computeSovDeltas", () => {
  it("1. brand SoV improves scan-over-scan → positive delta", () => {
    const rows = [
      // previous run: brand 1, competitor 1 → 50/50
      row("run-prev", true, true),
      // latest run: brand 1, competitor 0 → 100/0
      row("run-latest", true, false)
    ];
    const result = computeSovDeltas({ rows, latestRunId: "run-latest", previousRunId: "run-prev", trackedCompetitors: TRACKED });
    expect(result.brand.previousSov).toBe(50);
    expect(result.brand.currentSov).toBe(100);
    expect(result.brand.deltaPoints).toBe(50);
  });

  it("2. no previous run → deltaPoints is null, currentSov still computed", () => {
    const rows = [row("run-latest", true, true)];
    const result = computeSovDeltas({ rows, latestRunId: "run-latest", previousRunId: null, trackedCompetitors: TRACKED });
    expect(result.brand.deltaPoints).toBeNull();
    expect(result.brand.currentSov).toBe(50);
    expect(result.brand.previousSov).toBeNull();
  });

  it("3. previousRunId set but has no rows in the input → treated as no previous data", () => {
    const rows = [row("run-latest", true, true)];
    const result = computeSovDeltas({ rows, latestRunId: "run-latest", previousRunId: "run-missing", trackedCompetitors: TRACKED });
    expect(result.brand.previousSov).toBeNull();
    expect(result.brand.deltaPoints).toBeNull();
  });

  it("4. zero mentions in a run → 0% SoV, not NaN or division error", () => {
    const rows = [
      { runId: "run-latest", extracted_json: { brand: { mentioned: false }, competitors: [{ name: "Leroy Merlin", mentioned: false }] } }
    ];
    const result = computeSovDeltas({ rows, latestRunId: "run-latest", previousRunId: null, trackedCompetitors: TRACKED });
    expect(result.brand.currentSov).toBe(0);
    expect(result.competitors.get("leroy merlin")!.currentSov).toBe(0);
  });

  it("5. per-competitor delta computed independently of the brand's", () => {
    const rows = [
      row("run-prev", false, true), // prev: brand 0, comp 1 -> 0/100
      row("run-latest", false, false) // latest: brand 0, comp 0 -> both 0 (zero denominator)
    ];
    const result = computeSovDeltas({ rows, latestRunId: "run-latest", previousRunId: "run-prev", trackedCompetitors: TRACKED });
    const comp = result.competitors.get("leroy merlin")!;
    expect(comp.previousSov).toBe(100);
    expect(comp.currentSov).toBe(0);
    expect(comp.deltaPoints).toBe(-100);
  });
});
