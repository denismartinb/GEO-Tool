import { describe, expect, it } from "vitest";
import { DATA_MATURITY_TARGET_SCANS, computeDataMaturity } from "./project-workspace";

describe("computeDataMaturity", () => {
  it("hides while a run is pending or running, regardless of plan/history", () => {
    for (const latestStatus of ["pending", "running"]) {
      expect(
        computeDataMaturity({ completedScans: 2, latestStatus, recurringEnabled: true, planId: "pro" })
      ).toEqual({ kind: "hidden" });
    }
  });

  it("hides when there is no completed scan yet, even on a paid plan with tracking on", () => {
    expect(
      computeDataMaturity({ completedScans: 0, latestStatus: "failed", recurringEnabled: true, planId: "pro" })
    ).toEqual({ kind: "hidden" });
    expect(
      computeDataMaturity({ completedScans: 0, latestStatus: undefined, recurringEnabled: true, planId: "pro" })
    ).toEqual({ kind: "hidden" });
  });

  it("hides once the history target is reached, and never re-shows past it", () => {
    expect(
      computeDataMaturity({
        completedScans: DATA_MATURITY_TARGET_SCANS,
        latestStatus: "completed",
        recurringEnabled: true,
        planId: "pro"
      })
    ).toEqual({ kind: "hidden" });
    expect(
      computeDataMaturity({
        completedScans: DATA_MATURITY_TARGET_SCANS + 3,
        latestStatus: "completed",
        recurringEnabled: true,
        planId: "pro"
      })
    ).toEqual({ kind: "hidden" });
  });

  it("shows the free-plan variant regardless of tracking state", () => {
    expect(
      computeDataMaturity({ completedScans: 1, latestStatus: "completed", recurringEnabled: false, planId: "free" })
    ).toEqual({ kind: "free" });
  });

  it("shows the no-tracking CTA for a non-free plan with recurring scans off", () => {
    expect(
      computeDataMaturity({ completedScans: 1, latestStatus: "completed", recurringEnabled: false, planId: "pro" })
    ).toEqual({ kind: "no_tracking" });
  });

  it("computes daily cadence for pro/agency and derives the correct ETA", () => {
    expect(
      computeDataMaturity({ completedScans: 2, latestStatus: "completed", recurringEnabled: true, planId: "pro" })
    ).toEqual({ kind: "accumulating", completed: 2, target: 5, cadenceUnit: "días", etaCount: 3 });
    expect(
      computeDataMaturity({ completedScans: 4, latestStatus: "completed", recurringEnabled: true, planId: "agency" })
    ).toEqual({ kind: "accumulating", completed: 4, target: 5, cadenceUnit: "días", etaCount: 1 });
  });

  it("computes weekly cadence for starter", () => {
    expect(
      computeDataMaturity({ completedScans: 3, latestStatus: "completed", recurringEnabled: true, planId: "starter" })
    ).toEqual({ kind: "accumulating", completed: 3, target: 5, cadenceUnit: "semanas", etaCount: 2 });
  });
});
