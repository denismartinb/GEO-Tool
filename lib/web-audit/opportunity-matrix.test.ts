import { describe, it, expect } from "vitest";
import { buildWebAuditSummary, hasOwnDomainGroundingCitation } from "./opportunity-matrix";
import { NOT_COVERED_NOTE, COULD_NOT_VERIFY_NOTE, type DomainCoverageMap } from "./coverage-map";
import type { PromptResultLite } from "./opportunity-matrix";

const PROJECT_DOMAIN = "acme.com";

function coverage(topics: DomainCoverageMap["topics"]): DomainCoverageMap {
  return { scanId: "scan-1", generatedAt: "2026-07-01T00:00:00.000Z", topics };
}

function result(overrides: Partial<PromptResultLite> = {}): PromptResultLite {
  return {
    prompt_id: "p1",
    extracted_json: { citations: [] },
    provider: "gemini",
    mentioned_competitors_count: 0,
    ...overrides
  };
}

function ownGroundingCitation(domain: string) {
  return { citations: [{ domain, source: "grounding" }] };
}

describe("hasOwnDomainGroundingCitation", () => {
  it("counts an exact-domain grounding citation", () => {
    expect(hasOwnDomainGroundingCitation(ownGroundingCitation("acme.com"), "acme.com", "gemini")).toBe(true);
  });

  it("counts a real subdomain (label-boundary match)", () => {
    expect(hasOwnDomainGroundingCitation(ownGroundingCitation("blog.acme.com"), "acme.com", "gemini")).toBe(true);
  });

  it("rejects a domain that merely contains the root as a substring", () => {
    expect(hasOwnDomainGroundingCitation(ownGroundingCitation("evilacme.com"), "acme.com", "gemini")).toBe(false);
  });

  it("normalizes scheme and www. before matching", () => {
    expect(hasOwnDomainGroundingCitation(ownGroundingCitation("www.acme.com"), "acme.com", "gemini")).toBe(true);
  });

  it("ignores an inline (non-grounding) citation even to the own domain", () => {
    expect(
      hasOwnDomainGroundingCitation({ citations: [{ domain: "acme.com", source: "inline" }] }, "acme.com", "gemini")
    ).toBe(false);
  });

  it("ignores a grounding citation from a row whose provider is not grounded", () => {
    expect(hasOwnDomainGroundingCitation(ownGroundingCitation("acme.com"), "acme.com", "claude")).toBe(false);
  });

  it("treats a null/missing provider as grounded (historical Gemini-only rows)", () => {
    expect(hasOwnDomainGroundingCitation(ownGroundingCitation("acme.com"), "acme.com", null)).toBe(true);
  });
});

