import { describe, it, expect } from "vitest";
import { computeCoverageOverlay } from "./coverage-overlay";
import { NOT_COVERED_NOTE, COULD_NOT_VERIFY_NOTE } from "./domain-coverage";

function rec(overrides: Partial<{
  id: string;
  recommendationType: string;
  resultId: string | null;
  confidence: "low" | "medium" | "high";
}> = {}) {
  return {
    id: "rec-1",
    recommendationType: "add_citation_block",
    resultId: "result-1",
    confidence: "medium" as const,
    ...overrides
  };
}

describe("computeCoverageOverlay", () => {
  it("returns an empty map when there are no coverage topics at all", () => {
    const overlay = computeCoverageOverlay({
      recommendations: [rec()],
      resultIdToPromptId: new Map([["result-1", "prompt-1"]]),
      coverageTopics: []
    });
    expect(overlay.size).toBe(0);
  });

  it("marks a confirmed surfacing gap when the topic is found:true, bumping confidence and attaching the verified page", () => {
    const overlay = computeCoverageOverlay({
      recommendations: [rec({ confidence: "medium" })],
      resultIdToPromptId: new Map([["result-1", "prompt-1"]]),
      coverageTopics: [
        { promptId: "prompt-1", topic: "x", found: true, pages: [{ url: "https://acme.com/a", title: "A" }], note: "n" }
      ]
    });
    const entry = overlay.get("rec-1");
    expect(entry?.state).toBe("confirmed_surfacing_gap");
    expect(entry?.verifiedPage).toEqual({ url: "https://acme.com/a", title: "A" });
    expect(entry?.confidenceOverride).toBe("high");
  });

  it("bumps low confidence to medium (does not jump straight to high)", () => {
    const overlay = computeCoverageOverlay({
      recommendations: [rec({ confidence: "low" })],
      resultIdToPromptId: new Map([["result-1", "prompt-1"]]),
      coverageTopics: [{ promptId: "prompt-1", topic: "x", found: true, pages: [], note: "n" }]
    });
    expect(overlay.get("rec-1")?.confidenceOverride).toBe("medium");
  });

  it("caps high confidence at high", () => {
    const overlay = computeCoverageOverlay({
      recommendations: [rec({ confidence: "high" })],
      resultIdToPromptId: new Map([["result-1", "prompt-1"]]),
      coverageTopics: [{ promptId: "prompt-1", topic: "x", found: true, pages: [], note: "n" }]
    });
    expect(overlay.get("rec-1")?.confidenceOverride).toBe("high");
  });

  it("marks a possible content gap when the topic is confirmed not-covered, without bumping confidence", () => {
    const overlay = computeCoverageOverlay({
      recommendations: [rec({ confidence: "medium" })],
      resultIdToPromptId: new Map([["result-1", "prompt-1"]]),
      coverageTopics: [{ promptId: "prompt-1", topic: "x", found: false, pages: [], note: NOT_COVERED_NOTE }]
    });
    const entry = overlay.get("rec-1");
    expect(entry?.state).toBe("possible_content_gap");
    expect(entry?.verifiedPage).toBeNull();
    expect(entry?.confidenceOverride).toBeNull();
  });

  it("leaves the card unchanged (no overlay entry) when the topic could not be verified", () => {
    const overlay = computeCoverageOverlay({
      recommendations: [rec()],
      resultIdToPromptId: new Map([["result-1", "prompt-1"]]),
      coverageTopics: [{ promptId: "prompt-1", topic: "x", found: false, pages: [], note: COULD_NOT_VERIFY_NOTE }]
    });
    expect(overlay.has("rec-1")).toBe(false);
  });

  it("ignores recommendation types other than add_citation_block", () => {
    const overlay = computeCoverageOverlay({
      recommendations: [rec({ recommendationType: "increase_brand_visibility" })],
      resultIdToPromptId: new Map([["result-1", "prompt-1"]]),
      coverageTopics: [{ promptId: "prompt-1", topic: "x", found: true, pages: [], note: "n" }]
    });
    expect(overlay.size).toBe(0);
  });

  it("leaves the card unchanged when the recommendation has no resultId", () => {
    const overlay = computeCoverageOverlay({
      recommendations: [rec({ resultId: null })],
      resultIdToPromptId: new Map([["result-1", "prompt-1"]]),
      coverageTopics: [{ promptId: "prompt-1", topic: "x", found: true, pages: [], note: "n" }]
    });
    expect(overlay.size).toBe(0);
  });

  it("leaves the card unchanged when the resultId has no known promptId mapping", () => {
    const overlay = computeCoverageOverlay({
      recommendations: [rec({ resultId: "result-unmapped" })],
      resultIdToPromptId: new Map([["result-1", "prompt-1"]]),
      coverageTopics: [{ promptId: "prompt-1", topic: "x", found: true, pages: [], note: "n" }]
    });
    expect(overlay.size).toBe(0);
  });

  it("leaves the card unchanged when the mapped promptId has no matching coverage topic (older/different scan)", () => {
    const overlay = computeCoverageOverlay({
      recommendations: [rec()],
      resultIdToPromptId: new Map([["result-1", "prompt-999"]]),
      coverageTopics: [{ promptId: "prompt-1", topic: "x", found: true, pages: [], note: "n" }]
    });
    expect(overlay.size).toBe(0);
  });

  it("handles multiple recommendations independently", () => {
    const overlay = computeCoverageOverlay({
      recommendations: [
        rec({ id: "rec-a", resultId: "result-a", confidence: "low" }),
        rec({ id: "rec-b", resultId: "result-b", confidence: "medium" }),
        rec({ id: "rec-c", resultId: "result-c", confidence: "medium" })
      ],
      resultIdToPromptId: new Map([
        ["result-a", "prompt-a"],
        ["result-b", "prompt-b"],
        ["result-c", "prompt-c"]
      ]),
      coverageTopics: [
        { promptId: "prompt-a", topic: "a", found: true, pages: [{ url: "https://acme.com/a", title: "A" }], note: "n" },
        { promptId: "prompt-b", topic: "b", found: false, pages: [], note: NOT_COVERED_NOTE }
        // prompt-c has no coverage topic at all.
      ]
    });
    expect(overlay.get("rec-a")?.state).toBe("confirmed_surfacing_gap");
    expect(overlay.get("rec-b")?.state).toBe("possible_content_gap");
    expect(overlay.has("rec-c")).toBe(false);
  });
});
