import { computeScanStage, type ActiveScanRun } from "@/components/scan-in-progress";

/**
 * ONBOARDING-ROCKET-1. Re-skins `computeScanStage` (unchanged, still owns
 * generation vs. analysis) into the five full-screen beats of the first-scan
 * mission (`docs/design-reference/scan-states-1/rev3-cohete-secuencia.html`).
 * No new counters, no new query: every field this reads already exists on
 * `ActiveScanRun` / `withAnalysisProgress`.
 *
 * Deliberate deviation from the design reference, and the reason a future
 * session must not "fix" the copy back to it: the mockup showed
 * "90 respuestas" from `prompts × engines`. `total_prompts` counts
 * lanzamientos (jobs), not response rows (SAMPLING-1, ADR 0030) — multiplying
 * by an engine count here would need either `LLM_SCAN_PROVIDERS` (env-wide,
 * can overcount a plan capped below it) or the project owner's resolved plan
 * (a genuinely new read this page does not do). Both are deferred to the
 * per-engine breakdown phase. The `ascenso` beat stays in the same unnamed
 * lanzamiento unit `ScanInProgress` already uses today.
 *
 * `orbita` is the one beat that CAN honestly say "respuestas": once
 * generation ends, `responses_total`/`responses_processed`
 * (`lib/scan/active-run-progress.ts`) are counted straight from
 * `scan_prompt_results` rows — which already are one row per engine per
 * prompt (migration 0009). That count needs no multiplication; it is real.
 */
export type MissionBeat =
  | { key: "rampa" }
  | { key: "ignicion"; total: number }
  | { key: "ascenso"; done: number; total: number; climb: number }
  | { key: "orbita"; done: number; total: number | null; ringFrac: number | null }
  | { key: "entrega" };

export function computeMissionBeat(run: ActiveScanRun): MissionBeat {
  const stage = computeScanStage(run);

  if (stage.kind === "preparing") return { key: "rampa" };

  if (stage.kind === "generating") {
    if (stage.done === 0) return { key: "ignicion", total: stage.total };
    return { key: "ascenso", done: stage.done, total: stage.total, climb: stage.done / stage.total };
  }

  // stage.kind === "analyzing"
  if (stage.total === null) return { key: "orbita", done: 0, total: null, ringFrac: null };
  if (stage.done >= stage.total) return { key: "entrega" };
  return { key: "orbita", done: stage.done, total: stage.total, ringFrac: stage.done / stage.total };
}
