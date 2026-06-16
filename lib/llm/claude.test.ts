import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateClaudeVisibilityAnswer, ClaudeConfigError, ClaudeTimeoutError } from "./claude";

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

function anthropicResponse(text: string, model = "claude-haiku-4-5-20251001") {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    content: [{ type: "text", text }],
    model,
    stop_reason: "end_turn",
    usage: { input_tokens: 20, output_tokens: 50 }
  };
}

describe("generateClaudeVisibilityAnswer", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    delete process.env.ANTHROPIC_MODEL;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("throws ClaudeConfigError when ANTHROPIC_API_KEY is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    await expect(generateClaudeVisibilityAnswer(visibilityInput())).rejects.toBeInstanceOf(ClaudeConfigError);
  });

  it("calls the Anthropic Messages API with correct headers and model", async () => {
    const fetchMock = mockFetchOnce(anthropicResponse("Acme is a great CRM."));
    vi.stubGlobal("fetch", fetchMock);

    await generateClaudeVisibilityAnswer(visibilityInput());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect((init as RequestInit).headers).toMatchObject({
      "x-api-key": "test-key",
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    });

    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe("claude-haiku-4-5-20251001");
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe("user");
  });

  it("sends a brand-blind neutral prompt", async () => {
    const fetchMock = mockFetchOnce(anthropicResponse("Salesforce and HubSpot are popular options."));
    vi.stubGlobal("fetch", fetchMock);

    await generateClaudeVisibilityAnswer({ prompt: "best CRM for startups", country: "ES", language: "es" });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);

    expect(body.system).toMatch(/not favour or avoid any particular brand/i);
    expect(body.system).not.toContain("Brand:");
    expect(body.system).not.toContain("Competitors:");

    const userContent = body.messages[0].content as string;
    expect(userContent).toContain("Question: best CRM for startups");
    expect(userContent).toContain("ES");
    expect(userContent).not.toContain("Brand:");
  });

  it("returns text, model, and token counts", async () => {
    const fetchMock = mockFetchOnce(anthropicResponse("Acme is a great CRM.", "claude-haiku-4-5-20251001"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateClaudeVisibilityAnswer(visibilityInput());

    expect(result.text).toBe("Acme is a great CRM.");
    expect(result.model).toBe("claude-haiku-4-5-20251001");
    expect(result.tokensIn).toBe(20);
    expect(result.tokensOut).toBe(50);
    expect(result.totalTokens).toBe(70);
    expect(result.groundingChunks).toBeUndefined();
  });

  it("throws on empty response content", async () => {
    const fetchMock = mockFetchOnce({
      ...anthropicResponse(""),
      content: [{ type: "text", text: "" }]
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateClaudeVisibilityAnswer(visibilityInput())).rejects.toThrow("empty response");
  });

  it("throws on non-ok HTTP status", async () => {
    const fetchMock = mockFetchOnce({ error: { type: "authentication_error" } }, 401);
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateClaudeVisibilityAnswer(visibilityInput())).rejects.toThrow(
      "authentication failed"
    );
  });

  it("retries once on 429 rate limit", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => anthropicResponse("Acme is great.")
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateClaudeVisibilityAnswer(visibilityInput());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.text).toBe("Acme is great.");
  });

  it("throws ClaudeTimeoutError when the request is aborted", async () => {
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

    const expectation = expect(generateClaudeVisibilityAnswer(visibilityInput())).rejects.toBeInstanceOf(
      ClaudeTimeoutError
    );

    await vi.advanceTimersByTimeAsync(20_000);
    await expectation;

    vi.useRealTimers();
  });
});
