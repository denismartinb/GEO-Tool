import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateGeminiVisibilityAnswer, GeminiConfigError, GeminiTimeoutError } from "./gemini";

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
