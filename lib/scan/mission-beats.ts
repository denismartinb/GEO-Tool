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

/**
 * How long the lift-off shot holds before the mission moves on to the ascent,
 * regardless of what the counters say (SCAN-STATES-2).
 *
 * `ignicion` is `stage.done === 0`, and `done` does not move until an entire
 * batch of up to `MAX_REAL_SCAN_PROMPTS` prompts closes — so on a 15-prompt
 * project the beat with the least to show held for the whole first batch,
 * roughly a minute of a rocket sitting on the pad with nothing changing. That
 * is what the founder saw and reported as "el cohete está parado, da la
 * sensación de que la página está parada" (2026-08-10). The ascent that
 * follows then flashed past in two discrete jumps (10/15, 15/15) and he never
 * saw it at all.
 */
export const IGNITION_HOLD_MS = 5_500;

/**
 * Which beat to *draw*, once the lift-off shot has had its seconds.
 *
 * This is a presentation decision and nothing else, which is the whole reason
 * it is allowed to be driven by a clock. It swaps which SCENE is on screen; it
 * does not touch a single number. The ascent it hands back reports
 * `done: 0` and `climb: 0` — both literally true while the first batch runs —
 * so the screen says "0 de 15" and keeps the rocket on the ground for exactly
 * as long as that is the truth. Nothing is interpolated, accelerated or
 * invented (CLAUDE.md, "no fake product behavior").
 *
 * What the user gains is that the waiting looks alive: the ascent scene's
 * clouds fall continuously, and ambient motion carries no information by
 * construction, so it can run before the first counter ever moves.
 */
export function resolveDisplayBeat(beat: MissionBeat, ignitionElapsed: boolean): MissionBeat {
  if (beat.key !== "ignicion" || !ignitionElapsed) return beat;
  return { key: "ascenso", done: 0, total: beat.total, climb: 0 };
}

/**
 * Whether Visión general should show the compact "Revisando tu web" band —
 * the half of the mission that survives after the score appears.
 *
 * Extracted here, with tests, because the inline version was **dead code from
 * the day it shipped** and nobody noticed for two days: it lived inside the
 * `hasData` branch (which requires a completed run) while asking for
 * `isFirstScan` (which requires ZERO completed runs). Mutually exclusive. The
 * comment above it even reasoned that it "never overlaps with the rocket,
 * which only renders in the !hasData branch" — the same fact that makes it
 * unreachable, used to argue it was safe.
 *
 * The founder found it the only way it could be found: by scanning a real
 * domain and reporting "no he visto la parte de la auditoría" (2026-08-11).
 *
 * The correct condition is the scan's AFTERMATH, not its absence: exactly one
 * completed run means the domain has just finished its first scan, which is
 * when the first audit is running behind it.
 */
export function shouldShowMissionBand(input: { completedRunsCount: number; hasActiveAuditJob: boolean }): boolean {
  return input.hasActiveAuditJob && input.completedRunsCount === 1;
}
