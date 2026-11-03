import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];

vi.mock("@/lib/llm/gemini", () => ({
  generateGeminiVisibilityAnswer: vi.fn(async () => {
    const { GeminiHttpError } = await import("@/lib/llm/gemini-client");
    throw new GeminiHttpError(404);
  }),
  extractGeminiStructuredData: vi.fn(async () => {
    calls.push("gemini");
    const { ExtractionError } = await import("@/lib/llm/extraction-errors");
    throw new ExtractionError("http", "Gemini API request failed with status 503.", 503);
  })
}));
vi.mock("@/lib/llm/claude", () => ({
  generateClaudeVisibilityAnswer: vi.fn(),
  extractClaudeStructuredData: vi.fn(async (args: { model?: string }) => {
    calls.push(`claude:${args.model ?? "default"}`);
    return {
      data: {
        brand: { mentioned: false, position: null },
        competitors: [],
        other_brands_mentioned: [],
        sentiment: null
      }
    };
  })
}));
vi.mock("@/lib/llm/openai", () => ({ generateOpenAIVisibilityAnswer: vi.fn(), extractOpenAIStructuredData: vi.fn() }));
vi.mock("@/lib/llm/perplexity", () => ({
  generatePerplexityVisibilityAnswer: vi.fn(async () => ({ text: "Una respuesta.", model: "perplexity/sonar", groundingChunks: [] }))
}));
vi.mock("@/lib/scan/extraction", () => ({
  verifyExtractedMentions: (data: unknown) => data
}));
vi.mock("@/lib/scan/citation-resolution", () => ({ resolveGroundingRedirects: vi.fn(async () => new Map()) }));

import { runSectorAnswer, studyErrorCode } from "@/lib/studies/run-sector-answer";
import { ExtractionError } from "@/lib/llm/extraction-errors";
import { GeminiHttpError } from "@/lib/llm/gemini-client";
import type { SectorConfig } from "@/lib/studies/sector-study";

const sector = { prompts: ["¿Qué tienda me recomiendas?"], country: "ES", language: "es", seedBrands: [] } as unknown as SectorConfig;

describe("studyErrorCode (STUDY-ERRORS-1, log §464)", () => {
  it("keeps the class, our category and the HTTP status, never the message", () => {
    expect(studyErrorCode(new GeminiHttpError(404))).toBe("GeminiHttpError:404");
    expect(studyErrorCode(new ExtractionError("http", "secret provider text", 503))).toBe("ExtractionError:http:503");
    expect(studyErrorCode(new ExtractionError("timeout", "x"))).toBe("ExtractionError:timeout");
    expect(studyErrorCode(new Error("provider said something"))).toBe("Error");
    expect(studyErrorCode("boom")).toBe("UnknownError");
  });
});

describe("runSectorAnswer extraction route", () => {
  const saved = process.env.SCAN_EXTRACTION_CLAUDE_MODEL;
  beforeEach(() => {
    calls.length = 0;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.SCAN_EXTRACTION_CLAUDE_MODEL;
    else process.env.SCAN_EXTRACTION_CLAUDE_MODEL = saved;
  });

  it("reads Perplexity with the scan's single extractor when it is set, so a Gemini outage does not take it down", async () => {
    process.env.SCAN_EXTRACTION_CLAUDE_MODEL = "claude-cheap";
    const out = await runSectorAnswer({ sector, engine: "perplexity", promptIndex: 0, sample: 1 });
    expect(out.error).toBeNull();
    expect(calls).toEqual(["claude:claude-cheap"]);
  });

  it("without it, Perplexity is still read by Gemini, and the failure carries its status", async () => {
    delete process.env.SCAN_EXTRACTION_CLAUDE_MODEL;
    const out = await runSectorAnswer({ sector, engine: "perplexity", promptIndex: 0, sample: 1 });
    expect(calls).toEqual(["gemini"]);
    expect(out.error).toBe("ExtractionError:http:503");
  });

  it("a Gemini generation failure says which status it was", async () => {
    const out = await runSectorAnswer({ sector, engine: "gemini", promptIndex: 0, sample: 1 });
    expect(out.error).toBe("GeminiHttpError:404");
  });
});
