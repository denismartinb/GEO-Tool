import { describe, expect, it } from "vitest";
import { computeScanStage, type ActiveScanRun } from "./scan-in-progress";
import { isAnalyzing } from "./live-run-status-cells";
import { scanStatePillLabel } from "./scan-state-pill";

/**
 * EXTRACTION-RELIABILITY-1 Fase C (docs/adr/0029).
 *
 * The defect these pin: after Fase A moved extraction inside the finalize
 * step, this screen read "100% · 6 de 6" for a real stretch of the scan while
 * the whole project section sat behind the overlay. A 100% bar next to a
 * spinner reads as "stuck", and it was measured on a real 103s run.
 */

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

/** Narrows away the `preparing` variant, which carries no percentage. */
function pctOf(stage: ReturnType<typeof computeScanStage>): number {
  if (stage.kind === "preparing") throw new Error("expected a stage with a percentage");
  return stage.pct;
}

describe("computeScanStage", () => {
  it("says it is preparing before the job count is known", () => {
    expect(computeScanStage(run({ total_prompts: 0 })).kind).toBe("preparing");
    expect(computeScanStage(run({ total_prompts: null })).kind).toBe("preparing");
  });

  it("maps generation onto the first half of the bar", () => {
    expect(computeScanStage(run({ successful_prompts: 5 }))).toMatchObject({
      kind: "generating",
      done: 5,
      total: 10,
      pct: 25
    });
  });

  it("counts failed launches as done — they are finished work, not pending work", () => {
    expect(computeScanStage(run({ successful_prompts: 6, failed_prompts: 4 }))).toMatchObject({
      kind: "analyzing"
    });
  });

  // The heart of this phase.
  it("switches to the analysis stage instead of showing 100% once generation ends", () => {
    const stage = computeScanStage(
      run({ successful_prompts: 10, responses_total: 30, responses_processed: 0 })
    );

    expect(stage.kind).toBe("analyzing");
    expect(pctOf(stage)).toBe(50);
    expect(pctOf(stage)).not.toBe(100);
  });

  it("advances across the second half as answers get analyzed", () => {
    const at = (processed: number) =>
      pctOf(computeScanStage(run({ successful_prompts: 10, responses_total: 30, responses_processed: processed })));

    expect(at(0)).toBe(50);
    expect(at(15)).toBe(75);
    // Never 100 while the run is still in flight — the bar's last point is
    // reserved for a run that has actually finished.
    expect(at(30)).toBe(99);
  });

  it("never reports 100% for a run that is still working", () => {
    for (const processed of [0, 1, 7, 29, 30]) {
      const stage = computeScanStage(
        run({ successful_prompts: 10, responses_total: 30, responses_processed: processed })
      );
      expect(pctOf(stage)).toBeLessThan(100);
    }
  });

  // A caller that has not been wired through `withAnalysisProgress` — and the
  // window before any row is queryable. Naming the stage without inventing a
  // number beats both a frozen 100% and a fabricated count.
  it("names the analysis stage without a count when the counters are absent", () => {
    const stage = computeScanStage(run({ successful_prompts: 10 }));

    expect(stage).toMatchObject({ kind: "analyzing", total: null, pct: 50 });
  });

  it("treats a zero response total the same as absent rather than dividing by zero", () => {
    const stage = computeScanStage(run({ successful_prompts: 10, responses_total: 0, responses_processed: 0 }));

    expect(stage).toMatchObject({ kind: "analyzing", total: null });
    expect(Number.isFinite(pctOf(stage))).toBe(true);
  });
});

/**
 * Escaneos renders the run through `LiveRunStatusCells`, not through
 * `ScanInProgress` — which is why the first look at Fase C on that page saw
 * no change at all (founder report, 2026-08-05). The table keeps counting
 * launches, because "6 of 6 launches" is genuinely true during extraction;
 * what was missing is that the badge said only "En curso", so the row read as
 * finished-but-stuck. The stage moved to the badge instead.
 */
describe("isAnalyzing (Escaneos row)", () => {
  const base = { status: "running", total_prompts: 6, successful_prompts: 0, failed_prompts: 0 };

  it("is false while launches are still going out", () => {
    expect(isAnalyzing({ ...base, successful_prompts: 3 })).toBe(false);
  });

  it("is true once every launch is terminal but the run is still working", () => {
    expect(isAnalyzing({ ...base, successful_prompts: 6 })).toBe(true);
    expect(isAnalyzing({ ...base, successful_prompts: 4, failed_prompts: 2 })).toBe(true);
  });

  it("is false for a run that already reached a terminal state", () => {
    expect(isAnalyzing({ ...base, status: "completed", successful_prompts: 6 })).toBe(false);
    expect(isAnalyzing({ ...base, status: "failed", successful_prompts: 6 })).toBe(false);
  });

  it("is false before the launch count is known", () => {
    expect(isAnalyzing({ ...base, total_prompts: 0 })).toBe(false);
    expect(isAnalyzing({ ...base, total_prompts: null })).toBe(false);
  });
});

/**
 * La pastilla del sticky-header (Fase C). Es la única señal de escaneo que se
 * ve en móvil en una pantalla con datos: el chip `.scan-status` está oculto
 * bajo el breakpoint (`app/globals.css`) y el overlay a pantalla completa
 * sólo se monta cuando no hay nada que enseñar. Founder, 2026-08-05: "no veo
 * ningún chip en ninguna cabecera móvil".
 */
describe("scanStatePillLabel", () => {
  const running = { status: "running", total_prompts: 6, successful_prompts: 0, failed_prompts: 0, started_at: null };

  it("shows the date when nothing is running", () => {
    expect(scanStatePillLabel(null, "5 ago 2026")).toBe("Escaneado 5 ago 2026");
  });

  it("renders nothing when there is neither a run nor a date", () => {
    expect(scanStatePillLabel(null, null)).toBeNull();
  });

  // "Escaneado 5 ago" during a scan is the actual lie: it asserts the data on
  // screen is the latest there is, while fresher data is minutes away.
  it("replaces the date with the live state while a scan runs", () => {
    expect(scanStatePillLabel({ ...running, successful_prompts: 2 }, "5 ago 2026")).toBe("Escaneando…");
  });

  it("names the analysis stage, matching the full-screen progress", () => {
    expect(
      scanStatePillLabel(
        { ...running, successful_prompts: 6, responses_total: 18, responses_processed: 4 },
        "5 ago 2026"
      )
    ).toBe("Analizando…");
  });
});
