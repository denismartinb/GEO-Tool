import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  firstCandidateText,
  geminiGenerationTuning,
  generateGroundedGeminiJson,
  parseLenientJson
} from "@/lib/llm/gemini-client";

// ADR 0042 — which knobs each Gemini family receives. A wrong pairing here is
// not cosmetic: thinkingBudget + thinkingLevel together is a 400 on every
// call, "minimal" on a model that lacks it is a 400, and a Gemini 3 call at
// temperature 0 risks the looping Google warns about.
describe("geminiGenerationTuning", () => {
  it.each(["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash-001"])(
    "%s keeps ADR 0009: temperature 0 and thinking off",
    (model) => {
      expect(geminiGenerationTuning(model)).toEqual({ temperature: 0, thinkingConfig: { thinkingBudget: 0 } });
    }
  );

  it.each(["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite"])(
    "%s uses the default temperature and minimal thinking",
    (model) => {
      expect(geminiGenerationTuning(model)).toEqual({ thinkingConfig: { thinkingLevel: "minimal" } });
    }
  );

  it.each(["gemini-3.7-flash", "gemini-3.8-flash", "gemini-3.1-pro-preview", "gemini-4-flash"])(
    "%s falls back to low, the lowest level every Gemini 3 model accepts",
    (model) => {
      expect(geminiGenerationTuning(model)).toEqual({ thinkingConfig: { thinkingLevel: "low" } });
    }
  );

  it("never sends thinkingBudget and thinkingLevel together", () => {
    for (const model of ["gemini-2.5-flash", "gemini-3.6-flash", "gemini-3.8-flash"]) {
      const keys = Object.keys(geminiGenerationTuning(model).thinkingConfig);
      expect(keys).toHaveLength(1);
    }
  });
});

describe("parseLenientJson", () => {
  it("parses bare and fenced JSON", () => {
    expect(parseLenientJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseLenientJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("recovers JSON wrapped in prose (Gemini 3 at default temperature)", () => {
    const text = 'Here are the competitors I found:\n{"competitors":[{"name":"Dia","domain":"dia.es"}]}\nLet me know if you need more.';
    expect(parseLenientJson(text)).toEqual({ competitors: [{ name: "Dia", domain: "dia.es" }] });
  });

  it("still throws when there is no JSON object at all", () => {
    expect(() => parseLenientJson("I could not find any competitors.")).toThrow();
  });
});

describe("firstCandidateText", () => {
  it("joins split parts without a separator so a JSON string is not broken", () => {
    const text = firstCandidateText({
      candidates: [{ content: { parts: [{ text: '{"competitors":[{"name":"Al' }, { text: 'campo","domain":"alcampo.es"}]}' }] } }]
    });
    expect(JSON.parse(text)).toEqual({ competitors: [{ name: "Alcampo", domain: "alcampo.es" }] });
  });

  it("skips thought parts", () => {
    const text = firstCandidateText({
      candidates: [{ content: { parts: [{ text: "Let me search.", thought: true }, { text: '{"a":1}' }] } }]
    });
    expect(text).toBe('{"a":1}');
  });
});

// Gemini 3.5/3.6 + google_search drops the start of the answer text, so the
// opening "{" of a grounded JSON reply never arrives (ADR 0042, log §240).
describe("generateGroundedGeminiJson", () => {
  const reply = (text: string) =>
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("on Gemini 3 searches in prose, then structures the findings without search", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "gemini-3.6-flash");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply("ommerce rival one — rival1.es\nRival Two — rival2.es"))
      .mockResolvedValueOnce(reply('{"competitors":[{"name":"Rival Two","domain":"rival2.es"}]}'));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateGroundedGeminiJson("Find competitors of x.es")).resolves.toEqual({
      competitors: [{ name: "Rival Two", domain: "rival2.es" }]
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const research = JSON.parse(fetchMock.mock.calls[0][1].body);
    const structure = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(research.tools).toEqual([{ google_search: {} }]);
    expect(research.generationConfig.responseMimeType).toBeUndefined();
    expect(structure.tools).toBeUndefined();
    expect(structure.generationConfig.responseMimeType).toBe("application/json");
    expect(structure.contents[0].parts[0].text).toContain("Find competitors of x.es");
    expect(structure.contents[0].parts[0].text).toContain("Rival Two — rival2.es");
  });

  it("on Gemini 2.x keeps the single grounded call", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "gemini-2.5-flash");
    const fetchMock = vi.fn().mockResolvedValueOnce(reply('{"competitors":[]}'));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateGroundedGeminiJson("Find competitors of x.es")).resolves.toEqual({ competitors: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).tools).toEqual([{ google_search: {} }]);
  });
});
