import { describe, expect, it } from "vitest";

import {
  describeRunPlan,
  describeRunPlanFromRun,
  launchUnitNote,
  runPlanEquation,
  runPlanFactors,
  runPlanWhy
} from "@/lib/scan/run-plan";
import { computeSampleCount } from "@/lib/scan/sampling";

const PAID = "starter";

/**
 * The run the backend would create (`createPendingScanRunCore`): the same two
 * lines, so the "after" side of every parity check is the real arithmetic.
 */
function runAsCreated(prompts: number, engines: number, planId = PAID) {
  const s = computeSampleCount({ promptCount: prompts, engineCount: engines, planId });
  return { launches: prompts * s.samples, sampleCount: s.samples };
}

describe("describeRunPlan — the cases that reached the founder", () => {
  it("15 prompts x 3 motores: the wizard no longer promises 45, it says 90", () => {
    const plan = describeRunPlan({ prompts: 15, engines: 3, planId: PAID });
    expect(plan).toMatchObject({ samples: 2, launches: 30, expectedResponses: 90, singlePassResponses: 45 });
    expect(runPlanEquation(plan)).toBe("15 prompts × 2 pasadas × 3 motores = 90 respuestas");
  });

  it("elcorteingles.es: 8 prompts x 3 motores x 3 pasadas = 72, not 24", () => {
    const plan = describeRunPlan({ prompts: 8, engines: 3, planId: PAID, domain: "elcorteingles.es" });
    expect(plan).toMatchObject({ samples: 3, launches: 24, expectedResponses: 72, singlePassResponses: 24 });
    expect(runPlanEquation(plan)).toBe("8 prompts × 3 pasadas × 3 motores = 72 respuestas");
  });

  it("Free with a single motor: one pass, no repetition, nothing to explain", () => {
    const plan = describeRunPlan({ prompts: 10, engines: 1, planId: "free" });
    expect(plan).toMatchObject({ samples: 1, launches: 10, expectedResponses: 10, reason: "plan_excluded" });
    expect(runPlanEquation(plan)).toBe("10 prompts × 1 motor = 10 respuestas");
    expect(runPlanWhy(plan)).toBeNull();
  });

  it("Free is NOT promised the 3-motor figure the old wizard printed", () => {
    // The old estimate was prompts x ENGINE_PROVIDERS.length (always 3).
    const old = 10 * 3;
    const plan = describeRunPlan({ prompts: 10, engines: 1, planId: "free" });
    expect(plan.expectedResponses).not.toBe(old);
  });

  it("clears the floor on its own: one pass, no 'pasadas' in the equation", () => {
    const plan = describeRunPlan({ prompts: 20, engines: 3, planId: PAID });
    expect(plan.samples).toBe(1);
    expect(runPlanEquation(plan)).toBe("20 prompts × 3 motores = 60 respuestas");
    expect(runPlanWhy(plan)).toBeNull();
  });

  it("capped: says the floor was NOT reached and that the score shows its margin", () => {
    const plan = describeRunPlan({ prompts: 2, engines: 3, planId: PAID });
    expect(plan).toMatchObject({ samples: 5, expectedResponses: 30, reason: "capped" });
    const why = runPlanWhy(plan) ?? "";
    expect(why).toContain("máximo");
    expect(why).toContain("30");
    expect(why).toContain("margen de error");
  });

  it("switched off per project: no repetition, so no 'why'", () => {
    const plan = describeRunPlan({ prompts: 15, engines: 3, planId: PAID, samplingEnabled: false });
    expect(plan).toMatchObject({ samples: 1, expectedResponses: 45, reason: "manually_disabled" });
    expect(runPlanWhy(plan)).toBeNull();
  });

  it("the pilot's reserved domain never samples", () => {
    const plan = describeRunPlan({ prompts: 1, engines: 3, planId: PAID, domain: "https://www.mozilla.org/" });
    expect(plan).toMatchObject({ samples: 1, expectedResponses: 3, reason: "domain_exempt" });
  });

  it("explains the repetition in terms of the floor of 50, without promising precision", () => {
    const why = runPlanWhy(describeRunPlan({ prompts: 15, engines: 3, planId: PAID })) ?? "";
    expect(why).toContain("45 respuestas");
    expect(why).toContain("mínimo de 50");
    expect(why).not.toMatch(/garantiz|siempre|nunca falla/i);
  });

  it("no work: zero everything, never NaN", () => {
    const plan = describeRunPlan({ prompts: 0, engines: 3, planId: PAID });
    expect(plan).toMatchObject({ samples: 1, launches: 0, expectedResponses: 0 });
  });
});

