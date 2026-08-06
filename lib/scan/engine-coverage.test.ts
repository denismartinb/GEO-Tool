import { describe, expect, it } from "vitest";

import { computeEngineCoverage, engineCoverageNotice } from "@/lib/scan/engine-coverage";

describe("computeEngineCoverage (GEO-SCORE-V4 Fase B)", () => {
  it("reports complete when every promised engine produced rows", () => {
    const coverage = computeEngineCoverage({
      expectedProviders: ["gemini", "claude", "openai"],
      observedProviders: ["gemini", "claude", "openai", "gemini"]
    });

    expect(coverage.status).toBe("complete");
    expect(coverage.missing).toEqual([]);
    expect(coverage.unexpected).toEqual([]);
  });

  it("names the engine that went silent — the case worth ~13 GEO points", () => {
    // docs/geo-score-variability-2026-08.md §1: the same reality scored 71.67
    // over gemini+openai+claude and 84.31 over claude alone, because losing
    // the grounded engines drops `authority` and renormalizes the weights.
    const coverage = computeEngineCoverage({
      expectedProviders: ["gemini", "claude", "openai"],
      observedProviders: ["claude"]
    });

    expect(coverage.status).toBe("partial");
    expect(coverage.missing).toEqual(["gemini", "openai"]);
  });

  it("is unknown rather than complete when no engines were expected", () => {
    // "Nothing was promised" must never read as "everything was delivered".
    const coverage = computeEngineCoverage({ expectedProviders: [], observedProviders: ["gemini"] });

    expect(coverage.status).toBe("unknown");
  });

  it("records engines that produced rows without being expected", () => {
    const coverage = computeEngineCoverage({
      expectedProviders: ["gemini"],
      observedProviders: ["gemini", "claude"]
    });

    expect(coverage.status).toBe("complete");
    expect(coverage.unexpected).toEqual(["claude"]);
  });

  it("normalizes case, whitespace and duplicates, and ignores non-strings", () => {
    const coverage = computeEngineCoverage({
      expectedProviders: ["Gemini", " gemini ", null, undefined],
      observedProviders: ["GEMINI"]
    });

    expect(coverage.expected).toEqual(["gemini"]);
    expect(coverage.observed).toEqual(["gemini"]);
    expect(coverage.status).toBe("complete");
  });

  it("treats a missing provider (single-engine-era rows) as no observation", () => {
    const coverage = computeEngineCoverage({
      expectedProviders: ["gemini", "claude"],
      observedProviders: [null, undefined]
    });

    expect(coverage.status).toBe("partial");
    expect(coverage.missing).toEqual(["claude", "gemini"]);
  });
});

describe("engineCoverageNotice", () => {
  it("says nothing when coverage is complete or unknown", () => {
    expect(
      engineCoverageNotice({ status: "complete", expected: ["gemini"], observed: ["gemini"], missing: [], unexpected: [] })
    ).toBeNull();
    expect(engineCoverageNotice(null)).toBeNull();
  });

  it("names the missing engine so the user can verify the claim", () => {
    const notice = engineCoverageNotice({
      status: "partial",
      expected: ["gemini", "openai"],
      observed: ["gemini"],
      missing: ["openai"],
      unexpected: []
    });

    expect(notice).toContain("ChatGPT");
    expect(notice).toContain("no respondió");
  });

  it("lists several missing engines in Spanish, with agreement", () => {
    const notice = engineCoverageNotice({
      status: "partial",
      expected: ["gemini", "openai", "claude"],
      observed: ["gemini"],
      missing: ["claude", "openai"],
      unexpected: []
    });

    expect(notice).toContain("Claude y ChatGPT");
    expect(notice).toContain("no respondieron");
  });
});
