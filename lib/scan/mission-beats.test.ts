import { describe, expect, it } from "vitest";
import { computeMissionBeat } from "./mission-beats";
import type { ActiveScanRun } from "@/components/scan-in-progress";

function run(overrides: Partial<ActiveScanRun> = {}): ActiveScanRun {
  return {
    status: "running",
    total_prompts: 10,
    successful_prompts: 0,
    failed_prompts: 0,
    started_at: null,
    ...overrides
  };
}

describe("computeMissionBeat", () => {
  it("is rampa before the job count is known", () => {
    expect(computeMissionBeat(run({ total_prompts: 0 })).key).toBe("rampa");
    expect(computeMissionBeat(run({ total_prompts: null })).key).toBe("rampa");
  });

  it("is ignicion the instant the count is known but nothing has landed yet", () => {
    const beat = computeMissionBeat(run({ total_prompts: 10, successful_prompts: 0, failed_prompts: 0 }));
    expect(beat).toEqual({ key: "ignicion", total: 10 });
  });

  it("is ascenso once at least one launch has a terminal outcome, climb tracking done/total", () => {
    const beat = computeMissionBeat(run({ total_prompts: 10, successful_prompts: 3, failed_prompts: 1 }));
    expect(beat).toEqual({ key: "ascenso", done: 4, total: 10, climb: 0.4 });
  });

  it("counts a failed launch toward ascenso the same as a successful one", () => {
    const beat = computeMissionBeat(run({ total_prompts: 10, successful_prompts: 0, failed_prompts: 4 }));
    expect(beat).toEqual({ key: "ascenso", done: 4, total: 10, climb: 0.4 });
  });

  it("moves past ascenso once every launch has a terminal outcome, failures included", () => {
    // Same underlying rule as computeScanStage: done counts successes AND
    // failures, so an all-failed generation stage still hands off to órbita
    // instead of stalling ascenso at climb=1 forever.
    const beat = computeMissionBeat(run({ total_prompts: 10, successful_prompts: 0, failed_prompts: 10 }));
    expect(beat.key).toBe("orbita");
  });

  it("is orbita with an indeterminate ring when generation just finished and analysis counters have not landed", () => {
    const beat = computeMissionBeat(
      run({ total_prompts: 10, successful_prompts: 10, failed_prompts: 0, responses_total: null, responses_processed: 0 })
    );
    expect(beat).toEqual({ key: "orbita", done: 0, total: null, ringFrac: null });
  });

  it("is orbita with a real ring fraction from responses_total/responses_processed", () => {
    const beat = computeMissionBeat(
      run({
        total_prompts: 10,
        successful_prompts: 10,
        failed_prompts: 0,
        responses_total: 30,
        responses_processed: 18
      })
    );
    expect(beat).toEqual({ key: "orbita", done: 18, total: 30, ringFrac: 0.6 });
  });

  it("is entrega once every response has a terminal extraction outcome, and does not claim a score", () => {
    const beat = computeMissionBeat(
      run({
        total_prompts: 10,
        successful_prompts: 10,
        failed_prompts: 0,
        responses_total: 30,
        responses_processed: 30
      })
    );
    expect(beat).toEqual({ key: "entrega" });
  });

  it("never reports climb or ringFrac outside 0..1", () => {
    const ascenso = computeMissionBeat(run({ total_prompts: 10, successful_prompts: 10, failed_prompts: 5 }));
    if (ascenso.key === "ascenso") expect(ascenso.climb).toBeLessThanOrEqual(1);

    const orbita = computeMissionBeat(
      run({
        total_prompts: 10,
        successful_prompts: 10,
        failed_prompts: 0,
        responses_total: 30,
        responses_processed: 45
      })
    );
    // responses_processed can never legitimately exceed responses_total in
    // this codebase, but the beat must not silently render past 100% if it
    // ever did — entrega is the only state past the ring filling completely.
    expect(orbita.key).toBe("entrega");
  });
});
