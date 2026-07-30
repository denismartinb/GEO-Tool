import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateAddedPrompts,
  generateGeminiVisibilityAnswer,
  rewriteRecommendation,
  auditDomainContent,
  extractGeminiStructuredData,
  inferBusinessProfile,
  suggestCompetitors,
  suggestPrompts,
  GeminiConfigError,
  GeminiTimeoutError,
  type BusinessProfile
} from "./gemini";

const ORIGINAL_ENV = { ...process.env };

function mockFetchOnce(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  });
}

function visibilityInput() {
  return {
    prompt: "What is the best CRM?",
    country: "ES",
    language: "es"
  };
}

describe("generateGeminiVisibilityAnswer", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.GEMINI_MODEL;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it("throws GeminiConfigError when GEMINI_API_KEY is missing", async () => {
    delete process.env.GEMINI_API_KEY;

    await expect(
      generateGeminiVisibilityAnswer({
        prompt: "best widgets",
        country: "ES",
        language: "es"
      })
    ).rejects.toBeInstanceOf(GeminiConfigError);
  });

  it("sends the google_search grounding tool and uses the pinned default model", async () => {
    const fetchMock = mockFetchOnce({
      candidates: [{ content: { parts: [{ text: "Acme is great." }] } }],
      modelVersion: "gemini-2.0-flash-001",
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 }
    });
    vi.stubGlobal("fetch", fetchMock);

    await generateGeminiVisibilityAnswer({
      prompt: "best widgets",
      country: "ES",
      language: "es"
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [endpoint, init] = fetchMock.mock.calls[0];
    expect(endpoint).toContain("gemini-2.5-flash");

    const body = JSON.parse(init.body as string);
    expect(body.tools).toEqual([{ google_search: {} }]);
  });

  it("sends a brand-blind, neutral generation prompt (docs/adr/0007)", async () => {
    const fetchMock = mockFetchOnce({
      candidates: [{ content: { parts: [{ text: "Here are some good options." }] } }],
      modelVersion: "gemini-2.0-flash-001",
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 }
    });
    vi.stubGlobal("fetch", fetchMock);

    await generateGeminiVisibilityAnswer({
      prompt: "best widgets",
      country: "ES",
      language: "es"
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);

    const systemInstructionText = body.systemInstruction.parts[0].text as string;
    const contentText = body.contents[0].parts[0].text as string;

    // The neutral instruction legitimately mentions "brand(s)" in a
    // non-favoring sense ("recommend ... brands ..."), so assert it doesn't
    // single out *the* brand being measured rather than asserting the word
    // never appears.
    expect(systemInstructionText).not.toContain("Brand:");
    expect(systemInstructionText).not.toContain("Competitors:");
    expect(systemInstructionText).not.toMatch(/mention the brand/i);
    expect(systemInstructionText).toMatch(/not favour or avoid any particular brand/i);
    expect(systemInstructionText).toContain("helpful AI assistant");

    expect(contentText).toContain("Question: best widgets");
    expect(contentText).not.toContain("Brand:");
    expect(contentText).not.toContain("Competitors:");
    expect(contentText).not.toMatch(/\bAcme\b/);
  });

  it("parses groundingMetadata.groundingChunks into groundingChunks", async () => {
    const fetchMock = mockFetchOnce({
      candidates: [
        {
          content: { parts: [{ text: "Acme is great." }] },
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: "https://example.com/article", title: "Example article" } },
              { web: { uri: "https://other.com/page" } },
              { web: {} }
            ]
          }
        }
      ],
      modelVersion: "gemini-2.0-flash-001",
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 }
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateGeminiVisibilityAnswer({
      prompt: "best widgets",
      country: "ES",
      language: "es"
    });

    expect(result.groundingChunks).toEqual([
      { uri: "https://example.com/article", title: "Example article" },
      { uri: "https://other.com/page", title: undefined }
    ]);
  });

  it("leaves groundingChunks undefined when groundingMetadata is absent", async () => {
    const fetchMock = mockFetchOnce({
      candidates: [{ content: { parts: [{ text: "Acme is great." }] } }],
      modelVersion: "gemini-2.0-flash-001",
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 }
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateGeminiVisibilityAnswer({
      prompt: "best widgets",
      country: "ES",
      language: "es"
    });

    expect(result.groundingChunks).toBeUndefined();
  });

  it("rejects an invalid GEMINI_MODEL with GeminiConfigError", async () => {
    process.env.GEMINI_MODEL = "not-a-valid-model!!";

    await expect(
      generateGeminiVisibilityAnswer({
        prompt: "best widgets",
        country: "ES",
        language: "es"
      })
    ).rejects.toBeInstanceOf(GeminiConfigError);
  });
});

