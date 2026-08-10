import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  computeSampleCount,
  MAX_PROMPT_SAMPLES,
  MIN_RESPONSES_PER_RUN,
  SAMPLING_EXEMPT_DOMAINS_FOR_TESTS
} from "@/lib/scan/sampling";

const PAID = "starter";

describe("computeSampleCount", () => {
  it("does not repeat when prompts x engines already clears the floor", () => {
    // The founder's own worked example: 20 prompts x 3 engines = 60 >= 50.
    expect(computeSampleCount({ promptCount: 20, engineCount: 3, planId: PAID })).toEqual({
      samples: 1,
      projectedResponses: 60,
      reason: "floor_met"
    });
  });

  it("repeats a small prompt set until it reaches the floor", () => {
    // The other worked example: 10 prompts x 3 engines = 30 < 50, so the set
    // is asked twice for 60 responses.
    expect(computeSampleCount({ promptCount: 10, engineCount: 3, planId: PAID })).toEqual({
      samples: 2,
      projectedResponses: 60,
      reason: "repeated"
    });
  });

  it("engages only below 17 prompts on 3 engines, so real plans pay nothing", () => {
    // 17 x 3 = 51 >= 50; 16 x 3 = 48 < 50. This boundary is the whole reason
    // Starter (25), Pro (100) and Agencia (300) are unaffected in practice —
    // if it ever moves, the cost profile of the product moves with it.
    expect(computeSampleCount({ promptCount: 17, engineCount: 3, planId: PAID }).samples).toBe(1);
    expect(computeSampleCount({ promptCount: 16, engineCount: 3, planId: PAID }).samples).toBe(2);

    for (const promptCount of [25, 100, 300]) {
      expect(computeSampleCount({ promptCount, engineCount: 3, planId: PAID }).samples).toBe(1);
    }
  });

  it("never exceeds MAX_PROMPT_SAMPLES, even when the floor stays out of reach", () => {
    // 1 prompt x 3 engines would need 17 repetitions — 51 calls and 17 chained
    // batches for a single question. Decision E1 caps it; decision E2 says the
    // run publishes anyway, with its margin on screen.
    const decision = computeSampleCount({ promptCount: 1, engineCount: 3, planId: PAID });
    expect(decision.samples).toBe(MAX_PROMPT_SAMPLES);
    expect(decision.projectedResponses).toBe(15);
    expect(decision.projectedResponses).toBeLessThan(MIN_RESPONSES_PER_RUN);
    expect(decision.reason).toBe("capped");
  });

  it("reports 'repeated' only when the floor is actually reached", () => {
    // The distinction matters for diagnosis: "capped" means the run knowingly
    // publishes under the floor, "repeated" means it got there.
    expect(computeSampleCount({ promptCount: 4, engineCount: 3, planId: PAID })).toEqual({
      samples: 5,
      projectedResponses: 60,
      reason: "repeated"
    });
    expect(computeSampleCount({ promptCount: 3, engineCount: 3, planId: PAID }).reason).toBe("capped");
  });

  it("leaves the Free plan alone (decision D1)", () => {
    // Free is 10 prompts x 1 engine. Reaching 50 would be 5x the cost on the
    // tier that pays nothing.
    expect(computeSampleCount({ promptCount: 10, engineCount: 1, planId: "free" })).toEqual({
      samples: 1,
      projectedResponses: 10,
      reason: "plan_excluded"
    });
  });

  it("exempts the pilot's reserved write-project by domain (decision E1)", () => {
    for (const domain of ["mozilla.org", "www.mozilla.org", "HTTPS://Mozilla.org/", " mozilla.org "]) {
      const decision = computeSampleCount({ promptCount: 1, engineCount: 3, planId: PAID, domain });
      expect(decision.samples).toBe(1);
      expect(decision.reason).toBe("domain_exempt");
    }

    // A different domain with the same tiny prompt set is NOT exempt — the
    // guard is an exact domain match, not "any small project".
    expect(computeSampleCount({ promptCount: 1, engineCount: 3, planId: PAID, domain: "acme.com" }).reason).toBe(
      "capped"
    );
  });

  it("returns a harmless decision when there is no work to size", () => {
    for (const input of [
      { promptCount: 0, engineCount: 3 },
      { promptCount: 10, engineCount: 0 },
      { promptCount: -5, engineCount: 3 }
    ]) {
      expect(computeSampleCount({ ...input, planId: PAID })).toEqual({
        samples: 1,
        projectedResponses: 0,
        reason: "no_work"
      });
    }
  });

  it("always returns at least one sample", () => {
    // Nothing may ever return 0: run-creation multiplies the prompt count by
    // this, and a 0 would create a run with no prompt jobs at all, which
    // executePendingScan treats as a hard failure.
    for (let promptCount = 0; promptCount <= 60; promptCount += 1) {
      for (const engineCount of [0, 1, 2, 3]) {
        const { samples } = computeSampleCount({ promptCount, engineCount, planId: PAID });
        expect(samples).toBeGreaterThanOrEqual(1);
        expect(samples).toBeLessThanOrEqual(MAX_PROMPT_SAMPLES);
      }
    }
  });
});

