import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPageSpeed } from "./pagespeed";

const FIELD = {
  loadingExperience: {
    metrics: {
      LARGEST_CONTENTFUL_PAINT_MS: { percentile: 3400 },
      INTERACTION_TO_NEXT_PAINT: { percentile: 180 },
      CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 2 }
    }
  }
};

describe("fetchPageSpeed (Salud SEO, log §281)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("calls nothing and returns undefined without PAGESPEED_API_KEY", async () => {
    vi.stubEnv("PAGESPEED_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchPageSpeed("https://acme.com/")).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("measures mobile and desktop in parallel", async () => {
    vi.stubEnv("PAGESPEED_API_KEY", "k-123");
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify(FIELD), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const now = new Date("2026-10-11T10:00:00Z");
    const report = await fetchPageSpeed("https://acme.com/", { now });
    expect(report).toEqual({
      measuredAt: now.toISOString(),
      mobile: { source: "field", lcpMs: 3400, inpMs: 180, cls: 0.02 },
      desktop: { source: "field", lcpMs: 3400, inpMs: 180, cls: 0.02 }
    });
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("strategy=mobile"))).toBe(true);
    expect(urls.some((u) => u.includes("strategy=desktop"))).toBe(true);
  });

  it("returns null when both fail, and never logs the key", async () => {
    vi.stubEnv("PAGESPEED_API_KEY", "secret-key");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("", { status: 429 })).mockRejectedValueOnce(new Error("boom secret-key")));
    await expect(fetchPageSpeed("https://acme.com/")).resolves.toBeNull();
    expect(JSON.stringify(warn.mock.calls)).not.toContain("secret-key");
  });

  it("keeps the device that answered", async () => {
    vi.stubEnv("PAGESPEED_API_KEY", "k");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) =>
        url.includes("strategy=mobile") ? new Response(JSON.stringify(FIELD), { status: 200 }) : new Response("", { status: 500 })
      )
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const report = await fetchPageSpeed("https://acme.com/");
    expect(report?.mobile?.lcpMs).toBe(3400);
    expect(report?.desktop).toBeNull();
  });
});
