import { afterEach, describe, expect, it, vi } from "vitest";
import { computeRetryDelayMs, fetchExtractionWithRetry } from "./extraction-fetch";

const OPTIONS = {
  timeoutMs: 50,
  maxAttempts: 3,
  baseDelayMs: 1,
  maxDelayMs: 5,
  describeStatus: (status: number) => (status === 429 ? "Provider quota or rate limit reached." : `Failed with status ${status}.`),
  timeoutMessage: "Provider extraction request timed out."
};

function response(status: number, headers: Record<string, string> = {}) {
  return { ok: status >= 200 && status < 300, status, headers: new Headers(headers), json: async () => ({}) };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchExtractionWithRetry", () => {
  it("returns the response without retrying when the first attempt succeeds", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchExtractionWithRetry("https://provider.test", {}, OPTIONS);

    expect(result.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // The production regression: every OpenAI extraction call returned 429 from
  // 2026-08-01 and the old bare `fetch` surfaced the first one as terminal.
  it("retries a 429 up to maxAttempts and reports it as quota", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(429));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchExtractionWithRetry("https://provider.test", {}, OPTIONS)).rejects.toMatchObject({
      name: "ExtractionError",
      category: "quota"
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("recovers when a transient 429 is followed by success", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(429)).mockResolvedValueOnce(response(200));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchExtractionWithRetry("https://provider.test", {}, OPTIONS);

    expect(result.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a 500 as transient transport", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(503)).mockResolvedValueOnce(response(200));
    vi.stubGlobal("fetch", fetchMock);

    await fetchExtractionWithRetry("https://provider.test", {}, OPTIONS);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([400, 401, 403])("does not retry a config-level %i", async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(response(status));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchExtractionWithRetry("https://provider.test", {}, OPTIONS)).rejects.toMatchObject({
      category: "config"
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports an aborted call as a timeout", async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchExtractionWithRetry("https://provider.test", {}, { ...OPTIONS, maxAttempts: 1, timeoutMs: 5 })
    ).rejects.toMatchObject({ category: "timeout", message: "Provider extraction request timed out." });
  });

  // Waiting out a backoff the pass cannot afford would starve the rows still
  // queued behind this one.
  it("stops immediately when the pass deadline has already passed", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchExtractionWithRetry("https://provider.test", {}, { ...OPTIONS, deadlineAt: Date.now() - 1 })
    ).rejects.toMatchObject({ category: "timeout" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not sleep past the deadline before a retry", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(429));
    vi.stubGlobal("fetch", fetchMock);
    // El backoff es *full jitter* — `Math.random() * 10.000` — y este caso
    // afirma que la espera NO cabe en los 50 ms que quedan de presupuesto. Sin
    // fijar el sorteo, una de cada ~200 ejecuciones saca un retraso menor que
    // esos 50 ms, el reintento sí cabe, y el test falla sin que nada esté roto.
    // Pasó en CI el 2026-08-10 sobre código que no lo tocaba. Un rojo espurio
    // en la puerta enseña a ignorar los rojos, que es peor que no tener puerta.
    // Se fija al máximo (10 s) porque es lo que el test quiere decir: cuando el
    // backoff calculado no cabe, no se reintenta.
    vi.spyOn(Math, "random").mockReturnValue(1);

    await expect(
      fetchExtractionWithRetry(
        "https://provider.test",
        {},
        { ...OPTIONS, baseDelayMs: 10_000, maxDelayMs: 10_000, deadlineAt: Date.now() + 50 }
      )
    ).rejects.toMatchObject({ category: "quota" });
    // One attempt made, then the backoff was recognized as unaffordable.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("computeRetryDelayMs", () => {
  it("honors a Retry-After header in seconds", () => {
    expect(computeRetryDelayMs({ attempt: 1, baseDelayMs: 100, maxDelayMs: 10_000, retryAfterHeader: "2" })).toBe(2000);
  });

  it("clamps a Retry-After that would stall the invocation", () => {
    expect(computeRetryDelayMs({ attempt: 1, baseDelayMs: 100, maxDelayMs: 8000, retryAfterHeader: "60" })).toBe(8000);
  });

  it("ignores a malformed Retry-After and falls back to backoff", () => {
    const delay = computeRetryDelayMs({
      attempt: 1,
      baseDelayMs: 100,
      maxDelayMs: 10_000,
      retryAfterHeader: "Wed, 21 Oct 2026 07:28:00 GMT",
      random: () => 1
    });
    expect(delay).toBe(100);
  });

  it("grows exponentially per attempt, capped at maxDelayMs", () => {
    const at = (attempt: number) =>
      computeRetryDelayMs({ attempt, baseDelayMs: 100, maxDelayMs: 300, retryAfterHeader: null, random: () => 1 });

    expect(at(1)).toBe(100);
    expect(at(2)).toBe(200);
    expect(at(3)).toBe(300);
    expect(at(4)).toBe(300);
  });

  // Full jitter is what stops a wave of concurrent extraction retries from
  // re-forming the burst that rate-limited them in the first place.
  it("applies full jitter across the backoff window", () => {
    const low = computeRetryDelayMs({ attempt: 3, baseDelayMs: 100, maxDelayMs: 10_000, retryAfterHeader: null, random: () => 0 });
    const high = computeRetryDelayMs({ attempt: 3, baseDelayMs: 100, maxDelayMs: 10_000, retryAfterHeader: null, random: () => 1 });

    expect(low).toBe(0);
    expect(high).toBe(400);
  });
});
