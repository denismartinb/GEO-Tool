import { describe, expect, it } from "vitest";
import { GEO_SCORE_COMPONENT_META, parseEngineCoverage, translateDroppedComponentReason } from "./geo-score-breakdown";

describe("GEO_SCORE_COMPONENT_META", () => {
  it("has a Spanish label, hint, and icon for all five GEO-SCORE-V4 components", () => {
    for (const key of ["presence", "prominence", "standing", "authority", "technical"] as const) {
      expect(GEO_SCORE_COMPONENT_META[key].label.length).toBeGreaterThan(0);
      expect(GEO_SCORE_COMPONENT_META[key].hint.length).toBeGreaterThan(0);
      expect(GEO_SCORE_COMPONENT_META[key].icon.length).toBeGreaterThan(0);
    }
  });
});

describe("translateDroppedComponentReason", () => {
  it("translates every real dropped-component reason emitted by run-scoring.ts / geo-score-technical.ts", () => {
    const cases: Array<[string, RegExp]> = [
      [
        "extraction predates the current pipeline version — competitor-set reconciliation and/or mention verification may be incomplete for this run (docs/adr/0018, docs/adr/0021)",
        /versión de extracción anterior/
      ],
      [
        "the brand was mentioned in 2 prompts; rank-when-mentioned needs at least 3 to mean anything (geo-score-v3)",
        /2 respuestas de IA/
      ],
      ["brand_position absent, or the brand was never mentioned in this run", /no apareció en ninguna respuesta/],
      ["no competitors tracked for this project (nothing to share voice with, docs/adr/0018)", /No tienes competidores configurados/],
      [
        "no brand or tracked-competitor mentions in this run (share-of-voice denominator is 0, ADR 0015)",
        /Ni tu marca ni tus competidores/
      ],
      [
        "no grounded (citation-capable) provider rows in this run, or no project domain to match citations against (docs/adr/0012, docs/adr/0013)",
        /Ningún motor con capacidad de citar fuentes/
      ],
      ["no technical audit has been recorded for this project yet (docs/adr/0027)", /todavía no tiene ninguna auditoría técnica/],
      ["the project's technical audits produced no readiness score (no page could be analysed)", /no pudo analizar ninguna página/],
      ["the run has no finish time to resolve a technical snapshot against", /no tiene una fecha de fin/],
      [
        "no technical audit within 30 days before this scan (the audit for this scan may still be running, docs/adr/0027)",
        /auditoría técnica reciente/
      ],
      [
        "no technical readiness audit available for this run (docs/adr/0027, docs/adr/0033)",
        /Todavía no hay una auditoría técnica disponible/
      ]
    ];

    for (const [reason, expected] of cases) {
      expect(translateDroppedComponentReason(reason)).toMatch(expected);
    }
  });

  it("uses the singular form for exactly 1 mention", () => {
    expect(translateDroppedComponentReason("the brand was mentioned in 1 prompts; rank-when-mentioned needs at least 3 to mean anything")).toMatch(
      /1 respuesta de IA/
    );
    expect(
      translateDroppedComponentReason("the brand was mentioned in 1 prompts; rank-when-mentioned needs at least 3 to mean anything")
    ).not.toMatch(/1 respuestas/);
  });

  it("never leaks raw English or an ADR reference for an unrecognized reason", () => {
    const result = translateDroppedComponentReason("some future reason string nobody wrote yet (docs/adr/9999)");
    expect(result).not.toMatch(/adr/i);
    expect(result.length).toBeGreaterThan(0);
  });

  it("handles null/undefined reasons without throwing", () => {
    expect(() => translateDroppedComponentReason(null)).not.toThrow();
    expect(() => translateDroppedComponentReason(undefined)).not.toThrow();
  });
});

describe("parseEngineCoverage", () => {
  it("returns null for null/undefined input", () => {
    expect(parseEngineCoverage(null)).toBeNull();
    expect(parseEngineCoverage(undefined)).toBeNull();
  });

  it("returns null when status is missing (malformed/legacy row)", () => {
    expect(parseEngineCoverage({})).toBeNull();
  });

  it("fills in missing array fields with empty arrays rather than undefined", () => {
    const result = parseEngineCoverage({ status: "partial" });
    expect(result).toEqual({ status: "partial", expected: [], observed: [], missing: [], unexpected: [] });
  });

  it("passes through a fully-populated coverage object unchanged", () => {
    const input = {
      status: "partial" as const,
      expected: ["gemini", "openai", "claude"],
      observed: ["gemini", "claude"],
      missing: ["openai"],
      unexpected: []
    };
    expect(parseEngineCoverage(input)).toEqual(input);
  });
});
