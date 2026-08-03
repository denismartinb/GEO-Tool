import { afterEach, describe, expect, it, vi } from "vitest";
import { reconcileExtractedCompetitors, runStructuredExtractionForRun, verifyExtractedMentions } from "./extraction";
import { EXTRACTION_VERSION } from "./constants";
import type { ExtractionOutput } from "@/lib/extraction/schema";

vi.mock("@/lib/llm/gemini", () => ({
  extractGeminiStructuredData: vi.fn()
}));

vi.mock("@/lib/llm/claude", () => ({
  extractClaudeStructuredData: vi.fn()
}));

vi.mock("@/lib/llm/openai", () => ({
  extractOpenAIStructuredData: vi.fn()
}));

vi.mock("@/lib/scan/citation-resolution", () => ({
  resolveGroundingRedirects: vi.fn().mockResolvedValue(new Map())
}));

import { extractGeminiStructuredData } from "@/lib/llm/gemini";
import { extractOpenAIStructuredData } from "@/lib/llm/openai";
import { resolveGroundingRedirects } from "@/lib/scan/citation-resolution";

/**
 * Minimal chainable query-builder mock. Every method returns `this` so any
 * call chain works; the chain itself is thenable and resolves to the
 * provided result. `update` is recorded so assertions can inspect the
 * payload that was persisted.
 */
function createServiceMock(options: {
  selectResult: { data: unknown[] | null; error: unknown };
  updateCalls: Array<Record<string, unknown>>;
  /** EMERGING-BRANDS-GROUNDING-1: result for the `projects` table lookup runStructuredExtractionForRun does to read the cached business profile. Defaults to "no profile cached", matching every pre-existing test's expectations. */
  projectResult?: { data: Record<string, unknown> | null; error?: unknown };
}) {
  const methods = ["select", "eq", "not", "update", "in", "maybeSingle"];

  function makeBuilder(result: unknown) {
    const builder: Record<string, unknown> = {};
    for (const method of methods) {
      builder[method] = vi.fn((...args: unknown[]) => {
        if (method === "update") {
          options.updateCalls.push(args[0] as Record<string, unknown>);
        }
        return builder;
      });
    }
    builder.then = (resolve: (value: unknown) => unknown) => resolve(result);
    return builder;
  }

  const scanResultsBuilder = makeBuilder(options.selectResult);
  const projectsBuilder = makeBuilder(options.projectResult ?? { data: null, error: null });

  return {
    from: vi.fn((table: string) => (table === "projects" ? projectsBuilder : scanResultsBuilder))
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
    brand: { mentioned: true, display_name_found: "Acme", evidence: ["Acme is a great brand"], position: 1 },
    competitors: [{ name: "Globex", mentioned: false, display_name_found: null, evidence: [], position: null }],
    citations: [],
    sentiment: "positive" as const,
    sentiment_drivers: [],
    other_brands_mentioned: [],
    summary: "Acme looks great.",
    confidence: "high" as const,
    notes: [],
    ...overrides
  };
}

