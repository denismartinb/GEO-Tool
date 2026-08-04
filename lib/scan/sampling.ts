/**
 * SAMPLING-1 — the response floor (Fase 2 de
 * docs/geo-score-variability-2026-08.md, ADR 0030).
 *
 * Pure and dependency-free on purpose: this module decides how many times a
 * run repeats its prompt set, and that decision has to be reproducible in a
 * test without a database, an env var or a plan lookup.
 *
 * The problem it solves, measured rather than assumed
 * (docs/geo-score-variability-2026-08.md §1): a GEO score computed over 3 AI
 * responses moves ~24 points when a single response changes, and the founder
 * saw 44 points of movement between two consecutive scans of an unchanged
 * project. `lib/scoring/score-reliability.ts` already makes the product
 * HONEST about that (it withholds the band and the delta below
 * MIN_RESPONSES_FOR_BAND), but honesty is not precision: no formula
 * stabilises a score computed over three answers. The only thing that
 * genuinely lowers the noise is more sample.
 *
 * What this is NOT: a scoring change. Nothing here touches a weight, a
 * threshold or a formula (`.claude/rules/scoring.md`). It changes the SIZE OF
 * THE SAMPLE those formulas run over, and nothing else.
 */

/**
 * Minimum AI responses (prompt x engine x sample rows) a run should reach
 * before its score is published.
 *
 * Founder decision, 2026-08-04. Chosen over the alternatives with the
 * tradeoff stated rather than glossed: the Wilson margin shrinks with
 * 1/sqrt(n), so moving a run from 30 to 60 responses narrows the interval
 * from roughly +/-18pp to +/-13pp — a real 29% improvement, NOT a
 * transformation. Halving the margin would take ~120 responses. 50 is where
 * the curve stops paying for itself against per-scan cost: it clears
 * MIN_RESPONSES_FOR_BAND (10) and the >=20 "high confidence" bar
 * (lib/scoring/run-scoring.ts) with room to spare, and the score keeps
 * showing its margin alongside regardless.
 */
export const MIN_RESPONSES_PER_RUN = 50;

/**
 * Hard cap on repetitions of the same prompt within one run.
 *
 * Founder decision E1, 2026-08-04. Without it the formula is pathological at
 * the small end: a 1-prompt project on 3 engines would need 17 repetitions —
 * 51 LLM calls and 17 chained execution batches (ADR 0014) for a single
 * question, in the middle of onboarding. 5 covers every project from 4
 * prompts up (4 x 3 x 5 = 60) and bounds the worst case at 15 calls.
 *
 * A project too small to reach the floor even at this cap publishes anyway,
 * with its sample size and margin on screen — that is decision E2, and it is
 * the behaviour `lib/scoring/score-reliability.ts` already implements. The
 * alternative (hiding the score) would withhold evidence the user paid for.
 */
export const MAX_PROMPT_SAMPLES = 5;

/**
 * Plans excluded from the floor.
 *
 * Founder decision D1, 2026-08-04: Free stays out. Its single scan is 10
 * prompts on 1 engine, so reaching 50 would mean 5x the cost on the tier that
 * pays nothing. At n=10 it sits exactly on MIN_RESPONSES_FOR_BAND and the
 * reliability layer already shows the margin, so the number it publishes is
 * imprecise but never dishonest.
 */
const SAMPLING_EXCLUDED_PLAN_IDS: readonly string[] = ["free"];

/**
 * Domains that never sample, matched exactly after normalisation.
 *
 * Founder decision E1, 2026-08-04. `mozilla.org` is the agentic pilot's
 * reserved write-project (`PILOT_WRITE_DOMAIN`, tests/pilot/support/
 * write-guard.ts), which CLAUDE.md requires to be created trimmed to one
 * prompt precisely so a scan there costs ~1 LLM call rather than ~30. The
 * floor would take that to 15 and break the "bounded cost" rule the whole
 * write-journey exception rests on.
 *
 * Stated cost of this exemption, because it is real: a genuine customer whose
 * domain is mozilla.org would silently get no sampling. That is accepted —
 * CLAUDE.md already reserves this exact domain for the pilot — and
 * `sampling.test.ts` pins this list to PILOT_WRITE_DOMAIN so the two cannot
 * drift apart into a pilot that quietly costs 5x.
 */
