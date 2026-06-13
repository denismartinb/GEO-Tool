import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateGeminiVisibilityAnswer, GeminiTimeoutError } from "./gemini";

const ORIGINAL_ENV = { ...process.env };

function visibilityInput() {
  return {
    prompt: "What is the best CRM?",
    brand: "Acme",
    competitors: ["Beta", "Gamma"],
    country: "ES",
    language: "es"
  };
}

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