describe("runStructuredExtractionForRun", () => {
  afterEach(() => {
    vi.mocked(extractGeminiStructuredData).mockReset();
    vi.mocked(extractOpenAIStructuredData).mockReset();
    vi.mocked(resolveGroundingRedirects).mockReset();
    // Restore the default no-op resolution (empty map) for tests that don't
    // exercise grounding-chunk resolution explicitly.
    vi.mocked(resolveGroundingRedirects).mockResolvedValue(new Map());
  });

  it("uses the OpenAI extractor and treats its grounding URLs as final (no redirect resolution)", async () => {
    const updateCalls: Array<Record<string, unknown>> = [];
    const service = createServiceMock({
      selectResult: {
        data: [
          baseRow({
            provider: "openai",
            raw_response_json: {
              grounding_chunks: [
                { uri: "https://www.acme.com/products", title: "Acme Products" },
                { uri: "not a url" }
              ]
            }
          })
        ],
        error: null
      },
      updateCalls
    });

    vi.mocked(extractOpenAIStructuredData).mockResolvedValue({
      data: baseExtractionOutput(),
      model: "gpt-test-model"
    });

    await runStructuredExtractionForRun({
      service: service as unknown as Parameters<typeof runStructuredExtractionForRun>[0]["service"],
      projectId: "project-1",
      runId: "run-1"
    });

    // The OpenAI extractor is used, the Gemini one is not, and — critically —
    // OpenAI's already-final url_citation URLs never go through the live
    // redirect resolver.
    expect(extractOpenAIStructuredData).toHaveBeenCalledTimes(1);
    expect(extractGeminiStructuredData).not.toHaveBeenCalled();
    expect(resolveGroundingRedirects).not.toHaveBeenCalled();

    expect(updateCalls).toHaveLength(1);
    const update = updateCalls[0];
    const extractedJson = update.extracted_json as {
      citations: Array<{ source: string; domain: string | null; confidence: string; url: string | null }>;
    };
    const groundingCitations = extractedJson.citations.filter((c) => c.source === "grounding");

    // Domain is derived straight from the citation URL; a well-formed URL is
    // high-confidence, a malformed one degrades to low with a null domain.
    expect(groundingCitations).toHaveLength(2);
    expect(groundingCitations[0]).toMatchObject({ domain: "acme.com", confidence: "high" });
    expect(groundingCitations[1]).toMatchObject({ domain: null, confidence: "low" });
    expect(update.citations_count).toBe(2);
    expect(update.citation_found).toBe(true);
  });

  it("EMERGING-BRANDS-GROUNDING-1: threads the project's cached business profile into the extractor call", async () => {
    const updateCalls: Array<Record<string, unknown>> = [];
    const cachedProfile = {
      whatItSells: "a web browser",
      sector: "software",
      subSector: "web browsers",
      businessModel: "b2c" as const,
      targetCustomer: "general internet users",
      geographicScope: "global",
      sizeEstimate: "large",
      confidence: "high" as const
    };
    const service = createServiceMock({
      selectResult: { data: [baseRow()], error: null },
      updateCalls,
      projectResult: { data: { business_profile: cachedProfile }, error: null }
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

    expect(extractGeminiStructuredData).toHaveBeenCalledWith(expect.objectContaining({ profile: cachedProfile }));
  });

  it("passes profile: undefined (never a fabricated profile) when the project has no cached business profile yet", async () => {
    const updateCalls: Array<Record<string, unknown>> = [];
    const service = createServiceMock({
      selectResult: { data: [baseRow()], error: null },
      updateCalls
      // projectResult omitted — defaults to "no profile cached".
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

    expect(extractGeminiStructuredData).toHaveBeenCalledWith(expect.objectContaining({ profile: undefined }));
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

    vi.mocked(resolveGroundingRedirects).mockResolvedValue(
      new Map([
        ["https://www.acme.com/products", { resolvedUrl: "https://www.acme.com/products" }],
        ["https://reviews.example.org/acme", { resolvedUrl: "https://reviews.example.org/acme" }]
      ])
    );

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

  it("falls back to domain: null and confidence: 'low' when grounding redirect resolution fails or times out", async () => {
    const updateCalls: Array<Record<string, unknown>> = [];
    const service = createServiceMock({
      selectResult: {
        data: [
          baseRow({
            raw_response_json: {
              grounding_chunks: [
                {
                  uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc123",
                  title: "Movistar - Fibra y Móvil"
                }
              ]
            }
          })
        ],
        error: null
      },
      updateCalls
    });

    vi.mocked(extractGeminiStructuredData).mockResolvedValue({
      data: baseExtractionOutput(),
      model: "gemini-2.0-flash-001"
    });

    // Resolution failed/timed out: resolveGroundingRedirects reports no
    // resolved URL for this URI.
    vi.mocked(resolveGroundingRedirects).mockResolvedValue(
      new Map([
        ["https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc123", { resolvedUrl: null }]
      ])
    );

    await runStructuredExtractionForRun({
      service: service as unknown as Parameters<typeof runStructuredExtractionForRun>[0]["service"],
      projectId: "project-1",
      runId: "run-1"
    });

    expect(updateCalls).toHaveLength(1);
    const update = updateCalls[0];

    // The citation still counts toward citations_count / citation_found —
    // it's a real grounding source, we just couldn't resolve its display
    // domain.
    expect(update.citations_count).toBe(1);
    expect(update.citation_found).toBe(true);

    const extractedJson = update.extracted_json as {
      citations: Array<{ url: string | null; domain: string | null; title: string | null; source: string; confidence: string }>;
    };
    const [citation] = extractedJson.citations;

    expect(citation.source).toBe("grounding");
    expect(citation.domain).toBeNull();
    expect(citation.confidence).toBe("low");
    expect(citation.title).toBe("Movistar - Fibra y Móvil");
    // Original URL retained for traceability, but never surfaced as the
    // display domain.
    expect(citation.url).toBe("https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc123");
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

  it("moves an untracked competitor into other_brands_mentioned instead of persisting it as a competitor", async () => {
    const updateCalls: Array<Record<string, unknown>> = [];
    const service = createServiceMock({
      selectResult: {
        data: [
          baseRow({
            competitors_snapshot: [{ name: "Globex" }],
            // Both names must be genuinely present in the raw text for
            // MENTION-VERIFY-1's verifyExtractedMentions to keep them
            // mentioned: true — this test is about tracked-set
            // reconciliation, not mention verification, so the raw text is
            // extended (rather than relying on the default) to keep that
            // concern out of the way.
            raw_response_text: "Acme is a great brand, better than Globex or Initech."
          })
        ],
        error: null
      },
      updateCalls
    });

    vi.mocked(extractGeminiStructuredData).mockResolvedValue({
      data: baseExtractionOutput({
        competitors: [
          { name: "Globex", mentioned: true, display_name_found: "Globex", evidence: ["better than Globex"], position: 2 },
          // The model surfaced a brand that was never tracked — real
          // production case (SCAN-TRACKED-SET-1): this must not survive
          // into the persisted competitors array.
          { name: "Initech", mentioned: true, display_name_found: "Initech", evidence: ["or Initech"], position: 1 }
        ]
      }),
      model: "gemini-2.0-flash-001"
    });

    await runStructuredExtractionForRun({
      service: service as unknown as Parameters<typeof runStructuredExtractionForRun>[0]["service"],
      projectId: "project-1",
      runId: "run-1"
    });

    const extractedJson = update0(updateCalls);
    expect(extractedJson.competitors.map((c) => c.name)).toEqual(["Globex"]);
    expect(extractedJson.other_brands_mentioned).toContain("Initech");
    // Only tracked-and-mentioned competitors count toward the persisted
    // scalar that feeds standing/competitor_gap_score.
    expect(updateCalls[0].mentioned_competitors_count).toBe(1);
  });

  it("materializes a tracked competitor the model omitted as explicitly not-mentioned", async () => {
    const updateCalls: Array<Record<string, unknown>> = [];
    const service = createServiceMock({
      selectResult: {
        data: [baseRow({ competitors_snapshot: [{ name: "Globex" }, { name: "Umbrella" }] })],
        error: null
      },
      updateCalls
    });

    vi.mocked(extractGeminiStructuredData).mockResolvedValue({
      // The model only reported on "Globex" — "Umbrella" (tracked) is
      // absent from its output entirely, not explicitly not-mentioned.
      data: baseExtractionOutput({
        competitors: [{ name: "Globex", mentioned: false, display_name_found: null, evidence: [], position: null }]
      }),
      model: "gemini-2.0-flash-001"
    });

    await runStructuredExtractionForRun({
      service: service as unknown as Parameters<typeof runStructuredExtractionForRun>[0]["service"],
      projectId: "project-1",
      runId: "run-1"
    });

    const extractedJson = update0(updateCalls);
    expect(extractedJson.competitors).toEqual([
      { name: "Globex", mentioned: false, display_name_found: null, evidence: [], position: null },
      { name: "Umbrella", mentioned: false, display_name_found: null, evidence: [], position: null }
    ]);
  });

  it("MENTION-VERIFY-1: persists brand_mentioned false for a hallucinated mention whose claimed evidence never appears in the raw response text", async () => {
    // Reproduces the reported production case: the extraction model claimed
    // the brand was mentioned in a response that was only topically related
    // (never contained the brand's name), with a fabricated "evidence" quote
    // to match. verifyExtractedMentions must catch this before persistence.
    const updateCalls: Array<Record<string, unknown>> = [];
    const service = createServiceMock({
      selectResult: {
        data: [
          baseRow({
            brand_snapshot: "GenScore",
            raw_response_text:
              "Un análisis de rendimiento de marca basado en inteligencia artificial es valioso para empresas de diversos sectores."
          })
        ],
        error: null
      },
      updateCalls
    });

    vi.mocked(extractGeminiStructuredData).mockResolvedValue({
      data: baseExtractionOutput({
        brand: {
          mentioned: true,
          display_name_found: "GenScore",
          evidence: ["Un análisis de rendimiento de marca basado en inteligencia artificial es valioso"],
          position: 1
        }
      }),
      model: "gemini-2.5-flash"
    });

    await runStructuredExtractionForRun({
      service: service as unknown as Parameters<typeof runStructuredExtractionForRun>[0]["service"],
      projectId: "project-1",
      runId: "run-1"
    });

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].brand_mentioned).toBe(false);
    const extractedJson = updateCalls[0].extracted_json as {
      brand: { mentioned: boolean; display_name_found: string | null; evidence: string[]; position: number | null };
    };
    expect(extractedJson.brand).toEqual({ mentioned: false, display_name_found: null, evidence: [], position: null });
  });

  it("MENTION-VERIFY-1 follow-up: persists brand_mentioned false when display_name_found is a generic phrase genuinely in the text but not a plausible brand name — the exact production case (2026-07-30)", async () => {
    // The response only generically described "your brand's presence in
    // conversational search" (echoing the user's own question) without ever
    // naming "GenScore". The model set display_name_found: "tu marca" —
    // which DOES appear in the raw text, so verifying substring-presence
    // alone (the first MENTION-VERIFY-1 pass) was not enough; this is what
    // the namesPlausiblyMatch check closes.
    const updateCalls: Array<Record<string, unknown>> = [];
    const service = createServiceMock({
      selectResult: {
        data: [
          baseRow({
            brand_snapshot: "GenScore",
            raw_response_text:
              "Existen servicios que analizan la presencia de tu marca en la búsqueda conversacional, con distintos costes."
          })
        ],
        error: null
      },
      updateCalls
    });

    vi.mocked(extractGeminiStructuredData).mockResolvedValue({
      data: baseExtractionOutput({
        brand: {
          mentioned: true,
          display_name_found: "tu marca",
          evidence: ["analizan la presencia de tu marca en la búsqueda conversacional"],
          position: 1
        }
      }),
      model: "gemini-2.5-flash"
    });

    await runStructuredExtractionForRun({
      service: service as unknown as Parameters<typeof runStructuredExtractionForRun>[0]["service"],
      projectId: "project-1",
      runId: "run-1"
    });

    expect(updateCalls[0].brand_mentioned).toBe(false);
  });

  it("MENTION-VERIFY-1: keeps brand_mentioned true when the claimed display_name_found genuinely names the brand and appears in the raw response text", async () => {
    const updateCalls: Array<Record<string, unknown>> = [];
    const service = createServiceMock({
      selectResult: {
        data: [
          baseRow({
            brand_snapshot: "GenScore",
            raw_response_text: "GenScore is a solid GEO visibility tool for small businesses."
          })
        ],
        error: null
      },
      updateCalls
    });

    vi.mocked(extractGeminiStructuredData).mockResolvedValue({
      data: baseExtractionOutput({
        brand: {
          mentioned: true,
          display_name_found: "GenScore",
          evidence: ["GenScore is a solid GEO visibility tool"],
          position: 1
        }
      }),
      model: "gemini-2.5-flash"
    });

    await runStructuredExtractionForRun({
      service: service as unknown as Parameters<typeof runStructuredExtractionForRun>[0]["service"],
      projectId: "project-1",
      runId: "run-1"
    });

    expect(updateCalls[0].brand_mentioned).toBe(true);
  });
});

describe("verifyExtractedMentions (MENTION-VERIFY-1, docs/adr/0021)", () => {
  function baseData(overrides: Partial<ExtractionOutput> = {}): ExtractionOutput {
    return {
      brand: { mentioned: false, display_name_found: null, evidence: [], position: null },
      competitors: [],
      citations: [],
      sentiment: "neutral",
      sentiment_drivers: [],
      other_brands_mentioned: [],
      summary: "",
      confidence: "high",
      notes: [],
      ...overrides
    };
  }

  it("downgrades a brand mention whose display_name_found is not present in the raw text", () => {
    const data = baseData({
      brand: {
        mentioned: true,
        display_name_found: "GenScore",
        evidence: ["a fabricated quote"],
        position: 1
      }
    });

    const result = verifyExtractedMentions(data, "This response never names the brand at all.", "GenScore");

    expect(result.brand).toEqual({ mentioned: false, display_name_found: null, evidence: [], position: null });
  });

  it("downgrades a mention with a null display_name_found (inconsistent model output)", () => {
    const data = baseData({
      brand: { mentioned: true, display_name_found: null, evidence: ["some evidence"], position: 1 }
    });

    const result = verifyExtractedMentions(data, "GenScore is mentioned right here.", "GenScore");

    expect(result.brand).toEqual({ mentioned: false, display_name_found: null, evidence: [], position: null });
  });

  it("downgrades a mention whose display_name_found genuinely appears in the text but does not plausibly name the real brand — the exact production case (2026-07-30)", () => {
    // The response never named "GenScore" at all — it just generically
    // described "your brand's presence in conversational search" (echoing
    // the user's own question). The extraction model set
    // display_name_found: "tu marca", which DOES appear in the raw text
    // (so the substring-only check alone would wrongly keep this mentioned),
    // but "tu marca" is not a plausible name for "GenScore".
    const data = baseData({
      brand: {
        mentioned: true,
        display_name_found: "tu marca",
        evidence: ["analizan la presencia de tu marca en la búsqueda conversacional"],
        position: 1
      }
    });

    const result = verifyExtractedMentions(
      data,
      "Existen servicios que analizan la presencia de tu marca en la búsqueda conversacional, con distintos costes.",
      "GenScore"
    );

    expect(result.brand).toEqual({ mentioned: false, display_name_found: null, evidence: [], position: null });
  });

  it("keeps a verified mention (and its genuinely-present evidence) untouched, case/diacritic/whitespace-insensitively", () => {
    const data = baseData({
      brand: {
        mentioned: true,
        display_name_found: "GénScore",
        evidence: ["genscore is a great tool"],
        position: 1
      }
    });

    const result = verifyExtractedMentions(data, "  genscore   is a great tool.", "GenScore");

    expect(result.brand).toEqual({
      mentioned: true,
      display_name_found: "GénScore",
      evidence: ["genscore is a great tool"],
      position: 1
    });
  });

  it("never touches an already not-mentioned entity", () => {
    const data = baseData({
      brand: { mentioned: false, display_name_found: null, evidence: [], position: null }
    });

    const result = verifyExtractedMentions(data, "irrelevant text", "GenScore");

    expect(result.brand).toEqual({ mentioned: false, display_name_found: null, evidence: [], position: null });
  });

  it("applies the same verification to every competitor independently, against each competitor's own returned name", () => {
    const data = baseData({
      competitors: [
        {
          name: "RealCompetitor",
          mentioned: true,
          display_name_found: "RealCompetitor",
          evidence: ["RealCompetitor is a solid choice"],
          position: 1
        },
        { name: "FabricatedCompetitor", mentioned: true, display_name_found: "FabricatedCompetitor", evidence: ["seen"], position: 2 }
      ]
    });

    const result = verifyExtractedMentions(data, "RealCompetitor is a solid choice.", "GenScore");

    expect(result.competitors).toEqual([
      {
        name: "RealCompetitor",
        mentioned: true,
        display_name_found: "RealCompetitor",
        evidence: ["RealCompetitor is a solid choice"],
        position: 1
      },
      { name: "FabricatedCompetitor", mentioned: false, display_name_found: null, evidence: [], position: null }
    ]);
  });

  it("MENTION-VERIFY-1 follow-up 2 (docs/adr/0021 addendum): keeps mentioned:true but drops an individual evidence quote that doesn't itself appear in the raw text — the exact production case (2026-07-30, Alberdiderma)", () => {
    // The brand's own name genuinely appears in the response (a real
    // markdown link), so display_name_found verification correctly keeps
    // mentioned: true — but the model's "evidence" quote for this entity was
    // a fabricated/mismatched sentence that never appears anywhere in the
    // raw text (it actually described a different clinic in the same list).
    const data = baseData({
      brand: {
        mentioned: true,
        display_name_found: "Alberdiderma",
        evidence: ["Centro dermatológico de referencia con más de 20 años de experiencia"],
        position: 2
      }
    });

    const rawText =
      "[Clínica Dermatológica Madrid De Felipe](https://maps.example/1)\n" +
      "Con más de 30 años de experiencia, ofrecen tratamientos integrales para el acné.\n\n" +
      "[Alberdiderma](https://maps.example/2)\n" +
      "Especialistas en dermatología médica y estética, brindan atención personalizada para el acné con protocolos médicos actualizados.";

    const result = verifyExtractedMentions(data, rawText, "Alberdiderma");

    expect(result.brand.mentioned).toBe(true);
    expect(result.brand.evidence).toEqual([]);
  });

  it("keeps only the evidence entries that are genuinely present, when a mentioned entity has a mix of real and fabricated quotes", () => {
    const data = baseData({
      brand: {
        mentioned: true,
        display_name_found: "Alberdiderma",
        evidence: ["Alberdiderma es una buena opción", "una frase completamente inventada que no aparece"],
        position: 1
      }
    });

    const result = verifyExtractedMentions(data, "Alberdiderma es una buena opción para tratar el acné.", "Alberdiderma");

    expect(result.brand.mentioned).toBe(true);
    expect(result.brand.evidence).toEqual(["Alberdiderma es una buena opción"]);
  });
});

/** Narrow the update payload's extracted_json to the shape these tests assert against. */
function update0(updateCalls: Array<Record<string, unknown>>) {
  return updateCalls[0].extracted_json as {
    competitors: Array<{ name: string; mentioned: boolean; display_name_found: string | null; evidence: string[]; position: number | null }>;
    other_brands_mentioned: string[];
  };
}

describe("reconcileExtractedCompetitors", () => {
  function baseData(overrides: Partial<ExtractionOutput> = {}): ExtractionOutput {
    return {
      brand: { mentioned: true, display_name_found: "Acme", evidence: [], position: 1 },
      competitors: [],
      citations: [],
      sentiment: "neutral",
      sentiment_drivers: [],
      other_brands_mentioned: [],
      summary: "",
      confidence: "high",
      notes: [],
      ...overrides
    };
  }

  it("keeps a tracked competitor's mentioned/evidence/position untouched when the model returns it", () => {
    const data = baseData({
      competitors: [{ name: "Globex", mentioned: true, display_name_found: "Globex", evidence: ["seen"], position: 2 }]
    });

    const result = reconcileExtractedCompetitors(data, ["Globex"]);

    expect(result.competitors).toEqual([
      { name: "Globex", mentioned: true, display_name_found: "Globex", evidence: ["seen"], position: 2 }
    ]);
  });

  it("matches a tracked competitor tolerant of accents/case/punctuation, keeping the tracked canonical name", () => {
    const data = baseData({
      competitors: [{ name: "Lazy Bag®", mentioned: true, display_name_found: "Lazy Bag®", evidence: [], position: 1 }]
    });

    const result = reconcileExtractedCompetitors(data, ["Lazy Bag"]);

    // baseData()'s brand is also mentioned at (tied) original position 1,
    // so after re-densification the brand keeps rank 1 and Lazy Bag is 2.
    // display_name_found is whatever the model claimed to have found
    // ("Lazy Bag®") — only `name` is overridden to the tracked canonical
    // spelling by reconciliation.
    expect(result.competitors).toEqual([
      { name: "Lazy Bag", mentioned: true, display_name_found: "Lazy Bag®", evidence: [], position: 2 }
    ]);
  });

  it("moves an entity outside the tracked list into other_brands_mentioned, deduped against existing entries", () => {
    const data = baseData({
      competitors: [{ name: "Initech", mentioned: true, display_name_found: "Initech", evidence: [], position: 1 }],
      other_brands_mentioned: ["Initech", "Hooli"]
    });

    const result = reconcileExtractedCompetitors(data, []);

    expect(result.competitors).toEqual([]);
    expect(result.other_brands_mentioned.sort()).toEqual(["Hooli", "Initech"]);
  });

  it("re-densifies positions (1..k, no gaps) after dropping untracked entities, preserving relative order", () => {
    const data = baseData({
      brand: { mentioned: true, display_name_found: "Acme", evidence: [], position: 2 },
      competitors: [
        { name: "Globex", mentioned: true, display_name_found: "Globex", evidence: [], position: 5 },
        { name: "Initech", mentioned: true, display_name_found: "Initech", evidence: [], position: 1 } // untracked, ranked first
      ]
    });

    // Tracked: Globex + Umbrella (Umbrella never mentioned by the model).
    const result = reconcileExtractedCompetitors(data, ["Globex", "Umbrella"]);

    // Initech (untracked, was rank 1) is dropped, so Acme moves from 2 -> 1
    // and Globex from 5 -> 2. Umbrella stays unmentioned (null).
    expect(result.brand.position).toBe(1);
    expect(result.competitors).toEqual([
      { name: "Globex", mentioned: true, display_name_found: "Globex", evidence: [], position: 2 },
      { name: "Umbrella", mentioned: false, display_name_found: null, evidence: [], position: null }
    ]);
  });

  it("returns an empty competitors array (all spillover) when the project tracks no competitors", () => {
    const data = baseData({
      competitors: [{ name: "Whoever", mentioned: true, display_name_found: "Whoever", evidence: [], position: 1 }]
    });

    const result = reconcileExtractedCompetitors(data, []);

    expect(result.competitors).toEqual([]);
    expect(result.other_brands_mentioned).toContain("Whoever");
  });
});
