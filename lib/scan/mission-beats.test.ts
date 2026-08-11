import { describe, expect, it } from "vitest";
import { computeMissionBeat, resolveDisplayBeat, shouldShowMissionBand } from "./mission-beats";
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

describe("resolveDisplayBeat (SCAN-STATES-2)", () => {
  it("keeps the lift-off shot while its hold has not elapsed", () => {
    const beat = computeMissionBeat(run({ total_prompts: 15, successful_prompts: 0, failed_prompts: 0 }));
    expect(beat.key).toBe("ignicion");
    expect(resolveDisplayBeat(beat, false)).toEqual(beat);
  });

  it("moves to the ascent once the hold elapses, reporting a truthful 0 of N", () => {
    // The whole point: the SCENE changes, the NUMBERS do not. `done` is still
    // 0 because the first batch has not closed, and the rocket is still on the
    // ground because climb is 0. Nothing is accelerated.
    const beat = computeMissionBeat(run({ total_prompts: 15, successful_prompts: 0, failed_prompts: 0 }));
    expect(resolveDisplayBeat(beat, true)).toEqual({ key: "ascenso", done: 0, total: 15, climb: 0 });
  });

  it("never invents altitude for the elapsed lift-off", () => {
    const beat = computeMissionBeat(run({ total_prompts: 30, successful_prompts: 0, failed_prompts: 0 }));
    const shown = resolveDisplayBeat(beat, true);
    expect(shown.key === "ascenso" && shown.climb).toBe(0);
  });

  it("leaves every other beat untouched, elapsed or not", () => {
    const cases = [
      run({ total_prompts: 0, successful_prompts: 0, failed_prompts: 0 }),
      run({ total_prompts: 15, successful_prompts: 10, failed_prompts: 0 }),
      run({ total_prompts: 15, successful_prompts: 15, failed_prompts: 0, responses_total: 45, responses_processed: 28 }),
      run({ total_prompts: 15, successful_prompts: 15, failed_prompts: 0, responses_total: 45, responses_processed: 45 })
    ];

    for (const r of cases) {
      const beat = computeMissionBeat(r);
      expect(beat.key).not.toBe("ignicion");
      expect(resolveDisplayBeat(beat, true)).toEqual(beat);
      expect(resolveDisplayBeat(beat, false)).toEqual(beat);
    }
  });
});

describe("shouldShowMissionBand", () => {
  it("shows right after the first scan, while its audit runs", () => {
    expect(shouldShowMissionBand({ completedRunsCount: 1, hasActiveAuditJob: true })).toBe(true);
  });

  it("is NOT gated on zero completed runs — the bug this replaces", () => {
    // The shipped inline version asked for `isFirstScan` (zero completed runs)
    // from inside a branch that requires one, so it never rendered once.
    expect(shouldShowMissionBand({ completedRunsCount: 0, hasActiveAuditJob: true })).toBe(false);
  });

  it("stays hidden with no audit running", () => {
    expect(shouldShowMissionBand({ completedRunsCount: 1, hasActiveAuditJob: false })).toBe(false);
  });

  it("is spent once per domain: a second scan never brings it back", () => {
    for (const count of [2, 3, 17]) {
      expect(shouldShowMissionBand({ completedRunsCount: count, hasActiveAuditJob: true })).toBe(false);
    }
  });
});