describe("generateGeminiVisibilityAnswer — hard per-call timeout (SCAN-ROBUST-1)", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, GEMINI_API_KEY: "test-key", GEMINI_MODEL: "gemini-2.0-flash" };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("throws GeminiTimeoutError when the request is aborted (does not hang the run)", async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        // Never resolves on its own — only the AbortController's abort()
        // (triggered by the hard per-call timeout) should settle this.
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    // Use vi.useFakeTimers to advance past the hard timeout instantly instead
    // of waiting 20s in real time.
    vi.useFakeTimers();

    const expectation = expect(generateGeminiVisibilityAnswer(visibilityInput())).rejects.toBeInstanceOf(
      GeminiTimeoutError
    );

    // Advance past GEMINI_CALL_TIMEOUT_MS (20s) to trigger the abort.
    await vi.advanceTimersByTimeAsync(20_000);

    await expectation;

    vi.useRealTimers();
  });

  it("does not time out a normal fast response", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "Acme is a great CRM, better than Beta." }] } }],
          modelVersion: "gemini-2.0-flash",
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateGeminiVisibilityAnswer(visibilityInput());

    expect(result.text).toContain("Acme");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("propagates a real network error without converting it to GeminiTimeoutError", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network unreachable");
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateGeminiVisibilityAnswer(visibilityInput())).rejects.toThrow("network unreachable");
  });
});

function mockGeminiJson(payload: unknown) {
  return mockFetchOnce({
    candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
    modelVersion: "gemini-2.5-flash"
  });
}

function addPromptsInput(overrides: Partial<Parameters<typeof generateAddedPrompts>[0]> = {}) {
  return {
    mode: "auto" as const,
    brand: "Acme",
    domain: "acme.com",
    country: "ES",
    language: "es",
    existingPromptTexts: [],
    existingCategories: [],
    ...overrides
  };
}

