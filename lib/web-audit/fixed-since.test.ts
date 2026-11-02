import { describe, expect, it } from "vitest";
import { fixedSincePrevious, type TechnicalIssuesReport } from "@/lib/web-audit/issues";

const rep = (issues: string[], passing: string[]): TechnicalIssuesReport =>
  ({
    issues: issues.map((check) => ({ check })),
    passing: passing.map((check) => ({ check, passedCount: 1 })),
    analyzedPageCount: 1,
    actualReadinessScore: 50,
    projectedReadinessScore: 60,
    totalPointPotential: 10
  }) as unknown as TechnicalIssuesReport;

describe("fixedSincePrevious (log §446)", () => {
  it("lists what failed before and passes now", () => {
    expect(fixedSincePrevious(rep(["llms_txt_missing", "freshness"], []), rep(["freshness"], ["llms_txt_missing"]))).toEqual(["llms_txt_missing"]);
  });
  it("a check that is no longer measured is not «fixed»", () => {
    expect(fixedSincePrevious(rep(["llms_txt_missing"], []), rep([], []))).toEqual([]);
  });
  it("without a previous audit there is nothing to say", () => {
    expect(fixedSincePrevious(null, rep([], ["freshness"]))).toEqual([]);
  });
});
