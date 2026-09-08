import { afterEach, describe, expect, it, vi } from "vitest";

const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: lookupMock }));

import {
  REDIRECT_RESOLUTION_TIMEOUT_MS,
  resolveGroundingRedirect,
  resolveGroundingRedirects
} from "./citation-resolution";

const GROUNDING_URI = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc123";

/** A bare-bones fetch Response stub: a non-redirect status with no body reads. */
function finalResponse(status = 200): Response {
  return { status, headers: new Headers() } as Response;
}

/** A 3xx redirect stub carrying a Location header. */
function redirectResponse(location: string, status = 302): Response {
  return { status, headers: new Headers({ location }) } as Response;
}

describe("resolveGroundingRedirect", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    lookupMock.mockReset();
  });

  it("resolves to the final destination URL via HEAD, verifying the destination host first", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse("https://www.movistar.es/fibra-y-movil/"))
      .mockResolvedValueOnce(finalResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveGroundingRedirect(GROUNDING_URI);

    expect(result).toEqual({ resolvedUrl: "https://www.movistar.es/fibra-y-movil/" });
    expect(lookupMock).toHaveBeenCalledWith("vertexaisearch.cloud.google.com", expect.anything());
    expect(lookupMock).toHaveBeenCalledWith("www.movistar.es", expect.anything());
    // Only HEAD needed — GET should not be attempted.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every((call) => call[1].method === "HEAD")).toBe(true);
    expect(fetchMock.mock.calls.every((call) => call[1].redirect === "manual")).toBe(true);
  });

  it("never follows a redirect without re-verifying the new host first (never redirect: follow)", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetchMock = vi.fn().mockResolvedValue(finalResponse());
    vi.stubGlobal("fetch", fetchMock);

    await resolveGroundingRedirect(GROUNDING_URI);

    expect(fetchMock.mock.calls.every((call) => call[1].redirect === "manual")).toBe(true);
  });

  it("rejects a redirect hop that resolves to a private/reserved IP (SSRF)", async () => {
    // Every host is a safe public IP EXCEPT the redirect target itself, so
    // both the HEAD and the GET attempt's initial (google-host) hop pass and
    // only the trap hop is rejected.
    lookupMock.mockImplementation((hostname: string) =>
      hostname === "sneaky.internal"
        ? Promise.resolve([{ address: "169.254.169.254", family: 4 }]) // cloud metadata address
        : Promise.resolve([{ address: "93.184.216.34", family: 4 }])
    );
    const fetchMock = vi.fn().mockResolvedValue(redirectResponse("https://sneaky.internal/steal"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveGroundingRedirect(GROUNDING_URI);

    expect(result).toEqual({ resolvedUrl: null });
    // Never connects to the unsafe host — only the redirect hop that named it.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects an IP-literal redirect target outright, without a DNS lookup", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetchMock = vi.fn().mockResolvedValue(redirectResponse("https://203.0.113.5/page"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveGroundingRedirect(GROUNDING_URI);

    expect(result).toEqual({ resolvedUrl: null });
    expect(lookupMock).not.toHaveBeenCalledWith("203.0.113.5", expect.anything());
  });

  it("rejects a non-https redirect target", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetchMock = vi.fn().mockResolvedValue(redirectResponse("http://www.movistar.es/plain"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveGroundingRedirect(GROUNDING_URI);

    expect(result).toEqual({ resolvedUrl: null });
  });

  it("follows multiple redirect hops, verifying each host before connecting", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse("https://hop-one.example/next"))
      .mockResolvedValueOnce(redirectResponse("https://www.movistar.es/fibra-y-movil/"))
      .mockResolvedValueOnce(finalResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveGroundingRedirect(GROUNDING_URI);

    expect(result).toEqual({ resolvedUrl: "https://www.movistar.es/fibra-y-movil/" });
    expect(lookupMock).toHaveBeenCalledWith("hop-one.example", expect.anything());
    expect(lookupMock).toHaveBeenCalledWith("www.movistar.es", expect.anything());
  });

  it("gives up after exceeding the redirect budget", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetchMock = vi.fn().mockResolvedValue(redirectResponse("https://loops.example/again"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveGroundingRedirect(GROUNDING_URI);

    expect(result).toEqual({ resolvedUrl: null });
  });

  it("treats a redirect status with no Location header as the final (non-useful) response", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetchMock = vi.fn().mockResolvedValue({ status: 302, headers: new Headers() } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveGroundingRedirect(GROUNDING_URI);

    // Never left the Google host, so this is a non-useful resolution.
    expect(result).toEqual({ resolvedUrl: null });
  });

  it("falls back to GET when HEAD throws (e.g. 405/403 from redirect target)", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("HEAD not allowed"))
      .mockResolvedValueOnce(redirectResponse("https://www.movistar.es/fibra-y-movil/"))
      .mockResolvedValueOnce(finalResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveGroundingRedirect(GROUNDING_URI);

    expect(result).toEqual({ resolvedUrl: "https://www.movistar.es/fibra-y-movil/" });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "HEAD" });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "GET" });
  });

  it("falls back to GET when HEAD does not redirect anywhere useful", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetchMock = vi
      .fn()
      // HEAD "succeeds" but never leaves the Google redirect host.
      .mockResolvedValueOnce(finalResponse())
      .mockResolvedValueOnce(redirectResponse("https://www.movistar.es/fibra-y-movil/"))
      .mockResolvedValueOnce(finalResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveGroundingRedirect(GROUNDING_URI);

    expect(result).toEqual({ resolvedUrl: "https://www.movistar.es/fibra-y-movil/" });
  });

  it("returns resolvedUrl: null when both HEAD and GET fail", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetchMock = vi.fn().mockRejectedValue(new Error("network error"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveGroundingRedirect(GROUNDING_URI);

    expect(result).toEqual({ resolvedUrl: null });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns resolvedUrl: null on timeout (AbortError)", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetchMock = vi.fn().mockRejectedValue(new DOMException("The operation was aborted.", "AbortError"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveGroundingRedirect(GROUNDING_URI);

    expect(result).toEqual({ resolvedUrl: null });
  });

  it("returns resolvedUrl: null when neither HEAD nor GET escape the Google redirect host", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetchMock = vi.fn().mockResolvedValue(finalResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveGroundingRedirect(GROUNDING_URI);

    expect(result).toEqual({ resolvedUrl: null });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails closed when DNS resolution of the destination host errors", async () => {
    lookupMock
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }]) // google host
      .mockRejectedValue(new Error("ENOTFOUND")); // destination host
    const fetchMock = vi.fn().mockResolvedValue(redirectResponse("https://www.movistar.es/fibra-y-movil/"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveGroundingRedirect(GROUNDING_URI);

    expect(result).toEqual({ resolvedUrl: null });
  });

  it("passes a bounded AbortSignal timeout derived from the shared deadline", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetchMock = vi.fn().mockResolvedValue(finalResponse());
    vi.stubGlobal("fetch", fetchMock);
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");

    await resolveGroundingRedirect(GROUNDING_URI);

    expect(timeoutSpy).toHaveBeenCalled();
    const firstCallArg = timeoutSpy.mock.calls[0][0];
    expect(firstCallArg).toBeGreaterThan(0);
    expect(firstCallArg).toBeLessThanOrEqual(REDIRECT_RESOLUTION_TIMEOUT_MS);
    timeoutSpy.mockRestore();
  });
});