describe("buildWebAuditSummary — classification", () => {
  it("classifies a covered, cited topic as performing", () => {
    const summary = buildWebAuditSummary({
      coverage: coverage([{ promptId: "p1", topic: "t1", found: true, pages: [{ url: "https://acme.com/a", title: "A" }], note: "n" }]),
      results: [result({ extracted_json: ownGroundingCitation("acme.com") })],
      projectDomain: PROJECT_DOMAIN
    });
    expect(summary.topics[0].outcome).toBe("performing");
  });

  it("classifies a covered, uncited topic as invisible", () => {
    const summary = buildWebAuditSummary({
      coverage: coverage([{ promptId: "p1", topic: "t1", found: true, pages: [{ url: "https://acme.com/a", title: "A" }], note: "n" }]),
      results: [result()],
      projectDomain: PROJECT_DOMAIN
    });
    expect(summary.topics[0].outcome).toBe("invisible");
  });

  it("classifies an uncovered, uncited topic with competitors mentioned as content_gap", () => {
    const summary = buildWebAuditSummary({
      coverage: coverage([{ promptId: "p1", topic: "t1", found: false, pages: [], note: NOT_COVERED_NOTE }]),
      results: [result({ mentioned_competitors_count: 2 })],
      projectDomain: PROJECT_DOMAIN
    });
    expect(summary.topics[0].outcome).toBe("content_gap");
  });

  it("classifies an uncovered, uncited topic with no competitors as open_opportunity", () => {
    const summary = buildWebAuditSummary({
      coverage: coverage([{ promptId: "p1", topic: "t1", found: false, pages: [], note: NOT_COVERED_NOTE }]),
      results: [result({ mentioned_competitors_count: 0 })],
      projectDomain: PROJECT_DOMAIN
    });
    expect(summary.topics[0].outcome).toBe("open_opportunity");
  });

  it("classifies an uncovered but cited topic as unverified_cited", () => {
    const summary = buildWebAuditSummary({
      coverage: coverage([{ promptId: "p1", topic: "t1", found: false, pages: [], note: NOT_COVERED_NOTE }]),
      results: [result({ extracted_json: ownGroundingCitation("acme.com") })],
      projectDomain: PROJECT_DOMAIN
    });
    expect(summary.topics[0].outcome).toBe("unverified_cited");
  });

  it("classifies a COULD_NOT_VERIFY_NOTE topic as inconclusive regardless of result data", () => {
    const summary = buildWebAuditSummary({
      coverage: coverage([{ promptId: "p1", topic: "t1", found: false, pages: [], note: COULD_NOT_VERIFY_NOTE }]),
      results: [result({ extracted_json: ownGroundingCitation("acme.com") })],
      projectDomain: PROJECT_DOMAIN
    });
    expect(summary.topics[0].outcome).toBe("inconclusive");
  });

  it("classifies a topic with no matching scan result as inconclusive", () => {
    const summary = buildWebAuditSummary({
      coverage: coverage([{ promptId: "p-missing", topic: "t1", found: true, pages: [], note: "n" }]),
      results: [],
      projectDomain: PROJECT_DOMAIN
    });
    expect(summary.topics[0].outcome).toBe("inconclusive");
  });

  it("excludes inconclusive topics from every denominator", () => {
    const summary = buildWebAuditSummary({
      coverage: coverage([
        { promptId: "p1", topic: "t1", found: true, pages: [{ url: "https://acme.com/a", title: "A" }], note: "n" },
        { promptId: "p2", topic: "t2", found: false, pages: [], note: COULD_NOT_VERIFY_NOTE }
      ]),
      results: [result({ prompt_id: "p1", extracted_json: ownGroundingCitation("acme.com") })],
      projectDomain: PROJECT_DOMAIN
    });
    expect(summary.conclusiveCount).toBe(1);
    expect(summary.coveredCount).toBe(1);
    expect(summary.coveragePct).toBe(100);
  });

  it("returns null percentages on an empty denominator instead of 0", () => {
    const summary = buildWebAuditSummary({
      coverage: coverage([{ promptId: "p1", topic: "t1", found: false, pages: [], note: COULD_NOT_VERIFY_NOTE }]),
      results: [],
      projectDomain: PROJECT_DOMAIN
    });
    expect(summary.conclusiveCount).toBe(0);
    expect(summary.coveragePct).toBeNull();
    expect(summary.surfacingPct).toBeNull();
  });

  it("keeps quadrant counts consistent with the total topic count", () => {
    const topics: DomainCoverageMap["topics"] = [
      { promptId: "p1", topic: "performing", found: true, pages: [{ url: "https://acme.com/a", title: "A" }], note: "n" },
      { promptId: "p2", topic: "invisible", found: true, pages: [{ url: "https://acme.com/b", title: "B" }], note: "n" },
      { promptId: "p3", topic: "content_gap", found: false, pages: [], note: NOT_COVERED_NOTE },
      { promptId: "p4", topic: "open_opportunity", found: false, pages: [], note: NOT_COVERED_NOTE },
      { promptId: "p5", topic: "unverified_cited", found: false, pages: [], note: NOT_COVERED_NOTE },
      { promptId: "p6", topic: "inconclusive", found: false, pages: [], note: COULD_NOT_VERIFY_NOTE }
    ];
    const results: PromptResultLite[] = [
      result({ prompt_id: "p1", extracted_json: ownGroundingCitation("acme.com") }),
      result({ prompt_id: "p2" }),
      result({ prompt_id: "p3", mentioned_competitors_count: 1 }),
      result({ prompt_id: "p4", mentioned_competitors_count: 0 }),
      result({ prompt_id: "p5", extracted_json: ownGroundingCitation("acme.com") })
      // p6 intentionally has no matching result row
    ];
    const summary = buildWebAuditSummary({ coverage: coverage(topics), results, projectDomain: PROJECT_DOMAIN });
    const counts = summary.topics.reduce<Record<string, number>>((acc, t) => {
      acc[t.outcome] = (acc[t.outcome] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts).toEqual({
      performing: 1,
      invisible: 1,
      content_gap: 1,
      open_opportunity: 1,
      unverified_cited: 1,
      inconclusive: 1
    });
    expect(summary.topics.length).toBe(6);
  });
});
