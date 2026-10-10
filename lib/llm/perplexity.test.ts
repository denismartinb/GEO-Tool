import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  generatePerplexityVisibilityAnswer,
  PerplexityConfigError,
  PERPLEXITY_DEFAULT_MODEL,
  selectCitedSources,
  stripCitationMarkers
} from "./perplexity";

const ORIGINAL_ENV = { ...process.env };

function response(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function agentResult(text: string, results: Array<{ id: number; url: string; title?: string }> = []) {
  return {
    model: "perplexity/sonar",
    output: [
      { type: "search_results", queries: ["q"], results },
      { type: "message", role: "assistant", content: [{ type: "output_text", text, annotations: [] }] }
    ],
    usage: { input_tokens: 4000, output_tokens: 400, total_tokens: 4400, tool_calls_details: { search_web: { invocation: 1 } } }
  };
}

const input = { prompt: "¿Qué CRM me recomiendas?", country: "ES", language: "es" };

describe("generatePerplexityVisibilityAnswer", () => {
  beforeEach(() => {
    process.env.PERPLEXITY_API_KEY = "test-key";
    delete process.env.PERPLEXITY_MODEL;
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("refuses without an API key", async () => {
    delete process.env.PERPLEXITY_API_KEY;
    await expect(generatePerplexityVisibilityAnswer(input)).rejects.toBeInstanceOf(PerplexityConfigError);
  });

  it("calls the Agent API with Perplexity's own model, web search and the market's country", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(agentResult("HubSpot es una buena opción.")));
    vi.stubGlobal("fetch", fetchMock);

    await generatePerplexityVisibilityAnswer(input);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.perplexity.ai/v1/agent");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer test-key" });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe(PERPLEXITY_DEFAULT_MODEL);
    expect(body.tools).toEqual([{ type: "web_search", search_type: "web", user_location: { country: "ES" } }]);
    expect(body.instructions).toMatch(/not favour or avoid any particular brand/i);
    expect(body.input).toContain("¿Qué CRM me recomiendas?");
  });

  it("leaves user_location out when the country is not an ISO code", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(agentResult("Texto.")));
    vi.stubGlobal("fetch", fetchMock);

    await generatePerplexityVisibilityAnswer({ ...input, country: "Spain" });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.tools[0].user_location).toBeUndefined();
  });

  it("honours the comparison's model override and PERPLEXITY_MODEL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(agentResult("Texto.")));
    vi.stubGlobal("fetch", fetchMock);

    process.env.PERPLEXITY_MODEL = "perplexity/other";
    await generatePerplexityVisibilityAnswer(input);
    await generatePerplexityVisibilityAnswer({ ...input, model: "perplexity/override" });

    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string).model).toBe("perplexity/other");
    expect(JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string).model).toBe("perplexity/override");
  });

  it("returns clean text, only the cited sources, tokens and the search count", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response(
          agentResult("HubSpot es popular [web:1]. Pipedrive también [web:3].", [
            { id: 1, url: "https://hubspot.es/crm", title: "HubSpot" },
            { id: 2, url: "https://no-citada.com" },
            { id: 3, url: "https://pipedrive.com" }
          ])
        )
      )
    );

    const answer = await generatePerplexityVisibilityAnswer(input);

    expect(answer.text).toBe("HubSpot es popular. Pipedrive también.");
    expect(answer.groundingChunks).toEqual([{ uri: "https://hubspot.es/crm", title: "HubSpot" }, { uri: "https://pipedrive.com" }]);
    expect(answer).toMatchObject({ model: "perplexity/sonar", tokensIn: 4000, tokensOut: 400, totalTokens: 4400, searchQueries: 1 });
  });

  it("retries once on a rate limit and then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({}, 429))
      .mockResolvedValueOnce(response(agentResult("Texto.")));
    vi.stubGlobal("fetch", fetchMock);

    const answer = await generatePerplexityVisibilityAnswer(input);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(answer.text).toBe("Texto.");
  });

  it("throws our own message on a non-OK status, never the provider's", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ error: { message: "secret detail" } }, 401)));
    await expect(generatePerplexityVisibilityAnswer(input)).rejects.toThrow(
      "Perplexity API authentication failed. Check PERPLEXITY_API_KEY."
    );
  });

  it("throws on an empty answer instead of returning a mute row", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(agentResult("   "))));
    await expect(generatePerplexityVisibilityAnswer(input)).rejects.toThrow("Perplexity returned an empty response.");
  });
});

describe("selectCitedSources", () => {
  const results = [
    { id: 1, url: "https://a.com" },
    { id: 2, url: "https://b.com" }
  ];

  it("keeps every result when the text has no markers", () => {
    expect(selectCitedSources("Sin marcas.", results)).toEqual([{ uri: "https://a.com" }, { uri: "https://b.com" }]);
  });

  it("reads plain and grouped markers", () => {
    expect(selectCitedSources("Uno [2].", results)).toEqual([{ uri: "https://b.com" }]);
    expect(selectCitedSources("Dos [1, 2].", results)).toHaveLength(2);
  });
});

describe("stripCitationMarkers", () => {
  it("removes markers without leaving a space before punctuation", () => {
    expect(stripCitationMarkers("Acme [1][web:2], y Beta [3].")).toBe("Acme, y Beta.");
  });
});
