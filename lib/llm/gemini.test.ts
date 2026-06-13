import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateGeminiVisibilityAnswer, GeminiConfigError } from "./gemini";

const ORIGINAL_ENV = { ...process.env };

function mockFetchOnce(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  });
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
        brand: "Acme",
        competitors: [],
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
      brand: "Acme",
      competitors: ["Globex"],
      country: "ES",
      language: "es"
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [endpoint, init] = fetchMock.mock.calls[0];
    expect(endpoint).toContain("gemini-2.0-flash-001");

    const body = JSON.parse(init.body as string);
    expect(body.tools).toEqual([{ google_search: {} }]);
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
      brand: "Acme",
      competitors: [],
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
      brand: "Acme",
      competitors: [],
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
        brand: "Acme",
        competitors: [],
        country: "ES",
        language: "es"
      })
    ).rejects.toBeInstanceOf(GeminiConfigError);
  });
});