describe("the debug sampling override (SAMPLING-DEBUG-TOGGLE-1)", () => {
  it("stays on by default, matching current shipped behaviour", () => {
    // No caller passes samplingEnabled -> the function's own default must
    // NOT change any existing test's outcome.
    expect(computeSampleCount({ promptCount: 10, engineCount: 3, planId: PAID })).toEqual({
      samples: 2,
      projectedResponses: 60,
      reason: "repeated"
    });
  });

  it("turns sampling off only on an explicit false, never on undefined or true", () => {
    for (const samplingEnabled of [undefined, true]) {
      expect(computeSampleCount({ promptCount: 10, engineCount: 3, planId: PAID, samplingEnabled }).reason).toBe(
        "repeated"
      );
    }

    expect(
      computeSampleCount({ promptCount: 10, engineCount: 3, planId: PAID, samplingEnabled: false })
    ).toEqual({ samples: 1, projectedResponses: 30, reason: "manually_disabled" });
  });

  it("short-circuits before the domain and plan checks, but not before no_work", () => {
    // A project with no work still reports no_work even if sampling is
    // disabled - there is nothing to size either way.
    expect(computeSampleCount({ promptCount: 0, engineCount: 3, planId: PAID, samplingEnabled: false }).reason).toBe(
      "no_work"
    );

    // Disabled wins over the pilot's domain exemption and over the Free plan
    // exclusion: both of those reasons would also produce samples: 1, so the
    // only way to tell them apart is which `reason` is reported.
    expect(
      computeSampleCount({
        promptCount: 1,
        engineCount: 3,
        planId: PAID,
        domain: "mozilla.org",
        samplingEnabled: false
      }).reason
    ).toBe("manually_disabled");

    expect(
      computeSampleCount({ promptCount: 10, engineCount: 1, planId: "free", samplingEnabled: false }).reason
    ).toBe("manually_disabled");
  });
});

describe("the pilot exemption cannot drift from the pilot", () => {
  it("names exactly the domain tests/pilot reserves for its write journeys", () => {
    // Read as text rather than imported: tests/pilot/support/write-guard.ts
    // imports @playwright/test at module scope, which has no business being
    // loaded by a unit test. Same static-guard approach as
    // supabase/migrations/migrations.test.ts.
    //
    // Why this test exists: if the pilot's reserved domain ever changes and
    // this list does not, the write-project silently starts sampling — 15 LLM
    // calls per scan instead of ~1 — and nothing fails. The breakage would be
    // a slow cost leak in CI, which is exactly the kind of thing no one
    // notices.
    const source = readFileSync(join(process.cwd(), "tests", "pilot", "support", "write-guard.ts"), "utf8");
    const match = source.match(/export const PILOT_WRITE_DOMAIN = "([^"]+)"/);

    expect(match?.[1]).toBeTruthy();
    expect(SAMPLING_EXEMPT_DOMAINS_FOR_TESTS).toContain(match![1]);
  });
});
