import { computeSampleCount, MIN_RESPONSES_PER_RUN, type SamplingReason } from "@/lib/scan/sampling";

/**
 * SCAN-PLAN-UNITS-1 — the one place that says what a scan will do, in the
 * units the user reads.
 *
 * Pure and client-safe (no `server-only`): the onboarding wizard (client) and
 * the first-scan mission (server wrapper + client component) both print this
 * arithmetic, and until now each computed its own.
 *
 * The incident it closes (founder, 2026-10-08): the wizard's last screen
 * promised "45 respuestas" (15 prompts x 3 motores); after creating the
 * project the mission announced 15 prompts, 2 pasadas, 3 motores, 90
 * respuestas, and counted 0/30 "lanzamientos". Nothing in the backend was
 * wrong — SAMPLING-1 (ADR 0030) repeats a small prompt set until it reaches
 * `MIN_RESPONSES_PER_RUN` — but the wizard's estimate ignored the repetition
 * and the mission never said why it appeared. The same happened on
 * elcorteingles.es: 8 prompts x 3 motores promised 24; the run was 3 pasadas,
 * 72.
 *
 * The three quantities, named once:
 * - **respuestas**: rows in `scan_prompt_results` — prompt x pasada x motor.
 *   The only thing a user can open and read.
 * - **lanzamiento**: one prompt in one pasada, fanned out to every engine.
 *   `scan_runs.total_prompts` counts these (ADR 0030); the progress counter
 *   `0/30` is this unit.
 * - **pasada**: one full round of the prompt set (`scan_runs.sample_count`).
 *
 * A retry of a failed call re-runs the same lanzamiento and writes the same
 * row; it is not a new respuesta and is never added to `expectedResponses`.
 */

export type RunPlan = {
  prompts: number;
  /** Repetitions of the prompt set (>= 1). */
  samples: number;
  engines: number;
  /** prompts x samples — the unit of `scan_runs.total_prompts`. */
  launches: number;
  /** prompts x samples x engines. */
  expectedResponses: number;
  /** What one pass alone would produce: prompts x engines. */
  singlePassResponses: number;
  /** Why `samples` is what it is. `null` when it came from a persisted run. */
  reason: SamplingReason | null;
};

/** Before launch: the plan the backend WILL compute, from the same function. */
export function describeRunPlan(input: {
  prompts: number;
  engines: number;
  planId: string;
  domain?: string | null;
  samplingEnabled?: boolean;
}): RunPlan {
  const prompts = Math.max(0, Math.floor(input.prompts));
  const engines = Math.max(0, Math.floor(input.engines));
  const decision = computeSampleCount({
    promptCount: prompts,
    engineCount: engines,
    planId: input.planId,
    domain: input.domain,
    samplingEnabled: input.samplingEnabled
  });
  return {
    prompts,
    samples: decision.samples,
    engines,
    launches: prompts * decision.samples,
    expectedResponses: decision.projectedResponses,
    singlePassResponses: prompts * engines,
    reason: decision.reason
  };
}

/**
 * After launch: the plan the run actually has. `sampleCount` is
 * `scan_runs.sample_count` (migration 0028) and wins; `launches` is
 * `total_prompts`. Returns `null` pieces rather than guessing: a figure that
 * cannot be resolved is absent, never filled in (CLAUDE.md, no fake metrics).
 */
export function describeRunPlanFromRun(input: {
  prompts: number | null;
  engines: number | null;
  launches: number | null;
  sampleCount?: number | null;
}): RunPlan | null {
  const { prompts, engines, launches } = input;
  if (prompts === null || engines === null || launches === null || prompts <= 0) return null;
  const persisted = input.sampleCount;
  const samples =
    persisted != null && Number.isFinite(persisted) && persisted >= 1
      ? Math.floor(persisted)
      : Math.max(1, Math.round(launches / prompts));
  return {
    prompts,
    samples,
    engines,
    launches,
    expectedResponses: launches * engines,
    singlePassResponses: prompts * engines,
    reason: null
  };
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "15 prompts × 2 pasadas × 3 motores". `pasadas` is dropped for a single pass. */
export function runPlanFactors(plan: RunPlan): string {
  const parts = [plural(plan.prompts, "prompt", "prompts")];
  if (plan.samples > 1) parts.push(`${plan.samples} pasadas`);
  parts.push(plural(plan.engines, "motor", "motores"));
  return parts.join(" × ");
}

/** "15 prompts × 2 pasadas × 3 motores = 90 respuestas". */
export function runPlanEquation(plan: RunPlan): string {
  return `${runPlanFactors(plan)} = ${plural(plan.expectedResponses, "respuesta", "respuestas")}`;
}

/**
 * One sentence on WHY there is more than one pasada, or `null` when there is
 * nothing to explain. Never promises a precision: it states the floor and, for
 * the capped case, that the floor was not reached.
 */
export function runPlanWhy(plan: RunPlan): string | null {
  if (plan.samples <= 1) return null;
  const floor = MIN_RESPONSES_PER_RUN;
  if (plan.reason === "capped") {
    return `Repetimos el set ${plan.samples} veces, el máximo: con una sola pasada tendrías ${plan.singlePassResponses} respuestas y buscamos ${floor}. Aun así quedan ${plan.expectedResponses}, así que la puntuación mostrará su margen de error.`;
  }
  return `Una sola pasada daría ${plan.singlePassResponses} respuestas. Repetimos el set ${plan.samples} veces para llegar al mínimo de ${floor}, así la puntuación no depende de una sola respuesta.`;
}

/** What the `0/30` counter counts, in one line. */
export function launchUnitNote(plan: RunPlan): string {
  const engines = plan.engines === 1 ? "al motor" : `a los ${plan.engines} motores`;
  return `Un lanzamiento es un prompt en una pasada, enviado ${engines}: ${plan.launches} lanzamientos dan ${plan.expectedResponses} respuestas.`;
}
