import { afterEach, describe, expect, it, vi } from "vitest";
import { runStructuredExtractionForRun } from "./extraction";
import { EXTRACTION_VERSION } from "./constants";

vi.mock("@/lib/llm/gemini", () => ({
  extractGeminiStructuredData: vi.fn()
}));

import { extractGeminiStructuredData } from "@/lib/llm/gemini";

/**
 * Minimal chainable query-builder mock. Every method returns `this` so any
 * call chain works; the chain itself is thenable and resolves to the
 * provided result. `update` is recorded so assertions can inspect the
 * payload that was persisted.
 */
function createServiceMock(options: {
  selectResult: { data: unknown[] | null; error: unknown };
  updateCalls: Array<Record<string, unknown>>;
}) {
  const builder: Record<string, unknown> = {};
  const methods = ["select", "eq", "not", "update"];

  for (const method of methods) {
    builder[method] = vi.fn((...args: unknown[]) => {
      if (method === "update") {
        options.updateCalls.push(args[0] as Record<string, unknown>);
      }
      return builder;
    });
  }

  builder.then = (resolve: (value: unknown) => unknown) => resolve(options.selectResult);

  return {
    from: vi.fn(() => builder)
  };
}

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "row-1",
    raw_response_text: "Acme is a great brand. See https://inline-example.com/page for details.",
    raw_response_json: { grounding_chunks: [] },
    prompt_text_snapshot: "best widgets in spain",
    brand_snapshot: "Acme",
    competitors_snapshot: [{ name: "Globex" }],
    provider: "gemini",
    status: "completed",
    extraction_version: "phase4-basic-v1",
    ...overrides
  };
}

function baseExtractionOutput(overrides: Record<string, unknown> = {}) {
  return {
    brand: { mentioned: true, display_name_found: "Acme", evidence: ["Acme is great"] },
    competitors: [{ name: "Globex", mentioned: false, evidence: [] }],
    citations: [],
    sentiment: "positive" as const,
    summary: "Acme looks great.",
    confidence: "high" as const,
    notes: [],
    ...overrides
  };
}

describe("runStructuredExtractionForRun", () => {
  afterEach(() => {
    vi.mocked(extractGeminiStructuredData).mockReset();
  });

  it("derives citations_count/citation_found from grounding chunks only, ignoring inline matches", async () => {
    const updateCalls: Array<Record<string, unknown>> = [];
    const service = createServiceMock({
      selectResult: {
        data: [
          baseRow({
            raw_response_json: {
              grounding_chunks: [
                { uri: "https://www.acme.com/products", title: "Acme Products" },
                { uri: "https://reviews.example.org/acme" }
              ]
            }
          })
        ],
        error: null
      },
      updateCalls
    });

    vi.mocked(extractGeminiStructuredData).mockResolvedValue({
      data: baseExtractionOutput({
        citations: [
          { url: "https://inline-example.com/page", domain: "inline-example.com", label: "Inline mention", evidence: null }
        ]
      }),
      model: "gemini-2.0-flash-001"
    });

    await runStructuredExtractionForRun({
      service: service as unknown as Parameters<typeof runStructuredExtractionForRun>[0]["service"],
      projectId: "project-1",
      runId: "run-1"
    });

    expect(updateCalls).toHaveLength(1);
    const update = updateCalls[0];

    expect(update.citations_count).toBe(2);
    expect(update.citation_found).toBe(true);
    expect(update.extraction_version).toBe(EXTRACTION_VERSION);
    expect(update.extraction_error).toBeNull();

    const extractedJson = update.extracted_json as { citations: Array<{ source: string; domain: string | null }> };
    const groundingCitations = extractedJson.citations.filter((c) => c.source === "grounding");
    const inlineCitations = extractedJson.citations.filter((c) => c.source === "inline");

    expect(groundingCitations).toHaveLength(2);
    expect(groundingCitations.map((c) => c.domain)).toEqual(["acme.com", "reviews.example.org"]);
    expect(inlineCitations).toHaveLength(1);
    expect(inlineCitations[0].domain).toBe("inline-example.com");
  });

  it("marks a real zero-grounding result with EXTRACTION_VERSION and citations_count 0, distinguishable from unprocessed rows", async () => {
    const updateCalls: Array<Record<string, unknown>> = [];
    const service = createServiceMock({
      selectResult: {
        data: [baseRow({ raw_response_json: { grounding_chunks: [] } })],
        error: null
      },
      updateCalls
    });

    vi.mocked(extractGeminiStructuredData).mockResolvedValue({
      data: baseExtractionOutput(),
      model: "gemini-2.0-flash-001"
    });

    await runStructuredExtractionForRun({
      service: service as unknown as Parameters<typeof runStructuredExtractionForRun>[0]["service"],
      projectId: "project-1",
      runId: "run-1"
    });

    const update = updateCalls[0];
    expect(update.citations_count).toBe(0);
    expect(update.citation_found).toBe(false);
    // A real zero-grounding result is still tagged with the current
    // extraction version, distinguishing it from an unprocessed row whose
    // extraction_version is the old "phase4-basic-v1".
    expect(update.extraction_version).toBe(EXTRACTION_VERSION);
    expect(update.extraction_version).not.toBe("phase4-basic-v1");
  });

  it("skips rows already processed with the current EXTRACTION_VERSION", async () => {
    const updateCalls: Array<Record<string, unknown>> = [];
    const service = createServiceMock({
      selectResult: {
        data: [baseRow({ extraction_version: EXTRACTION_VERSION })],
        error: null
      },
      updateCalls
    });

    await runStructuredExtractionForRun({
      service: service as unknown as Parameters<typeof runStructuredExtractionForRun>[0]["service"],
      projectId: "project-1",
      runId: "run-1"
    });

    expect(extractGeminiStructuredData).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
  });

  it("records extraction_error and does not set extraction_version when extraction fails", async () => {
    const updateCalls: Array<Record<string, unknown>> = [];
    const service = createServiceMock({
      selectResult: {
        data: [baseRow()],
        error: null
      },
      updateCalls
    });

    vi.mocked(extractGeminiStructuredData).mockRejectedValue(new Error("Gemini extraction JSON failed schema validation."));

    await runStructuredExtractionForRun({
      service: service as unknown as Parameters<typeof runStructuredExtractionForRun>[0]["service"],
      projectId: "project-1",
      runId: "run-1"
    });

    expect(updateCalls).toHaveLength(1);
    const update = updateCalls[0];
    expect(update.extraction_error).toBe("Gemini extraction JSON failed schema validation.");
    expect(update.extraction_version).toBeUndefined();
    expect(update.citations_count).toBeUndefined();
  });
});
