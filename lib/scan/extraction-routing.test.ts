import { describe, expect, it } from "vitest";

import { SINGLE_EXTRACTOR_ENV, resolveExtractionRoute } from "./extraction-routing";

describe("resolveExtractionRoute (EXTRACTION-SINGLE-MODEL-1)", () => {
  it("keeps today's behaviour when the switch is unset: each row extracted by its own provider", () => {
    expect(resolveExtractionRoute("gemini", {})).toEqual({ provider: "gemini" });
    expect(resolveExtractionRoute("claude", {})).toEqual({ provider: "claude" });
    expect(resolveExtractionRoute("openai", {})).toEqual({ provider: "openai" });
  });

  it("falls back to Gemini for an unknown provider, as the executor always did", () => {
    expect(resolveExtractionRoute("mystery", {})).toEqual({ provider: "gemini" });
  });

  it("sends every row to the one Claude model when the switch is set", () => {
    const env = { [SINGLE_EXTRACTOR_ENV]: " claude-haiku-5-5 " };
    for (const provider of ["gemini", "claude", "openai"]) {
      expect(resolveExtractionRoute(provider, env)).toEqual({ provider: "claude", model: "claude-haiku-5-5" });
    }
  });

  it("treats an empty value as unset", () => {
    expect(resolveExtractionRoute("openai", { [SINGLE_EXTRACTOR_ENV]: "  " })).toEqual({ provider: "openai" });
  });
});
