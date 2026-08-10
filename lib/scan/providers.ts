import "server-only";

import type { Plan } from "@/app/pricing/plans-data";

/**
 * Resolution of the active engine set for a scan.
 *
 * Extracted from `lib/scan/executor.ts` by SAMPLING-1 for one concrete
 * reason: the number of repetitions a run needs is `ceil(floor / (prompts x
 * engines))`, which means `lib/scan/run-creation.ts` — the module that
 * creates the jobs — now has to know the engine count too. Importing the
 * executor from run-creation just to read an env var would drag the whole
 * LLM/scoring/recommendations graph into job creation.
 *
 * `lib/scan/executor.ts` re-exports `getLLMScanProviders` and
 * `LLMScanProvider` so existing call sites keep working unchanged.
 */

export type LLMScanProvider = "gemini" | "claude" | "openai";

const VALID_LLM_SCAN_PROVIDERS: LLMScanProvider[] = ["gemini", "claude", "openai"];

function parseProviderList(raw: string): LLMScanProvider[] {
  const parsed = raw
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter((p): p is LLMScanProvider => VALID_LLM_SCAN_PROVIDERS.includes(p as LLMScanProvider));
  return Array.from(new Set(parsed));
}

/**
 * Engines run concurrently for every prompt in a scan: each prompt gets one
 * scan_prompt_results row per active engine (migration 0009), and KPIs/cards
 * are computed from the combined sample of all engines' rows (no per-engine
 * weighting). LLM_SCAN_PROVIDERS is a comma-separated list (e.g.
 * "gemini,claude"); falls back to the legacy single-value LLM_SCAN_PROVIDER,
 * and defaults to Gemini-only if neither is set, so deployments that never
 * configured either var keep their existing single-engine behavior.
 */
export function getLLMScanProviders(): LLMScanProvider[] {
  const multi = process.env.LLM_SCAN_PROVIDERS?.trim();
  if (multi) {
    const parsed = parseProviderList(multi);
    if (parsed.length) return parsed;
  }

  const legacy = process.env.LLM_SCAN_PROVIDER?.trim().toLowerCase();
  if (legacy === "claude") return ["claude"];
  if (legacy === "openai") return ["openai"];
  return ["gemini"];
}

/**
 * The engine set a given plan's project actually scans with.
 *
 * PRICING-TRUTH-1 (PR b): the active engine set is otherwise a single
 * deployment-wide env var — cap it per the project owner's plan
 * (`caps.engines`) so a Free project never fans out to more engines than its
 * plan promises. `.slice` preserves LLM_SCAN_PROVIDERS' configured order, so
 * whichever engine is listed first is the one every plan gets.
 *
 * Both `executePendingScan` (which makes the calls) and
 * `createPendingScanRunCore` (which sizes the sampling) resolve the engine
 * set through this one function, so the count the repetitions were computed
 * from cannot drift from the count actually executed.
 *
 * `enabledEngines` (ENGINE-DEBUG-TOGGLE-1, migration 0033) narrows the set
 * further, before the plan cap is applied — never widens it. Filtering first
 * matters: a Free project (cap 1) that only enabled Claude/OpenAI must land
 * on Claude, not on an empty set from capping the unfiltered list down to
 * Gemini before the filter ever saw it. `undefined` means "no project
 * override was read" and changes nothing, so every existing call site keeps
 * today's behaviour without passing the new argument.
 */
export function resolveScanProvidersForPlan(
  plan: Plan,
  enabledEngines?: readonly LLMScanProvider[]
): LLMScanProvider[] {
  const configured = getLLMScanProviders();
  const filtered = enabledEngines ? configured.filter((p) => enabledEngines.includes(p)) : configured;
  return filtered.slice(0, plan.caps.engines);
}
