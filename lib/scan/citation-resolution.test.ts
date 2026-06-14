import { afterEach, describe, expect, it, vi } from "vitest";
import {
  REDIRECT_RESOLUTION_TIMEOUT_MS,
  resolveGroundingRedirect,
  resolveGroundingRedirects
} from "./citation-resolution";

const GROUNDING_URI = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc123";

describe("resolveGroundingRedirect", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves to the final destination URL via HEAD", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      url: "https://www.movistar.es/fibra-y-movil/"
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveGroundingRedirect(GROUNDING_URI);

    expect(result).toEqual({ resolvedUrl: "https://www.movistar.es/fibra-y-movil/" });
    expect(fetchMock).toHaveBeenCalledWith(
      GROUNDING_URI,
      expect.objectContaining({ method: "HEAD", redirect: "follow" })
    );
    // Only HEAD needed — GET should not be attempted.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to GET when HEAD throws (e.g. 405/403 from redirect target)", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("HEAD not allowed"))
      .mockResolvedValueOnce({ url: "https://www.movistar.es/fibra-y-movil/" });
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveGroundingRedirect(GROUNDING_URI);

    expect(result).toEqual({ resolvedUrl: "https://www.movistar.es/fibra-y-movil/" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "HEAD" });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "GET" });
  });

  it("falls back to GET when HEAD does not redirect anywhere useful", async () => {
    const fetchMock = vi
      .fn()
      // HEAD "succeeds" but the response URL is still the Google redirect host.
      .mockResolvedValueOnce({ url: GROUNDING_URI })
      .mockResolvedValueOnce({ url: "https://www.movistar.es/fibra-y-movil/" });
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveGroundingRedirect(GROUNDING_URI);

    expect(result).toEqual({ resolvedUrl: "https://www.movistar.es/fibra-y-movil/" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns resolvedUrl: null when both HEAD and GET fail", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network error"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveGroundingRedirect(GROUNDING_URI);

    expect(result).toEqual({ resolvedUrl: null });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns resolvedUrl: null on timeout (AbortError)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new DOMException("The operation was aborted.", "AbortError"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveGroundingRedirect(GROUNDING_URI);

    expect(result).toEqual({ resolvedUrl: null });
  });

  it("returns resolvedUrl: null when neither HEAD nor GET escape the Google redirect host", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ url: GROUNDING_URI });
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveGroundingRedirect(GROUNDING_URI);

    expect(result).toEqual({ resolvedUrl: null });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("passes a bounded AbortSignal timeout", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ url: "https://www.movistar.es/fibra-y-movil/" });
    vi.stubGlobal("fetch", fetchMock);
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");

    await resolveGroundingRedirect(GROUNDING_URI);

    expect(timeoutSpy).toHaveBeenCalledWith(REDIRECT_RESOLUTION_TIMEOUT_MS);
    timeoutSpy.mockRestore();
  });
});

describe("resolveGroundingRedirects", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves multiple URIs in parallel and maps results back to their original URI", async () => {
    const fetchMock = vi.fn((uri: string) => {
      if (uri.includes("abc123")) {
        return Promise.resolve({ url: "https://www.movistar.es/fibra-y-movil/" });
      }
      if (uri.includes("def456")) {
        return Promise.resolve({ url: "https://www.example.com/page" });
      }
      return Promise.reject(new Error("unexpected uri"));
    });
    vi.stubGlobal("fetch", fetchMock);

    const uriA = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc123";
    const uriB = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/def456";

    const map = await resolveGroundingRedirects([uriA, uriB]);

    expect(map.get(uriA)).toEqual({ resolvedUrl: "https://www.movistar.es/fibra-y-movil/" });
    expect(map.get(uriB)).toEqual({ resolvedUrl: "https://www.example.com/page" });
  });

  it("deduplicates identical URIs before resolving", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ url: "https://www.movistar.es/fibra-y-movil/" });
    vi.stubGlobal("fetch", fetchMock);

    const map = await resolveGroundingRedirects([GROUNDING_URI, GROUNDING_URI]);

    expect(map.get(GROUNDING_URI)).toEqual({ resolvedUrl: "https://www.movistar.es/fibra-y-movil/" });
    // Only one HEAD call for the deduplicated URI.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("isolates a failing resolution from successful ones (Promise.allSettled)", async () => {
    const fetchMock = vi.fn((uri: string) => {
      if (uri.includes("fails")) {
        return Promise.reject(new Error("network error"));
      }
      return Promise.resolve({ url: "https://www.movistar.es/fibra-y-movil/" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const okUri = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/ok";
    const failUri = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/fails";

    const map = await resolveGroundingRedirects([okUri, failUri]);

    expect(map.get(okUri)).toEqual({ resolvedUrl: "https://www.movistar.es/fibra-y-movil/" });
    expect(map.get(failUri)).toEqual({ resolvedUrl: null });
  });

  it("returns an empty map for an empty input array", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const map = await resolveGroundingRedirects([]);

    expect(map.size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
