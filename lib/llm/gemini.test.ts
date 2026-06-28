import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateAddedPrompts,
  generateGeminiVisibilityAnswer,
  rewriteRecommendation,
  GeminiConfigError,
  GeminiTimeoutError
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
