import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateOpenAIVisibilityAnswer, extractOpenAIStructuredData, OpenAIConfigError, OpenAITimeoutError } from "./openai";

const ORIGINAL_ENV = { ...process.env };

function mockFetchOnce(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  });
}

function visibilityInput() {
  return { prompt: "What is the best CRM?", country: "ES", language: "es" };
}

function responsesApiResult(
  text: string,
  opts: { annotations?: Array<{ type: string; url?: string; title?: string }>; usage?: Record<string, number> } = {}
) {
  return {
    output: [
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text, annotations: opts.annotations ?? [] }]
      }
    ],
    usage: opts.usage ?? { input_tokens: 20, output_tokens: 50, total_tokens: 70 }
  };
}

describe("generateOpenAIVisibilityAnswer", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_MODEL = "gpt-test-model";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("throws OpenAIConfigError when OPENAI_API_KEY is missing", async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(generateOpenAIVisibilityAnswer(visibilityInput())).rejects.toBeInstanceOf(OpenAIConfigError);
  });

  it("throws OpenAIConfigError when OPENAI_MODEL is missing (no default model assumed)", async () => {
    delete process.env.OPENAI_MODEL;

    await expect(generateOpenAIVisibilityAnswer(visibilityInput())).rejects.toBeInstanceOf(OpenAIConfigError);
  });

  it("calls the Responses API with the web_search tool and correct headers/model", async () => {
    const fetchMock = mockFetchOnce(responsesApiResult("Acme is a great CRM."));
    vi.stubGlobal("fetch", fetchMock);

    await generateOpenAIVisibilityAnswer(visibilityInput());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer test-key",
      "Content-Type": "application/json"
    });

    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe("gpt-test-model");
    expect(body.tools).toEqual([{ type: "web_search" }]);
    // Forced (not "auto") — gpt-4o-mini answered from memory on all 10
    // prompts of the first real scan when left to decide, producing zero
    // grounding citations.
    expect(body.tool_choice).toEqual({ type: "web_search" });
  });

  it("sends a brand-blind neutral prompt", async () => {
    const fetchMock = mockFetchOnce(responsesApiResult("Salesforce and HubSpot are popular options."));
    vi.stubGlobal("fetch", fetchMock);

    await generateOpenAIVisibilityAnswer({ prompt: "best CRM for startups", country: "ES", language: "es" });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);

    expect(body.instructions).toMatch(/not favour or avoid any particular brand/i);
    expect(body.instructions).not.toContain("Brand:");

    expect(body.input).toContain("Question: best CRM for startups");
    expect(body.input).toContain("ES");
    expect(body.input).not.toContain("Brand:");
  });

  it("returns text, model, token counts, and grounding chunks from url_citation annotations", async () => {
    const fetchMock = mockFetchOnce(
      responsesApiResult("Acme is a great CRM according to a recent review.", {
        annotations: [
          { type: "url_citation", url: "https://example.com/review", title: "CRM Review" },
          { type: "url_citation", url: "https://other.com/page" }
        ]
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateOpenAIVisibilityAnswer(visibilityInput());

    expect(result.text).toBe("Acme is a great CRM according to a recent review.");
    expect(result.model).toBe("gpt-test-model");
    expect(result.tokensIn).toBe(20);
    expect(result.tokensOut).toBe(50);
    expect(result.totalTokens).toBe(70);
    expect(result.groundingChunks).toEqual([
      { uri: "https://example.com/review", title: "CRM Review" },
      { uri: "https://other.com/page", title: undefined }
    ]);
  });

  it("omits groundingChunks when the model did not cite any sources", async () => {
    const fetchMock = mockFetchOnce(responsesApiResult("Acme is a great CRM."));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateOpenAIVisibilityAnswer(visibilityInput());

    expect(result.groundingChunks).toBeUndefined();
  });

  it("throws on empty response content", async () => {
    const fetchMock = mockFetchOnce(responsesApiResult(""));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateOpenAIVisibilityAnswer(visibilityInput())).rejects.toThrow("empty response");
  });

  it("throws on non-ok HTTP status", async () => {
    const fetchMock = mockFetchOnce({ error: { type: "invalid_api_key" } }, 401);
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateOpenAIVisibilityAnswer(visibilityInput())).rejects.toThrow("authentication failed");
  });

  it("retries once on 429 rate limit", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => responsesApiResult("Acme is great.")
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateOpenAIVisibilityAnswer(visibilityInput());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.text).toBe("Acme is great.");
  });

  it("throws OpenAITimeoutError when the request is aborted", async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();

    const expectation = expect(generateOpenAIVisibilityAnswer(visibilityInput())).rejects.toBeInstanceOf(
      OpenAITimeoutError
    );

    await vi.advanceTimersByTimeAsync(20_000);
    await expectation;

    vi.useRealTimers();
  });
});

describe("extractOpenAIStructuredData", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_MODEL = "gpt-test-model";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function extractionInput() {
    return {
      brand: "Acme",
      competitors: ["Globex"],
      rawResponseText: "Acme is a great CRM, better than Globex.",
      promptText: "What is the best CRM?"
    };
  }

  function validExtractionJson() {
    return {
      brand: { mentioned: true, display_name_found: "Acme", evidence: ["Acme is a great CRM"], position: 1 },
      competitors: [{ name: "Globex", mentioned: true, evidence: ["better than Globex"], position: 2 }],
      citations: [],
      sentiment: "positive",
      other_brands_mentioned: [],
      summary: "Acme recommended over Globex.",
      confidence: "high",
      notes: []
    };
  }

  it("throws OpenAIConfigError when OPENAI_API_KEY is missing", async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(extractOpenAIStructuredData(extractionInput())).rejects.toBeInstanceOf(OpenAIConfigError);
  });

  it("parses a valid JSON extraction response", async () => {
    const fetchMock = mockFetchOnce(responsesApiResult(JSON.stringify(validExtractionJson())));
    vi.stubGlobal("fetch", fetchMock);

    const result = await extractOpenAIStructuredData(extractionInput());

    expect(result.data.brand.mentioned).toBe(true);
    expect(result.data.competitors[0].name).toBe("Globex");
    expect(result.model).toBe("gpt-test-model");
  });

  it("strips markdown fences before parsing", async () => {
    const fetchMock = mockFetchOnce(responsesApiResult("```json\n" + JSON.stringify(validExtractionJson()) + "\n```"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await extractOpenAIStructuredData(extractionInput());

    expect(result.data.brand.mentioned).toBe(true);
  });

  it("throws on invalid JSON", async () => {
    const fetchMock = mockFetchOnce(responsesApiResult("not valid json"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(extractOpenAIStructuredData(extractionInput())).rejects.toThrow("invalid JSON");
  });

  it("throws on schema validation failure", async () => {
    const fetchMock = mockFetchOnce(responsesApiResult(JSON.stringify({ brand: {} })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(extractOpenAIStructuredData(extractionInput())).rejects.toThrow("schema validation");
  });

  it("throws on non-ok HTTP status", async () => {
    const fetchMock = mockFetchOnce({ error: {} }, 429);
    vi.stubGlobal("fetch", fetchMock);

    await expect(extractOpenAIStructuredData(extractionInput())).rejects.toThrow("quota or rate limit");
  });
});
