import { describe, expect, it } from "vitest";
import { analyzeRunHealth } from "./scan-health-alert";
import { EXTRACTION_VERSION } from "./constants";

/**
 * EXTRACTION-RELIABILITY-1 Fase B (docs/adr/0029).
 *
 * These pin the *decision* — what is worth an operator's attention — not the
 * email plumbing. The judgement is the part that can silently rot: too
 * sensitive and the alert becomes noise the operator learns to ignore, too
 * blunt and it misses the incident it exists for.
 */

function row(overrides: Partial<Parameters<typeof analyzeRunHealth>[0][number]> = {}) {
  return {
    provider: "gemini",
    status: "completed",
    raw_response_text: "Acme is great.",
    extraction_version: EXTRACTION_VERSION,
    extraction_error: null,
    ...overrides
  };
}

describe("analyzeRunHealth", () => {
  it("stays silent on a fully healthy run", () => {
    expect(analyzeRunHealth([row(), row({ provider: "claude" }), row({ provider: "openai" })])).toEqual([]);
  });

  // The incident this phase exists for: OpenAI returned 429 on every call from
  // 2026-08-01 and nobody found out for four days.
  it("reports quota per engine, with no threshold", () => {
    const findings = analyzeRunHealth([
      row(),
      row({ provider: "openai", extraction_version: "phase4-basic-v1", extraction_error: "quota: OpenAI API quota or rate limit reached." })
    ]);

    expect(findings).toContainEqual(expect.objectContaining({ engine: "openai", reason: "quota", affectedRows: 1 }));
  });

  it("reports a config error, which never heals on its own", () => {
    const findings = analyzeRunHealth([
      row({ provider: "claude", extraction_version: "phase4-basic-v1", extraction_error: "config: Missing ANTHROPIC_API_KEY" })
    ]);

    expect(findings.map((f) => f.reason)).toContain("config");
  });

  // A prompt job succeeds if ANY engine answers, so an engine that produced
  // nothing usable still leaves the run marked "Completado".
  it("reports an engine that answered but extracted nothing", () => {
    const findings = analyzeRunHealth([
      row(),
      row({ provider: "openai", extraction_version: "phase4-basic-v1", extraction_error: "schema: OpenAI extraction JSON failed schema validation." }),
      row({ provider: "openai", extraction_version: "phase4-basic-v1", extraction_error: "schema: OpenAI extraction JSON failed schema validation." })
    ]);

    expect(findings).toContainEqual(
      expect.objectContaining({ engine: "openai", reason: "engine_down", affectedRows: 2, totalRows: 2 })
    );
  });

  // The founder's call at Task Intake: alert on what is actionable, stay quiet
  // about what is not. Model noise self-corrects on the next scan and there is
  // nothing for the operator to go fix.
  it("stays silent about isolated model noise on an otherwise working engine", () => {
    const findings = analyzeRunHealth([
      row({ provider: "gemini" }),
      row({ provider: "gemini", extraction_version: "phase4-basic-v1", extraction_error: "invalid_json: Gemini extraction returned invalid JSON." })
    ]);

    expect(findings).toEqual([]);
  });

  it("does not call an engine down while any of its rows extracted cleanly", () => {
    const findings = analyzeRunHealth([
      row({ provider: "claude" }),
      row({ provider: "claude", extraction_version: "phase4-basic-v1", extraction_error: "timeout: Claude extraction request timed out." })
    ]);

    expect(findings.map((f) => f.reason)).not.toContain("engine_down");
  });

  // Rows the engine never answered are not an extraction problem, and an
  // engine that was never asked anything is not "down".
  it("ignores engines with no answered rows at all", () => {
    expect(analyzeRunHealth([row({ provider: "openai", status: "failed", raw_response_text: null })])).toEqual([]);
  });

  it("treats a null provider as gemini, matching pre-migration-0009 rows", () => {
    const findings = analyzeRunHealth([
      row({ provider: null, extraction_version: "phase4-basic-v1", extraction_error: "quota: Gemini API quota or rate limit reached." })
    ]);

    expect(findings[0]).toMatchObject({ engine: "gemini", reason: "quota" });
  });

  it("reports both quota and engine_down when a quota outage takes the whole engine", () => {
    const findings = analyzeRunHealth([
      row(),
      row({ provider: "openai", extraction_version: "phase4-basic-v1", extraction_error: "quota: OpenAI API quota or rate limit reached." })
    ]);

    const openaiReasons = findings.filter((f) => f.engine === "openai").map((f) => f.reason);
    expect(openaiReasons).toEqual(expect.arrayContaining(["quota", "engine_down"]));
  });
});