const SAMPLING_EXEMPT_DOMAINS: readonly string[] = ["mozilla.org"];

function normalizeDomain(domain: string): string {
  const trimmed = domain.trim().toLowerCase();
  const withoutScheme = trimmed.replace(/^https?:\/\//, "");
  const host = withoutScheme.split("/")[0] ?? "";
  return host.startsWith("www.") ? host.slice("www.".length) : host;
}

export type SamplingReason =
  /** No prompts or no engines — there is nothing to size. */
  | "no_work"
  /** This domain is exempt from the floor (see SAMPLING_EXEMPT_DOMAINS). */
  | "domain_exempt"
  /** This plan is excluded from the floor (see SAMPLING_EXCLUDED_PLAN_IDS). */
  | "plan_excluded"
  /** prompts x engines already clears the floor on its own. */
  | "floor_met"
  /** Repetitions were added and the floor is reached. */
  | "repeated"
  /** Repetitions were capped by MAX_PROMPT_SAMPLES; the floor is NOT reached. */
  | "capped";

export type SamplingDecision = {
  /** Times each prompt is asked of each engine in this run (>= 1). */
  samples: number;
  /** Responses this run is sized to produce: prompts x engines x samples. */
  projectedResponses: number;
  /** Why `samples` is what it is — persisted with the run for diagnosis. */
  reason: SamplingReason;
};

/**
 * How many times this run should repeat its prompt set.
 *
 * With 3 engines active the floor only ever engages below 17 active prompts
 * (17 x 3 = 51 >= 50), so Starter at its cap (25), Pro (100) and Agencia
 * (300) always come back with `samples: 1` and pay nothing for this feature.
 * The projects that do repeat are exactly the newly-created ones the founder
 * described — the case where the first scan's score was least trustworthy and
 * most visible.
 */
export function computeSampleCount(input: {
  /** Prompts actually scheduled for real LLM calls in this run. */
  promptCount: number;
  /** Engines this run will fan each prompt out to (after the plan cap). */
  engineCount: number;
  /** `profiles.current_plan` as resolved for the project's owner. */
  planId: string;
  /** `projects.domain`, used only for the pilot exemption. */
  domain?: string | null;
}): SamplingDecision {
  const promptCount = Math.max(0, Math.floor(input.promptCount));
  const engineCount = Math.max(0, Math.floor(input.engineCount));
  const baseline = promptCount * engineCount;

  if (baseline <= 0) {
    return { samples: 1, projectedResponses: 0, reason: "no_work" };
  }

  if (input.domain && SAMPLING_EXEMPT_DOMAINS.includes(normalizeDomain(input.domain))) {
    return { samples: 1, projectedResponses: baseline, reason: "domain_exempt" };
  }

  if (SAMPLING_EXCLUDED_PLAN_IDS.includes(input.planId)) {
    return { samples: 1, projectedResponses: baseline, reason: "plan_excluded" };
  }

  if (baseline >= MIN_RESPONSES_PER_RUN) {
    return { samples: 1, projectedResponses: baseline, reason: "floor_met" };
  }

  const needed = Math.ceil(MIN_RESPONSES_PER_RUN / baseline);
  const samples = Math.min(needed, MAX_PROMPT_SAMPLES);

  return {
    samples,
    projectedResponses: baseline * samples,
    reason: needed > MAX_PROMPT_SAMPLES ? "capped" : "repeated"
  };
}

/** Exposed for the test that pins the pilot exemption to PILOT_WRITE_DOMAIN. */
export const SAMPLING_EXEMPT_DOMAINS_FOR_TESTS = SAMPLING_EXEMPT_DOMAINS;
