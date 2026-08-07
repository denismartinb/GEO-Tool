import { afterEach, describe, expect, it, vi } from "vitest";

const fetchFavicon = vi.hoisted(() => vi.fn());

vi.mock("@/lib/domains/favicon-source", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/domains/favicon-source")>()),
  fetchFavicon
}));

import { GET } from "./route";

function call(query: string) {
  return GET(new Request(`https://genscore.es/api/favicon?${query}`));
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/favicon", () => {
  it("serves the icon with a long cache when there is a real one", async () => {
    fetchFavicon.mockResolvedValue({ kind: "icon", body: new Uint8Array([1, 2, 3]).buffer });

    const res = await call("domain=mahou.es&sz=64");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("s-maxage=604800");
  });

  it("answers 204 and NOT 404 when there is no icon", async () => {
    // Regression test for a real PILOT FAIL (2026-08-06): with 404 the pilot
    // flagged Domains as a broken screen because of alberdiderma.es, and the
    // browser console and Sentry would have followed. A domain without a
    // favicon is nobody's failure.
    fetchFavicon.mockResolvedValue({ kind: "generic" });

    const res = await call("domain=alberdiderma.es&sz=64");

    expect(res.status).toBe(204);
    expect(res.headers.get("cache-control")).toContain("s-maxage=86400");
  });

  it("caches a transient failure for a minute, not for a day", async () => {
    fetchFavicon.mockResolvedValue({ kind: "unavailable" });

    const res = await call("domain=mahou.es&sz=64");

    expect(res.status).toBe(204);
    expect(res.headers.get("cache-control")).toContain("s-maxage=60");
  });

  it("rejects a non-domain without spending a request", async () => {
    const res = await call(`domain=${encodeURIComponent("https://evil.com/x")}`);

    expect(res.status).toBe(204);
    expect(fetchFavicon).not.toHaveBeenCalled();
  });

  it("caches a malformed domain for a week — it cannot become valid", async () => {
    const res = await call("domain=nodot");

    expect(res.headers.get("cache-control")).toContain("s-maxage=604800");
    expect(fetchFavicon).not.toHaveBeenCalled();
  });

  it("normalizes www and case, and snaps the size to what is served", async () => {
    fetchFavicon.mockResolvedValue({ kind: "generic" });

    await call("domain=WWW.Mahou.ES&sz=100");

    expect(fetchFavicon).toHaveBeenCalledWith("mahou.es", 128);
  });

  it("falls back to 64 rather than 16 when the size is missing or junk", async () => {
    fetchFavicon.mockResolvedValue({ kind: "generic" });

    await call("domain=mahou.es");
    expect(fetchFavicon).toHaveBeenLastCalledWith("mahou.es", 64);

    await call("domain=mahou.es&sz=abc");
    expect(fetchFavicon).toHaveBeenLastCalledWith("mahou.es", 64);
  });

  it("handles a missing domain parameter", async () => {
    const res = await call("sz=64");

    expect(res.status).toBe(204);
    expect(fetchFavicon).not.toHaveBeenCalled();
  });
});