describe("generateAddedPrompts", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.GEMINI_MODEL;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it("auto mode: returns invented prompts with categories, capped at the requested limit", async () => {
    const fetchMock = mockGeminiJson({
      prompts: [
        { text: "¿Cuál es el mejor CRM para pymes?", category: "Comparación" },
        { text: "¿Qué alternativas hay a los CRM tradicionales?", category: "Alternativas" },
        { text: "¿Cómo elegir un CRM en 2026?", category: "Cómo hacer / guía" }
      ]
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateAddedPrompts(addPromptsInput({ limit: 2 }));

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ text: "¿Cuál es el mejor CRM para pymes?", category: "Comparación" });
  });

  it("auto mode: deduplicates against existingPromptTexts case-insensitively", async () => {
    const fetchMock = mockGeminiJson({
      prompts: [
        { text: "¿Cuál es el mejor CRM para pymes?", category: "Comparación" },
        { text: "¿Qué alternativas hay a los CRM tradicionales?", category: "Alternativas" }
      ]
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateAddedPrompts(
      addPromptsInput({ existingPromptTexts: ["¿cuál es el mejor crm para pymes?"] })
    );

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("¿Qué alternativas hay a los CRM tradicionales?");
  });

  it("auto mode: falls back to a default category when Gemini omits one", async () => {
    const fetchMock = mockGeminiJson({ prompts: [{ text: "¿Cuál es el mejor CRM para pymes?", category: "" }] });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateAddedPrompts(addPromptsInput());

    expect(result[0].category).toBe("General");
  });

  it("auto mode: returns [] when Gemini's response fails schema validation", async () => {
    const fetchMock = mockGeminiJson({ prompts: "not-an-array" });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateAddedPrompts(addPromptsInput());

    expect(result).toEqual([]);
  });

  it("keywords mode: includes the user's keywords in the request sent to Gemini", async () => {
    const fetchMock = mockGeminiJson({ prompts: [{ text: "¿Qué CRM ofrece automatización de marketing?", category: "Casos de uso" }] });
    vi.stubGlobal("fetch", fetchMock);

    await generateAddedPrompts(addPromptsInput({ mode: "keywords", keywords: ["automatización", "marketing"] }));

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    const promptText = body.contents[0].parts[0].text as string;

    expect(promptText).toContain("automatización, marketing");
  });

  it("manual mode: preserves user text verbatim and applies Gemini's per-index category", async () => {
    const fetchMock = mockGeminiJson({
      items: [
        { index: 0, category: "Precio y planes" },
        { index: 1, category: "Casos de uso" }
      ]
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateAddedPrompts(
      addPromptsInput({
        mode: "manual",
        manualPrompts: ["¿Cuánto cuesta el plan Pro?", "¿Sirve para equipos de ventas?"]
      })
    );

    expect(result).toEqual([
      { text: "¿Cuánto cuesta el plan Pro?", category: "Precio y planes" },
      { text: "¿Sirve para equipos de ventas?", category: "Casos de uso" }
    ]);
  });

  it("manual mode: never invents new prompts, even if Gemini returns extra items", async () => {
    const fetchMock = mockGeminiJson({
      items: [
        { index: 0, category: "Precio y planes" },
        { index: 1, category: "Casos de uso" }
      ]
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateAddedPrompts(
      addPromptsInput({ mode: "manual", manualPrompts: ["¿Cuánto cuesta el plan Pro?"] })
    );

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("¿Cuánto cuesta el plan Pro?");
  });

  it("manual mode: falls back to the default category when Gemini's categorization fails", async () => {
    const fetchMock = mockGeminiJson({ items: "not-an-array" });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateAddedPrompts(
      addPromptsInput({ mode: "manual", manualPrompts: ["¿Cuánto cuesta el plan Pro?"] })
    );

    expect(result).toEqual([{ text: "¿Cuánto cuesta el plan Pro?", category: "General" }]);
  });

  it("manual mode: returns [] when there are no non-empty prompts to categorize", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateAddedPrompts(addPromptsInput({ mode: "manual", manualPrompts: ["   ", ""] }));

    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  const SAMPLE_PROFILE: BusinessProfile = {
    whatItSells: "CRM para pymes",
    sector: "Software",
    subSector: "CRM B2B",
    businessModel: "b2b",
    targetCustomer: "Pymes",
    geographicScope: "España",
    sizeEstimate: "Pequeña empresa",
    confidence: "high"
  };

  it("auto mode: includes the business profile in the prompt when provided (COMPETITOR-GROUNDING-2, docs/adr/0022)", async () => {
    const fetchMock = mockGeminiJson({ prompts: [{ text: "¿Cuál es el mejor CRM para pymes?", category: "Comparación" }] });
    vi.stubGlobal("fetch", fetchMock);

    await generateAddedPrompts(addPromptsInput({ profile: SAMPLE_PROFILE }));

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    const promptText = body.contents[0].parts[0].text as string;

    expect(promptText).toContain(SAMPLE_PROFILE.whatItSells);
    expect(promptText).toContain(SAMPLE_PROFILE.sector);
    expect(promptText).toContain(SAMPLE_PROFILE.targetCustomer);
  });

  it("auto mode: prompt is unchanged (no business-profile section) when profile is omitted — regression for existing projects with no cached profile", async () => {
    const fetchMock = mockGeminiJson({ prompts: [{ text: "¿Cuál es el mejor CRM para pymes?", category: "Comparación" }] });
    vi.stubGlobal("fetch", fetchMock);

    await generateAddedPrompts(addPromptsInput());

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    const promptText = body.contents[0].parts[0].text as string;

    expect(promptText).not.toMatch(/What it sells:/);
    expect(promptText).not.toMatch(/Sector \/ sub-sector:/);
  });
});

function rewriteInput(overrides: Partial<Parameters<typeof rewriteRecommendation>[0]> = {}) {
  return {
    brand: "Acme",
    domain: "acme.com",
    language: "es",
    recommendationType: "improve_citation_readiness",
    ruleTitle: "Haz que tu contenido sea más citable",
    ruleDescription: "Las respuestas de IA rara vez citan tu marca.",
    whyThisMatters: "Una presencia de citas baja limita tu autoridad.",
    affectedPrompts: ["¿Cuál es la mejor marca de muebles?"],
    mentionedCompetitors: ["Conforama"],
    citationDomains: ["example.com"],
    evidenceSnippets: ["Acme no aparece citada en esta respuesta."],
    ...overrides
  };
}

describe("rewriteRecommendation", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.GEMINI_MODEL;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it("returns the structured action plan on valid Gemini output", async () => {
    const out = {
      title: "Refuerza tu contenido citable frente a Conforama",
      summary: "Acme no aparece citada frente a Conforama en respuestas sobre muebles; añade datos verificables.",
      steps: ["Publica una comparativa directa.", "Añade un bloque factual citable."],
      examples: [
        { label: "Párrafo citable", content: "Acme fabrica sofás cama con [tu dato aquí] de garantía." },
        { label: "FAQ schema (JSON-LD)", content: '{ "@type": "FAQPage" }' }
      ]
    };
    const fetchMock = mockGeminiJson(out);
    vi.stubGlobal("fetch", fetchMock);

    const result = await rewriteRecommendation(rewriteInput());

    expect(result).toEqual(out);
  });

  it("accepts a legacy single `example` object and normalizes it to the examples array", async () => {
    const fetchMock = mockGeminiJson({
      title: "Título",
      summary: "Resumen",
      steps: [],
      example: { label: "Bloque", content: "Contenido pegable" }
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await rewriteRecommendation(rewriteInput());

    expect(result?.examples).toEqual([{ label: "Bloque", content: "Contenido pegable" }]);
  });

  it("caps the generated examples at three", async () => {
    const fetchMock = mockGeminiJson({
      title: "Título",
      summary: "Resumen",
      steps: [],
      examples: [
        { label: "a", content: "1" },
        { label: "b", content: "2" },
        { label: "c", content: "3" },
        { label: "d", content: "4" }
      ]
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await rewriteRecommendation(rewriteInput());

    expect(result?.examples).toHaveLength(3);
  });

  it("injects a competitor comparison-page asset focus for close_competitor_gap", async () => {
    const fetchMock = mockGeminiJson({ title: "t", summary: "s", steps: [], examples: [] });
    vi.stubGlobal("fetch", fetchMock);

    await rewriteRecommendation(
      rewriteInput({ recommendationType: "close_competitor_gap", dominantCompetitor: "Conforama" })
    );

    const promptText = JSON.parse(fetchMock.mock.calls[0][1].body as string).contents[0].parts[0].text as string;
    expect(promptText).toContain("ASSET FOCUS — comparison page");
    expect(promptText).toContain("Acme vs Conforama");
  });

  it("injects a counter-narrative asset focus for address_negative_narrative", async () => {
    const fetchMock = mockGeminiJson({ title: "t", summary: "s", steps: [], examples: [] });
    vi.stubGlobal("fetch", fetchMock);

    await rewriteRecommendation(rewriteInput({ recommendationType: "address_negative_narrative" }));

    const promptText = JSON.parse(fetchMock.mock.calls[0][1].body as string).contents[0].parts[0].text as string;
    expect(promptText).toContain("ASSET FOCUS — counter-narrative");
  });

  it("injects a digital-PR asset focus for pursue_citation_sources", async () => {
    const fetchMock = mockGeminiJson({ title: "t", summary: "s", steps: [], examples: [] });
    vi.stubGlobal("fetch", fetchMock);

    await rewriteRecommendation(rewriteInput({ recommendationType: "pursue_citation_sources" }));

    const promptText = JSON.parse(fetchMock.mock.calls[0][1].body as string).contents[0].parts[0].text as string;
    expect(promptText).toContain("ASSET FOCUS — digital PR");
  });

  it("injects a FAQ asset focus for create_faq_section and an entity-schema focus for entity clarity", async () => {
    const fetchMock = mockGeminiJson({ title: "t", summary: "s", steps: [], examples: [] });
    vi.stubGlobal("fetch", fetchMock);

    await rewriteRecommendation(rewriteInput({ recommendationType: "create_faq_section" }));
    const faqPrompt = JSON.parse(fetchMock.mock.calls[0][1].body as string).contents[0].parts[0].text as string;
    expect(faqPrompt).toContain("ASSET FOCUS — FAQ");

    await rewriteRecommendation(rewriteInput({ recommendationType: "strengthen_brand_entity_clarity" }));
    const entityPrompt = JSON.parse(fetchMock.mock.calls[1][1].body as string).contents[0].parts[0].text as string;
    expect(entityPrompt).toContain("ASSET FOCUS — entity clarity");
    expect(entityPrompt).toContain("Organization JSON-LD");
  });

  it("includes only the anchored competitors/domains in the prompt sent to Gemini", async () => {
    const fetchMock = mockGeminiJson({ title: "Título", description: "Descripción" });
    vi.stubGlobal("fetch", fetchMock);

    await rewriteRecommendation(rewriteInput({ mentionedCompetitors: ["Conforama"], citationDomains: ["example.com"] }));

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    const promptText = body.contents[0].parts[0].text as string;

    expect(promptText).toContain("Conforama");
    expect(promptText).toContain("example.com");
    expect(promptText).toContain("Do NOT mention any competitor");
    expect(promptText).toContain("Do NOT mention any domain");
  });

  it("returns null when Gemini's response fails schema validation", async () => {
    const fetchMock = mockGeminiJson({ title: "Solo título sin descripción" });
    vi.stubGlobal("fetch", fetchMock);

    const result = await rewriteRecommendation(rewriteInput());

    expect(result).toBeNull();
  });

  it("returns null when the title or summary is empty after trimming", async () => {
    const fetchMock = mockGeminiJson({ title: "   ", summary: "Algo", steps: [], example: null });
    vi.stubGlobal("fetch", fetchMock);

    const result = await rewriteRecommendation(rewriteInput());

    expect(result).toBeNull();
  });

  it("returns null when Gemini's output exceeds the safety length caps", async () => {
    const fetchMock = mockGeminiJson({ title: "x".repeat(201), summary: "Algo", steps: [], example: null });
    vi.stubGlobal("fetch", fetchMock);

    const result = await rewriteRecommendation(rewriteInput());

    expect(result).toBeNull();
  });

  it("propagates a Gemini API failure instead of swallowing it", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal("fetch", fetchMock);

    await expect(rewriteRecommendation(rewriteInput())).rejects.toThrow();
  });
});

describe("auditDomainContent (WEB-AUDIT-DQ query derivation)", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.GEMINI_MODEL;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  const auditInput = {
    brand: "Ryanair",
    domain: "ryanair.com",
    language: "es",
    topic: "¿Cuáles son las políticas de equipaje de mano más comunes en las aerolíneas económicas?"
  };

  it("does NOT hand Gemini the full question as a literal site: search query", async () => {
    const fetchMock = mockFetchOnce({
      candidates: [{ content: { parts: [{ text: "Sí, hay una página." }] } }],
      modelVersion: "gemini-2.5-flash"
    });
    vi.stubGlobal("fetch", fetchMock);

    await auditDomainContent(auditInput);

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    const contentText = body.contents[0].parts[0].text as string;
    const instructionText = body.systemInstruction.parts[0].text as string;

    // The regression we are fixing: the old prompt embedded
    // `Search query: site:ryanair.com {full question}`, which Gemini searched
    // verbatim and got zero grounding chunks for.
    expect(contentText).not.toContain(`Search query: site:${auditInput.domain}`);
    // It still enables grounding and restricts to the domain in the instruction.
    expect(body.tools).toEqual([{ google_search: {} }]);
    expect(instructionText).toContain(`site:${auditInput.domain}`);
    // And it instructs keyword-subject derivation instead of verbatim search.
    expect(instructionText).toMatch(/keyword/i);
    expect(instructionText).toMatch(/do not search for the full question text verbatim/i);
  });

  it("parses own-domain grounding chunks from the response", async () => {
    const fetchMock = mockFetchOnce({
      candidates: [
        {
          content: { parts: [{ text: "Página encontrada." }] },
          groundingMetadata: {
            groundingChunks: [{ web: { uri: "https://redirect/abc", title: "Equipaje de mano" } }]
          }
        }
      ],
      modelVersion: "gemini-2.5-flash"
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await auditDomainContent(auditInput);
    expect(result.groundingChunks).toEqual([{ uri: "https://redirect/abc", title: "Equipaje de mano" }]);
    expect(result.text).toBe("Página encontrada.");
  });
});

describe("extractGeminiStructuredData — MENTION-VERIFY-1 (docs/adr/0021)", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.GEMINI_MODEL;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it("instructs the model that topical relevance is not a mention, and requests display_name_found per competitor", async () => {
    const extractionJson = {
      brand: { mentioned: true, display_name_found: "Acme", evidence: ["Acme is great"], position: 1 },
      competitors: [{ name: "Globex", mentioned: false, display_name_found: null, evidence: [], position: null }],
      citations: [],
      sentiment: "positive",
      sentiment_drivers: [],
      other_brands_mentioned: [],
      summary: "Acme looks great.",
      confidence: "high",
      notes: []
    };
    const fetchMock = mockFetchOnce({
      candidates: [{ content: { parts: [{ text: JSON.stringify(extractionJson) }] } }],
      modelVersion: "gemini-2.5-flash"
    });
    vi.stubGlobal("fetch", fetchMock);

    await extractGeminiStructuredData({
      brand: "Acme",
      competitors: ["Globex"],
      rawResponseText: "Acme is a great CRM.",
      promptText: "What is the best CRM?"
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    const promptText = body.contents[0].parts[0].text as string;

    expect(promptText).toMatch(/topical relevance is not a mention/i);
    expect(promptText).toMatch(/EXACT substring of the response text/i);
    expect(promptText).toContain('"display_name_found": string|null');
  });
});

// COMPETITOR-GROUNDING-1 (docs/adr/0020-grounded-business-profile.md): these
// three describe blocks replace the domain-only suggestion path with an
// evidence/profile-driven one. See lib/projects/business-profile.test.ts for
// the evidence-fetching layer these functions consume.
describe("inferBusinessProfile", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.GEMINI_MODEL;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  const okEvidence = {
    status: "ok" as const,
    title: "iFinanciera",
    description: "Consultoría especializada en dirección financiera de empresas y finanzas corporativas.",
    headings: ["Financial Business Management"],
    excerpt: "Consultoria especializada en dirección financiera de empresas y finanzas corporativas. Mejoramos PYMES."
  };

  it("returns null when GEMINI_API_KEY is missing (never throws)", async () => {
    delete process.env.GEMINI_API_KEY;

    const result = await inferBusinessProfile({
      domain: "ifinanciera.es",
      country: "ES",
      language: "es",
      evidence: okEvidence
    });

    expect(result).toBeNull();
  });

  it("sends the evidence and does NOT enable google_search grounding (fast JSON call)", async () => {
    const fetchMock = mockFetchOnce({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  what_it_sells: "Consultoría de dirección financiera para pymes",
                  sector: "Servicios profesionales",
                  sub_sector: "Consultoría financiera B2B",
                  business_model: "b2b",
                  target_customer: "Pymes",
                  geographic_scope: "España",
                  size_estimate: "Pequeña consultoría boutique",
                  confidence: "high"
                })
              }
            ]
          }
        }
      ]
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await inferBusinessProfile({
      domain: "ifinanciera.es",
      country: "ES",
      language: "es",
      evidence: okEvidence
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.tools).toBeUndefined();
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.contents[0].parts[0].text).toContain(okEvidence.description);
    expect(body.contents[0].parts[0].text).not.toMatch(/well-known/i);

    expect(result).toEqual<BusinessProfile>({
      whatItSells: "Consultoría de dirección financiera para pymes",
      sector: "Servicios profesionales",
      subSector: "Consultoría financiera B2B",
      businessModel: "b2b",
      targetCustomer: "Pymes",
      geographicScope: "España",
      sizeEstimate: "Pequeña consultoría boutique",
      confidence: "high"
    });
  });

  it("includes a user-provided description in the prompt when given", async () => {
    const fetchMock = mockFetchOnce({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  what_it_sells: "x",
                  sector: "x",
                  sub_sector: "x",
                  business_model: "unknown",
                  target_customer: "x",
                  geographic_scope: "x",
                  size_estimate: "x",
                  confidence: "medium"
                })
              }
            ]
          }
        }
      ]
    });
    vi.stubGlobal("fetch", fetchMock);

    await inferBusinessProfile({
      domain: "sinweb.com",
      country: "ES",
      language: "es",
      evidence: { status: "unavailable" },
      userDescription: "Somos una consultoría de dirección financiera para pymes."
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.contents[0].parts[0].text).toContain("Somos una consultoría de dirección financiera para pymes.");
  });

  it("returns null when the response fails schema validation", async () => {
    const fetchMock = mockFetchOnce({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ nonsense: true }) }] } }]
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await inferBusinessProfile({
      domain: "ifinanciera.es",
      country: "ES",
      language: "es",
      evidence: okEvidence
    });

    expect(result).toBeNull();
  });
});

