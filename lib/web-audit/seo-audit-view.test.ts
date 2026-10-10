import { describe, expect, it } from "vitest";
import type { IssueCheckKey, TechnicalIssue, TechnicalPassingCheck } from "@/lib/web-audit/issues";
import { ISSUE_CHECK_META } from "@/lib/web-audit/issue-labels";
import { SEO_AREAS, buildFixList, buildSeoAreas, seoScoreBand } from "@/lib/web-audit/seo-audit-view";

function issue(check: IssueCheckKey, overrides: Partial<TechnicalIssue> = {}): TechnicalIssue {
  return {
    check,
    severity: "warning",
    affectedCount: 1,
    applicableCount: 4,
    pointDelta: 1,
    affectedLabels: ["https://acme.com/"],
    ...overrides
  };
}

function pass(check: IssueCheckKey, passedCount: number, applicableCount: number): TechnicalPassingCheck {
  return { check, passedCount, applicableCount };
}

describe("SEO_AREAS", () => {
  it("puts every check in exactly one area", () => {
    const all = SEO_AREAS.flatMap((a) => a.checks);
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual(Object.keys(ISSUE_CHECK_META).sort());
  });
});

describe("buildSeoAreas", () => {
  it("is the share of measured instances that pass, per area", () => {
    const areas = buildSeoAreas({
      issues: [issue("noindex", { affectedCount: 1, applicableCount: 4 })],
      passing: [pass("noindex", 3, 4), pass("canonical", 4, 4), pass("structured_data", 1, 4)]
    });
    expect(areas.find((a) => a.key === "crawl")?.pct).toBe(88); // 7 of 8
    expect(areas.find((a) => a.key === "structured")?.pct).toBe(25);
  });

  it("counts a check that fails everywhere as zero passed", () => {
    const areas = buildSeoAreas({
      issues: [issue("structured_data", { affectedCount: 4, applicableCount: 4 })],
      passing: []
    });
    expect(areas).toEqual([expect.objectContaining({ key: "structured", pct: 0 })]);
  });

  it("leaves out an area with nothing measured instead of showing a filler bar", () => {
    const areas = buildSeoAreas({ issues: [], passing: [pass("title_length", 2, 2)] });
    expect(areas.map((a) => a.key)).toEqual(["tags"]);
  });
});

describe("buildFixList", () => {
  it("lists issues first in the report's order, then the checks every page passes", () => {
    const list = buildFixList({
      issues: [issue("noindex", { severity: "critical" }), issue("two_h2", { severity: "improvement" })],
      passing: [pass("noindex", 3, 4), pass("single_h1", 4, 4), pass("canonical", 2, 3)]
    });
    expect(list.rows.map((r) => (r.kind === "issue" ? r.issue.check : `ok:${r.passing.check}`))).toEqual([
      "noindex",
      "two_h2",
      "ok:single_h1"
    ]);
    expect(list.counts).toEqual({ all: 3, critical: 1, warning: 0, improvement: 1, ok: 1 });
  });

  it("never lists a partly failing check as «Bien»", () => {
    const list = buildFixList({ issues: [issue("canonical")], passing: [pass("canonical", 3, 4)] });
    expect(list.counts.ok).toBe(0);
  });
});

describe("seoScoreBand", () => {
  it("uses the same thresholds as the page rings", () => {
    expect(seoScoreBand(70).label).toBe("Buena");
    expect(seoScoreBand(69).label).toBe("Mejorable");
    expect(seoScoreBand(40).label).toBe("Mejorable");
    expect(seoScoreBand(39).label).toBe("Baja");
  });
});
