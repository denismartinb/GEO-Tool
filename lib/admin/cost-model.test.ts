import { describe, expect, it } from "vitest";
import {
  estimateProjectMonthlyCost,
  formatUsd,
  provenanceLabel,
  recurringScansAreEffective
} from "./cost-model";

describe("recurringScansAreEffective", () => {
  it("is false on Free even with the toggle on — the sweep skips Free projects", () => {
    expect(recurringScansAreEffective("free", true)).toBe(false);
  });

  it("is true on a paid plan with the toggle on", () => {
    expect(recurringScansAreEffective("pro", true)).toBe(true);
    expect(recurringScansAreEffective("starter", true)).toBe(true);
  });

  it("is false whenever the toggle is off, whatever the plan", () => {
    expect(recurringScansAreEffective("agency", false)).toBe(false);
  });
});

describe("estimateProjectMonthlyCost", () => {
  it("charges generation + extraction per prompt for each active engine", () => {
    const estimate = estimateProjectMonthlyCost({
      planId: "pro",
      promptCount: 10,
      engines: ["gemini"],
      recurringScansEnabled: false,
      coverageAuditEnabled: false
    });

    // Gemini: $0.0020 generación + $0.0014 extracción = $0.0034/llamada × 10 prompts
    expect(estimate.perScanUsd).toBeCloseTo(0.034, 6);
  });

  it("costs more with more engines enabled — the engine toggles move the number", () => {
    const base = { planId: "pro", promptCount: 10, recurringScansEnabled: false, coverageAuditEnabled: false };
    const one = estimateProjectMonthlyCost({ ...base, engines: ["gemini"] });
    const three = estimateProjectMonthlyCost({ ...base, engines: ["gemini", "claude", "openai"] });

    expect(three.perScanUsd).toBeGreaterThan(one.perScanUsd);
  });

  it("bills zero recurring cost on Free even with the toggle on", () => {
    const estimate = estimateProjectMonthlyCost({
      planId: "free",
      promptCount: 10,
      engines: ["gemini", "claude", "openai"],
      recurringScansEnabled: true,
      coverageAuditEnabled: false
    });

    expect(estimate.monthlyUsd).toBe(0);
    expect(estimate.basis).toContain("sin escaneo recurrente efectivo");
  });

  it("uses the weekly cadence for Starter and the daily one for Pro", () => {
    const base = {
      promptCount: 10,
      engines: ["gemini"] as const,
      recurringScansEnabled: true,
      coverageAuditEnabled: false
    };
    const starter = estimateProjectMonthlyCost({ ...base, engines: [...base.engines], planId: "starter" });
    const pro = estimateProjectMonthlyCost({ ...base, engines: [...base.engines], planId: "pro" });

    expect(pro.monthlyUsd).toBeGreaterThan(starter.monthlyUsd * 5);
  });

  it("downgrades provenance to 'no medido' when the unmeasured coverage audit is included", () => {
    const withAudit = estimateProjectMonthlyCost({
      planId: "pro",
      promptCount: 10,
      engines: ["gemini"],
      recurringScansEnabled: true,
      coverageAuditEnabled: true
    });
    const withoutAudit = estimateProjectMonthlyCost({
      planId: "pro",
      promptCount: 10,
      engines: ["gemini"],
      recurringScansEnabled: true,
      coverageAuditEnabled: false
    });

    // Nunca puede presentarse como más fiable que su parte más floja.
    expect(withAudit.provenance).toBe("no_medido");
    expect(withoutAudit.provenance).toBe("estimado");
    expect(withAudit.monthlyUsd).toBeGreaterThan(withoutAudit.monthlyUsd);
  });

  it("costs nothing per scan when every engine is disabled", () => {
    const estimate = estimateProjectMonthlyCost({
      planId: "pro",
      promptCount: 10,
      engines: [],
      recurringScansEnabled: true,
      coverageAuditEnabled: false
    });

    expect(estimate.perScanUsd).toBe(0);
  });
});

describe("formatUsd", () => {
  it("never renders a real cost as a bare $0.00", () => {
    expect(formatUsd(0)).toBe("$0");
    expect(formatUsd(0.004)).toBe("<$0,01");
    expect(formatUsd(4.7)).toBe("$4,70");
  });
});

describe("provenanceLabel", () => {
  it("has a label for every provenance, so a figure is never shown bare", () => {
    expect(provenanceLabel("medido")).toBe("medido");
    expect(provenanceLabel("estimado")).toBe("estimado");
    expect(provenanceLabel("no_medido")).toBe("sin medir");
  });
});