describe("suggestCompetitors (grounded, business-profile-driven)", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.GEMINI_MODEL;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  const financialProfile: BusinessProfile = {
    whatItSells: "Consultoría de dirección financiera para pymes",
    sector: "Servicios profesionales",
    subSector: "Consultoría financiera B2B",
    businessModel: "b2b",
    targetCustomer: "Pymes",
    geographicScope: "España",
    sizeEstimate: "Pequeña consultoría boutique",
    confidence: "high"
  };

  it("enables google_search grounding and sends the profile instead of asking for well-known brands", async () => {
    const fetchMock = mockFetchOnce({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  competitors: [{ name: "Consultora Rival", domain: "consultorarival.es" }]
                })
              }
            ]
          }
        }
      ]
    });
    vi.stubGlobal("fetch", fetchMock);

    await suggestCompetitors({
      brand: "iFinanciera",
      domain: "ifinanciera.es",
      country: "ES",
      language: "es",
      profile: financialProfile
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.tools).toEqual([{ google_search: {} }]);
    expect(body.generationConfig.responseMimeType).toBeUndefined();
    const promptText = body.contents[0].parts[0].text as string;
    expect(promptText).not.toMatch(/well-known/i);
    expect(promptText).toContain(financialProfile.sector);
    expect(promptText).toContain(financialProfile.subSector);
    expect(promptText).toMatch(/comparable size/i);
  });

  it("parses a JSON response wrapped in a ```json code fence (grounded responses aren't always bare JSON)", async () => {
    const fenced = "```json\n" + JSON.stringify({ competitors: [{ name: "Consultora Rival", domain: "consultorarival.es" }] }) + "\n```";
    const fetchMock = mockFetchOnce({ candidates: [{ content: { parts: [{ text: fenced }] } }] });
    vi.stubGlobal("fetch", fetchMock);

    const result = await suggestCompetitors({
      brand: "iFinanciera",
      domain: "ifinanciera.es",
      country: "ES",
      language: "es",
      profile: financialProfile
    });

    expect(result).toEqual([{ name: "Consultora Rival", domain: "consultorarival.es" }]);
  });

  it("still excludes the brand's own domain and dedupes", async () => {
    const fetchMock = mockFetchOnce({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  competitors: [
                    { name: "iFinanciera", domain: "ifinanciera.es" },
                    { name: "Rival", domain: "rival.es" },
                    { name: "Rival duplicado", domain: "rival.es" }
                  ]
                })
              }
            ]
          }
        }
      ]
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await suggestCompetitors({
      brand: "iFinanciera",
      domain: "ifinanciera.es",
      country: "ES",
      language: "es",
      profile: financialProfile
    });

    expect(result).toEqual([{ name: "Rival", domain: "rival.es" }]);
  });

  it("returns [] (never throws) when the Gemini call fails", async () => {
    const fetchMock = mockFetchOnce({}, 500);
    vi.stubGlobal("fetch", fetchMock);

    const result = await suggestCompetitors({
      brand: "iFinanciera",
      domain: "ifinanciera.es",
      country: "ES",
      language: "es",
      profile: financialProfile
    });

    expect(result).toEqual([]);
  });
});

describe("suggestPrompts (business-profile-driven)", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.GEMINI_MODEL;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  const financialProfile: BusinessProfile = {
    whatItSells: "Consultoría de dirección financiera para pymes",
    sector: "Servicios profesionales",
    subSector: "Consultoría financiera B2B",
    businessModel: "b2b",
    targetCustomer: "Pymes",
    geographicScope: "España",
    sizeEstimate: "Pequeña consultoría boutique",
    confidence: "high"
  };

  it("includes the business profile in the prompt (not just brand/domain)", async () => {
    const fetchMock = mockFetchOnce({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  prompts: [
                    { text: "¿Cuál es la mejor consultoría de dirección financiera para pymes?", category: "Comparación" }
                  ]
                })
              }
            ]
          }
        }
      ]
    });
    vi.stubGlobal("fetch", fetchMock);

    await suggestPrompts({
      brand: "iFinanciera",
      domain: "ifinanciera.es",
      country: "ES",
      language: "es",
      profile: financialProfile
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    const promptText = body.contents[0].parts[0].text as string;
    expect(promptText).toContain(financialProfile.whatItSells);
    expect(promptText).toContain(financialProfile.sector);
    expect(promptText).toContain(financialProfile.targetCustomer);
  });
});
