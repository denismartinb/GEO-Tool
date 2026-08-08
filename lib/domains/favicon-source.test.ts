import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchFavicon, isPlausibleDomain, resetPlaceholderCache } from "./favicon-source";

/** Two distinguishable icon bodies. Content is irrelevant — only whether the
 *  hash matches the sentinel's. */
const PLACEHOLDER = new Uint8Array([1, 2, 3, 4]).buffer;
const REAL_ICON = new Uint8Array([9, 9, 9, 9]).buffer;

function res(body: ArrayBuffer, ok = true) {
  return {
    ok,
    headers: { get: () => null },
    arrayBuffer: async () => body
  } as unknown as Response;
}

/** Routes by the `domain` query parameter, which is what separates a sentinel
 *  calibration call from a real one. */
function mockFetch(byDomain: (domain: string) => Response) {
  return vi.fn((url: string | URL) =>
    Promise.resolve(byDomain(new URL(String(url)).searchParams.get("domain") ?? ""))
  );
}

const isSentinel = (domain: string) => domain.endsWith(".invalid");

beforeEach(() => {
  resetPlaceholderCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("fetchFavicon", () => {
  it("recognises the placeholder by comparing against the sentinel", () => {
    // No hash is embedded anywhere: `.invalid` cannot resolve, so whatever the
    // service returns for it IS the placeholder, today's drawing or tomorrow's.
    vi.stubGlobal("fetch", mockFetch(() => res(PLACEHOLDER)));
    return expect(fetchFavicon("alberdiderma.es", 64)).resolves.toEqual({ kind: "generic" });
  });

  it("passes through an icon that does not match the placeholder", async () => {
    vi.stubGlobal("fetch", mockFetch((d) => res(isSentinel(d) ? PLACEHOLDER : REAL_ICON)));
    await expect(fetchFavicon("mahou.es", 64)).resolves.toEqual({ kind: "icon", body: REAL_ICON });
  });

  it("fails open: with no calibration it serves the icon rather than hide it", async () => {
    // Hiding a competitor's real brand mark is lost information; one globe too
    // many is merely ugly.
    vi.stubGlobal("fetch", mockFetch((d) => res(REAL_ICON, !isSentinel(d))));
    await expect(fetchFavicon("mahou.es", 64)).resolves.toEqual({ kind: "icon", body: REAL_ICON });
  });

  it("does not cache a failed calibration: it retries on the next request", async () => {
    // Caching the failure would leave the instance permanently and silently
    // fail-open for that size — one second of trouble, and every globe is
    // served as a brand for as long as the function stays warm.
    let sentinelWorks = false;
    vi.stubGlobal(
      "fetch",
      mockFetch((d) => {
        if (!isSentinel(d)) return res(PLACEHOLDER);
        return sentinelWorks ? res(PLACEHOLDER) : res(new ArrayBuffer(0), false);
      })
    );

    expect((await fetchFavicon("alberdiderma.es", 64)).kind).toBe("icon");
    sentinelWorks = true;
    expect((await fetchFavicon("alberdiderma.es", 64)).kind).toBe("generic");
  });

  it("is 'unavailable' when the icon itself cannot be fetched", async () => {
    vi.stubGlobal("fetch", mockFetch((d) => res(PLACEHOLDER, isSentinel(d))));
    await expect(fetchFavicon("mahou.es", 64)).resolves.toEqual({ kind: "unavailable" });
  });

  it("treats an empty body as unavailable, not as an icon", async () => {
    vi.stubGlobal("fetch", mockFetch(() => res(new ArrayBuffer(0))));
    await expect(fetchFavicon("mahou.es", 64)).resolves.toEqual({ kind: "unavailable" });
  });

  it("shares one calibration across concurrent requests", async () => {
    const fetchMock = mockFetch((d) => res(isSentinel(d) ? PLACEHOLDER : REAL_ICON));
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([
      fetchFavicon("a.es", 64),
      fetchFavicon("b.es", 64),
      fetchFavicon("c.es", 64)
    ]);

    const calibrations = fetchMock.mock.calls.filter(([url]) => String(url).includes(".invalid"));
    expect(calibrations).toHaveLength(1);
  });

  it("calibrates per size — the placeholder is not the same drawing at 32 and 256", async () => {
    const fetchMock = mockFetch((d) => res(isSentinel(d) ? PLACEHOLDER : REAL_ICON));
    vi.stubGlobal("fetch", fetchMock);

    await fetchFavicon("a.es", 32);
    await fetchFavicon("a.es", 256);

    const calibrations = fetchMock.mock.calls.filter(([url]) => String(url).includes(".invalid"));
    expect(calibrations).toHaveLength(2);
  });

  it("survives the network going away entirely", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("ECONNREFUSED"))));
    await expect(fetchFavicon("mahou.es", 64)).resolves.toEqual({ kind: "unavailable" });
  });

  it("only ever talks to the fixed icon service", async () => {
    // The domain is user-supplied. It must never decide where the request goes.
    const fetchMock = mockFetch(() => res(REAL_ICON));
    vi.stubGlobal("fetch", fetchMock);

    await fetchFavicon("evil.com", 64);

    for (const [url] of fetchMock.mock.calls) {
      expect(new URL(String(url)).origin).toBe("https://www.google.com");
    }
  });
});

describe("isPlausibleDomain", () => {
  it("accepts ordinary domains", () => {
    expect(isPlausibleDomain("mahou.es")).toBe(true);
    expect(isPlausibleDomain("sub.dominio.co.uk")).toBe(true);
    expect(isPlausibleDomain("xn--maho-0ra.es")).toBe(true);
  });

  it("rejects anything that is not domain-shaped", () => {
    expect(isPlausibleDomain("")).toBe(false);
    expect(isPlausibleDomain("nodot")).toBe(false);
    expect(isPlausibleDomain("https://mahou.es")).toBe(false);
    expect(isPlausibleDomain("mahou.es/path")).toBe(false);
    expect(isPlausibleDomain("mahou .es")).toBe(false);
    expect(isPlausibleDomain("-mahou.es")).toBe(false);
    expect(isPlausibleDomain("mahou.es@evil.com")).toBe(false);
    expect(isPlausibleDomain("mahou.es:8080")).toBe(false);
    expect(isPlausibleDomain(`${"a".repeat(254)}.es`)).toBe(false);
  });
});
