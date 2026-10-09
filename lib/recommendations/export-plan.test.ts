import { describe, expect, it } from "vitest";

import { recommendationEngineLabels, type ExportPlanRecommendation } from "./export-plan";

const rec = (over: Partial<ExportPlanRecommendation>): ExportPlanRecommendation => ({
  title: "Título",
  description: "Descripción",
  recommendation_type: "add_citation_block",
  ...over,
});

describe("recommendationEngineLabels", () => {
  it("deduplica motores repetidos en varios prompts afectados", () => {
    const labels = recommendationEngineLabels(
      rec({
        evidence_json: {
          affected_prompt_details: [{ provider: "gemini" }, { provider: "openai" }, { provider: "gemini" }],
        },
      }),
    );
    expect(labels).toEqual(["Gemini", "ChatGPT"]);
  });

  it("omite prompts sin provider en vez de asumir Gemini", () => {
    const labels = recommendationEngineLabels(
      rec({ evidence_json: { affected_prompt_details: [{ provider: null }, { provider: "claude" }] } }),
    );
    expect(labels).toEqual(["Claude"]);
  });

  it("devuelve un array vacío sin evidencia", () => {
    expect(recommendationEngineLabels(rec({}))).toEqual([]);
  });
});