describe("before and after launch say the same thing", () => {
  const cases: Array<[number, number, string]> = [
    [15, 3, PAID],
    [8, 3, PAID],
    [12, 3, PAID],
    [10, 3, PAID],
    [20, 3, PAID],
    [2, 3, PAID],
    [10, 1, "free"],
    [1, 1, "free"]
  ];

  it.each(cases)("%i prompts x %i motores on %s: wizard estimate === mission figure", (prompts, engines, planId) => {
    const before = describeRunPlan({ prompts, engines, planId });
    const run = runAsCreated(prompts, engines, planId);
    const after = describeRunPlanFromRun({ prompts, engines, launches: run.launches, sampleCount: run.sampleCount });

    expect(after).not.toBeNull();
    expect(after!.expectedResponses).toBe(before.expectedResponses);
    expect(after!.samples).toBe(before.samples);
    expect(after!.launches).toBe(before.launches);
    expect(runPlanEquation(after!)).toBe(runPlanEquation(before));
  });
});

describe("describeRunPlanFromRun", () => {
  it("prefers the persisted sample_count over deducing it from the ratio", () => {
    // 30 launches / 15 prompts would deduce 2; the run says 2 too — but a
    // project whose prompt count changed after launch would deduce wrongly.
    const plan = describeRunPlanFromRun({ prompts: 10, engines: 3, launches: 30, sampleCount: 3 });
    expect(plan?.samples).toBe(3);
  });

  it("falls back to the ratio only for runs without sample_count (pre-0028)", () => {
    const plan = describeRunPlanFromRun({ prompts: 15, engines: 3, launches: 30, sampleCount: null });
    expect(plan?.samples).toBe(2);
  });

  it("returns null instead of inventing a figure when something is unknown", () => {
    expect(describeRunPlanFromRun({ prompts: null, engines: 3, launches: 30 })).toBeNull();
    expect(describeRunPlanFromRun({ prompts: 15, engines: null, launches: 30 })).toBeNull();
    expect(describeRunPlanFromRun({ prompts: 15, engines: 3, launches: null })).toBeNull();
    expect(describeRunPlanFromRun({ prompts: 0, engines: 3, launches: 0 })).toBeNull();
  });

  it("a run that hit the cap of pasadas and stayed under 50 is described as capped, not as having reached it", () => {
    // 2 prompts x 3 motores x 5 pasadas = 30: the mission must not say "para llegar al mínimo de 50".
    const plan = describeRunPlanFromRun({ prompts: 2, engines: 3, launches: 10, sampleCount: 5 });
    expect(plan).toMatchObject({ samples: 5, expectedResponses: 30, reason: "capped" });
    expect(runPlanWhy(plan!)).toContain("Aun así quedan 30");
  });

  it("a run that repeated and reached the floor is not marked capped", () => {
    const plan = describeRunPlanFromRun({ prompts: 15, engines: 3, launches: 30, sampleCount: 2 });
    expect(plan?.reason).toBeNull();
    expect(runPlanWhy(plan!)).toContain("mínimo de 50");
  });

  it("a retry never adds expected responses: the figure is a function of the run's config only", () => {
    // Retries re-run the same lanzamiento and rewrite the same row; there is
    // no input here that could grow with them.
    const a = describeRunPlanFromRun({ prompts: 15, engines: 3, launches: 30, sampleCount: 2 });
    const b = describeRunPlanFromRun({ prompts: 15, engines: 3, launches: 30, sampleCount: 2 });
    expect(a).toEqual(b);
    expect(a?.expectedResponses).toBe(90);
  });
});

describe("copy", () => {
  it("defines the lanzamiento and ties the 0/30 counter to the response total", () => {
    const plan = describeRunPlan({ prompts: 15, engines: 3, planId: PAID });
    expect(launchUnitNote(plan)).toBe(
      "Un lanzamiento es un prompt en una pasada, enviado a los 3 motores: 30 lanzamientos dan 90 respuestas."
    );
  });

  it("singular motor", () => {
    const plan = describeRunPlan({ prompts: 10, engines: 1, planId: "free" });
    expect(launchUnitNote(plan)).toContain("enviado al motor");
    expect(runPlanFactors(plan)).toBe("10 prompts × 1 motor");
  });
});
