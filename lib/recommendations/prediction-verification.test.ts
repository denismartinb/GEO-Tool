import { describe, expect, it } from "vitest";
import { verifyRecommendationPredictions, type RecommendationToVerify, type VerificationRow } from "./prediction-verification";

const RUN_B = "run-b";

function row(overrides: Partial<VerificationRow> = {}): VerificationRow {
  return {
    provider: "gemini",
    brand_mentioned: false,
    citation_found: false,
    extracted_json: null,
    ...overrides
  };
}

function rec(overrides: Partial<RecommendationToVerify> = {}): RecommendationToVerify {
  return {
    id: "rec-1",
    recommendationType: "increase_brand_visibility",
    resolvedInRunId: RUN_B,
    affectedPrompts: [{ resultId: "result-a1", competitors: [] }],
    ...overrides
  };
}

describe("verifyRecommendationPredictions", () => {
  it("presence: fulfilled when the brand is mentioned in the confirming run", () => {
    const out = verifyRecommendationPredictions({
      recommendations: [rec()],
      oldResultIdToPromptId: new Map([["result-a1", "prompt-1"]]),
      newRunRowsByRunAndPrompt: new Map([[`${RUN_B}:prompt-1`, [row({ brand_mentioned: true })]]]),
      projectDomain: "example.com"
    });
    expect(out.get("rec-1")).toEqual({
      status: "verified",
      verdict: { kind: "presence", fulfilledCount: 1, totalCount: 1 }
    });
  });

  it("presence: not fulfilled when the brand is still absent", () => {
    const out = verifyRecommendationPredictions({
      recommendations: [rec()],
      oldResultIdToPromptId: new Map([["result-a1", "prompt-1"]]),
      newRunRowsByRunAndPrompt: new Map([[`${RUN_B}:prompt-1`, [row({ brand_mentioned: false })]]]),
      projectDomain: "example.com"
    });
    expect(out.get("rec-1")).toEqual({
      status: "verified",
      verdict: { kind: "presence", fulfilledCount: 0, totalCount: 1 }
    });
  });

  it("aggregates one count per engine row answering the same prompt", () => {
    const out = verifyRecommendationPredictions({
      recommendations: [rec()],
      oldResultIdToPromptId: new Map([["result-a1", "prompt-1"]]),
      newRunRowsByRunAndPrompt: new Map([
        [
          `${RUN_B}:prompt-1`,
          [row({ provider: "gemini", brand_mentioned: true }), row({ provider: "openai", brand_mentioned: false })]
        ]
      ]),
      projectDomain: "example.com"
    });
    expect(out.get("rec-1")).toEqual({
      status: "verified",
      verdict: { kind: "presence", fulfilledCount: 1, totalCount: 2 }
    });
  });

  it("prominence: fulfilled once the named rival no longer outranks the brand", () => {
    const out = verifyRecommendationPredictions({
      recommendations: [
        rec({
          recommendationType: "increase_brand_prominence",
          affectedPrompts: [{ resultId: "result-a1", competitors: ["Rival Co"] }]
        })
      ],
      oldResultIdToPromptId: new Map([["result-a1", "prompt-1"]]),
      newRunRowsByRunAndPrompt: new Map([
        [
          `${RUN_B}:prompt-1`,
          [
            row({
              brand_mentioned: true,
              extracted_json: {
                brand: { mentioned: true, position: 1 },
                competitors: [{ name: "Rival Co", mentioned: true, position: 2 }]
              }
            })
          ]
        ]
      ]),
      projectDomain: "example.com"
    });
    expect(out.get("rec-1")).toEqual({
      status: "verified",
      verdict: { kind: "prominence", fulfilledCount: 1, totalCount: 1 }
    });
  });

  it("prominence: not fulfilled while the named rival still ranks ahead", () => {
    const out = verifyRecommendationPredictions({
      recommendations: [
        rec({
          recommendationType: "increase_brand_prominence",
          affectedPrompts: [{ resultId: "result-a1", competitors: ["Rival Co"] }]
        })
      ],
      oldResultIdToPromptId: new Map([["result-a1", "prompt-1"]]),
      newRunRowsByRunAndPrompt: new Map([
        [
          `${RUN_B}:prompt-1`,
          [
            row({
              brand_mentioned: true,
              extracted_json: {
                brand: { mentioned: true, position: 2 },
                competitors: [{ name: "Rival Co", mentioned: true, position: 1 }]
              }
            })
          ]
        ]
      ]),
      projectDomain: "example.com"
    });
    expect(out.get("rec-1")).toEqual({
      status: "verified",
      verdict: { kind: "prominence", fulfilledCount: 0, totalCount: 1 }
    });
  });

  it("prominence: an unnamed competitor ranking ahead does not block fulfillment", () => {
    const out = verifyRecommendationPredictions({
      recommendations: [
        rec({
          recommendationType: "increase_brand_prominence",
          affectedPrompts: [{ resultId: "result-a1", competitors: ["Rival Co"] }]
        })
      ],
      oldResultIdToPromptId: new Map([["result-a1", "prompt-1"]]),
      newRunRowsByRunAndPrompt: new Map([
        [
          `${RUN_B}:prompt-1`,
          [
            row({
              brand_mentioned: true,
              extracted_json: {
                brand: { mentioned: true, position: 2 },
                competitors: [
                  { name: "Rival Co", mentioned: true, position: 3 },
                  { name: "Someone Else", mentioned: true, position: 1 }
                ]
              }
            })
          ]
        ]
      ]),
      projectDomain: "example.com"
    });
    expect(out.get("rec-1")).toEqual({
      status: "verified",
      verdict: { kind: "prominence", fulfilledCount: 1, totalCount: 1 }
    });
  });

  it("authority: fulfilled only on a grounded row carrying an own-domain citation", () => {
    const out = verifyRecommendationPredictions({
      recommendations: [rec({ recommendationType: "add_citation_block" })],
      oldResultIdToPromptId: new Map([["result-a1", "prompt-1"]]),
      newRunRowsByRunAndPrompt: new Map([
        [
          `${RUN_B}:prompt-1`,
          [
            row({
              provider: "gemini",
              citation_found: true,
              extracted_json: { citations: [{ source: "grounding", domain: "example.com" }] }
            })
          ]
        ]
      ]),
      projectDomain: "example.com"
    });
    expect(out.get("rec-1")).toEqual({
      status: "verified",
      verdict: { kind: "authority", fulfilledCount: 1, totalCount: 1 }
    });
  });

  it("authority: an ungrounded provider can never fulfil, even with a citation-shaped payload", () => {
    const out = verifyRecommendationPredictions({
      recommendations: [rec({ recommendationType: "add_citation_block" })],
      oldResultIdToPromptId: new Map([["result-a1", "prompt-1"]]),
      newRunRowsByRunAndPrompt: new Map([
        [
          `${RUN_B}:prompt-1`,
          [
            row({
              provider: "claude",
              citation_found: true,
              extracted_json: { citations: [{ source: "grounding", domain: "example.com" }] }
            })
          ]
        ]
      ]),
      projectDomain: "example.com"
    });
    expect(out.get("rec-1")).toEqual({
      status: "verified",
      verdict: { kind: "authority", fulfilledCount: 0, totalCount: 1 }
    });
  });

  it("no_verdict for a non-quantifiable recommendation type", () => {
    const out = verifyRecommendationPredictions({
      recommendations: [rec({ recommendationType: "create_faq_section" })],
      oldResultIdToPromptId: new Map([["result-a1", "prompt-1"]]),
      newRunRowsByRunAndPrompt: new Map([[`${RUN_B}:prompt-1`, [row({ brand_mentioned: true })]]]),
      projectDomain: "example.com"
    });
    expect(out.get("rec-1")).toEqual({ status: "no_verdict" });
  });

  it("no_verdict when there is no confirming run (dismissed, never auto-resolved)", () => {
    const out = verifyRecommendationPredictions({
      recommendations: [rec({ resolvedInRunId: null })],
      oldResultIdToPromptId: new Map([["result-a1", "prompt-1"]]),
      newRunRowsByRunAndPrompt: new Map(),
      projectDomain: "example.com"
    });
    expect(out.get("rec-1")).toEqual({ status: "no_verdict" });
  });

  it("no_verdict when the old result id never translates to a stable prompt id (fail-closed)", () => {
    const out = verifyRecommendationPredictions({
      recommendations: [rec()],
      oldResultIdToPromptId: new Map(),
      newRunRowsByRunAndPrompt: new Map([[`${RUN_B}:prompt-1`, [row({ brand_mentioned: true })]]]),
      projectDomain: "example.com"
    });
    expect(out.get("rec-1")).toEqual({ status: "no_verdict" });
  });

  it("no_verdict when the confirming run has no matching row for the translated prompt", () => {
    const out = verifyRecommendationPredictions({
      recommendations: [rec()],
      oldResultIdToPromptId: new Map([["result-a1", "prompt-1"]]),
      newRunRowsByRunAndPrompt: new Map(),
      projectDomain: "example.com"
    });
    expect(out.get("rec-1")).toEqual({ status: "no_verdict" });
  });
});