describe("resolveGroundingRedirects", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    lookupMock.mockReset();
  });

  it("resolves multiple URIs in parallel and maps results back to their original URI", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetchMock = vi.fn((uri: string) => {
      if (uri.includes("abc123")) return Promise.resolve(redirectResponse("https://www.movistar.es/fibra-y-movil/"));
      if (uri.includes("www.movistar.es")) return Promise.resolve(finalResponse());
      if (uri.includes("def456")) return Promise.resolve(redirectResponse("https://www.example.com/page"));
      if (uri.includes("www.example.com")) return Promise.resolve(finalResponse());
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
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse("https://www.movistar.es/fibra-y-movil/"))
      .mockResolvedValueOnce(finalResponse());
    vi.stubGlobal("fetch", fetchMock);

    const map = await resolveGroundingRedirects([GROUNDING_URI, GROUNDING_URI]);

    expect(map.get(GROUNDING_URI)).toEqual({ resolvedUrl: "https://www.movistar.es/fibra-y-movil/" });
    // Only one HEAD resolution (2 fetch calls: redirect hop + final) for the deduplicated URI.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("isolates a failing resolution from successful ones (Promise.allSettled)", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetchMock = vi.fn((uri: string) => {
      if (uri.includes("fails")) return Promise.reject(new Error("network error"));
      if (uri.includes("ok")) return Promise.resolve(redirectResponse("https://www.movistar.es/fibra-y-movil/"));
      return Promise.resolve(finalResponse());
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
