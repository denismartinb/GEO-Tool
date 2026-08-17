import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveScanProvidersForPlan, type LLMScanProvider } from "@/lib/scan/providers";
import type { Plan } from "@/app/pricing/plans-data";

function fakePlan(engines: number): Plan {
  return {
    id: "pro",
    name: "test",
    price: 0,
    period: "",
    tagline: "",
    who: "",
    cta: "",
    ctaStyle: "primary",
    highlights: [],
    meter: { projects: "1", prompts: 0, engines, refresh: "" },
    caps: { projects: 1, prompts: 0, engines }
  };
}

describe("resolveScanProvidersForPlan", () => {
  const ORIGINAL_LLM_SCAN_PROVIDERS = process.env.LLM_SCAN_PROVIDERS;

  beforeEach(() => {
    process.env.LLM_SCAN_PROVIDERS = "gemini,claude,openai";
  });

  afterEach(() => {
    if (ORIGINAL_LLM_SCAN_PROVIDERS === undefined) {
      delete process.env.LLM_SCAN_PROVIDERS;
    } else {
      process.env.LLM_SCAN_PROVIDERS = ORIGINAL_LLM_SCAN_PROVIDERS;
    }
  });

  it("without enabledEngines, behaves exactly as before ENGINE-DEBUG-TOGGLE-1", () => {
    expect(resolveScanProvidersForPlan(fakePlan(3))).toEqual(["gemini", "claude", "openai"]);
    expect(resolveScanProvidersForPlan(fakePlan(1))).toEqual(["gemini"]);
  });

  it("narrows to exactly the enabled engines, within the plan cap", () => {
    expect(resolveScanProvidersForPlan(fakePlan(3), ["gemini"])).toEqual(["gemini"]);
    expect(resolveScanProvidersForPlan(fakePlan(3), ["claude", "openai"])).toEqual(["claude", "openai"]);
  });

  it("filters before capping, so a low-cap plan lands on an enabled engine instead of an empty set", () => {
    // Free (cap 1) with only claude/openai enabled: capping the unfiltered
    // ["gemini","claude","openai"] to 1 first would yield ["gemini"], then
    // filtering it out would wrongly return []. Filter-then-cap avoids that.
    expect(resolveScanProvidersForPlan(fakePlan(1), ["claude", "openai"])).toEqual(["claude"]);
  });

  it("never widens the set beyond what the plan or LLM_SCAN_PROVIDERS already allow", () => {
    // Asking for an engine LLM_SCAN_PROVIDERS never configured is a no-op —
    // this override can only narrow, never add an engine back.
    process.env.LLM_SCAN_PROVIDERS = "gemini";
    expect(resolveScanProvidersForPlan(fakePlan(3), ["gemini", "claude", "openai"])).toEqual(["gemini"]);
  });

  it("an empty enabledEngines array resolves to no engines at all", () => {
    // Callers (run-creation.ts, executor.ts) are responsible for rejecting
    // this before it gets here — this function stays a pure, unopinionated
    // filter and does not itself guard against the empty case.
    const empty: LLMScanProvider[] = [];
    expect(resolveScanProvidersForPlan(fakePlan(3), empty)).toEqual([]);
  });
});
