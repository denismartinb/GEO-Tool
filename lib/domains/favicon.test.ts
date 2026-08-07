import { describe, expect, it } from "vitest";
import { faviconImgProps, normalizeDomain, snapFaviconSize } from "./favicon";

describe("normalizeDomain", () => {
  it("strips www, case and surrounding space", () => {
    expect(normalizeDomain("  WWW.Ikea.ES ")).toBe("ikea.es");
    expect(normalizeDomain("ikea.es")).toBe("ikea.es");
  });

  it("is null for nothing usable", () => {
    expect(normalizeDomain(null)).toBeNull();
    expect(normalizeDomain(undefined)).toBeNull();
    expect(normalizeDomain("   ")).toBeNull();
  });
});

describe("snapFaviconSize", () => {
  it("rounds up to the next size the pipeline actually serves", () => {
    expect(snapFaviconSize(26)).toBe(32);
    expect(snapFaviconSize(38)).toBe(64);
    expect(snapFaviconSize(52)).toBe(64);
    expect(snapFaviconSize(76)).toBe(128);
    expect(snapFaviconSize(112)).toBe(128);
  });

  it("returns the exact size when it is already served", () => {
    expect(snapFaviconSize(64)).toBe(64);
    expect(snapFaviconSize(256)).toBe(256);
  });

  it("caps at 256 — nothing larger is served", () => {
    expect(snapFaviconSize(168)).toBe(256);
    expect(snapFaviconSize(1024)).toBe(256);
  });

  it("is defensive about nonsense input", () => {
    expect(snapFaviconSize(0)).toBe(16);
    expect(snapFaviconSize(-10)).toBe(16);
    expect(snapFaviconSize(Number.NaN)).toBe(16);
  });
});

describe("faviconImgProps", () => {
  it("covers 2x and 3x for the Domains hero, the worst offender at 56 CSS px", () => {
    // 56 -> 64, 112 -> 128, 168 -> 256. Before FAVICON-QUALITY-1 every density
    // got the same 64 px source and the browser upscaled it.
    expect(faviconImgProps("ikea.es", 56)?.srcSet).toBe(
      "/api/favicon?domain=ikea.es&sz=64 1x, " +
        "/api/favicon?domain=ikea.es&sz=128 2x, " +
        "/api/favicon?domain=ikea.es&sz=256 3x"
    );
  });

  it("collapses densities that snap to the same size", () => {
    // 38 -> 64, 76 -> 128, 114 -> 128: the 3x candidate would duplicate 2x.
    expect(faviconImgProps("ikea.es", 38)?.srcSet).toBe(
      "/api/favicon?domain=ikea.es&sz=64 1x, /api/favicon?domain=ikea.es&sz=128 2x"
    );
  });

  it("emits a single candidate once every density saturates at 256", () => {
    expect(faviconImgProps("ikea.es", 300)?.srcSet).toBe("/api/favicon?domain=ikea.es&sz=256 1x");
  });

  it("uses the 1x candidate as src so srcset-blind browsers are not oversized", () => {
    const props = faviconImgProps("ikea.es", 26);
    expect(props?.src).toBe("/api/favicon?domain=ikea.es&sz=32");
    expect(props?.srcSet?.startsWith(`${props.src} 1x`)).toBe(true);
  });

  it("normalizes the domain before it reaches the URL", () => {
    expect(faviconImgProps("  WWW.Ikea.ES ", 26)?.src).toBe("/api/favicon?domain=ikea.es&sz=32");
  });

  it("is null for a missing domain, so call sites keep their letter fallback", () => {
    expect(faviconImgProps(null, 26)).toBeNull();
    expect(faviconImgProps("  ", 26)).toBeNull();
  });

  it("serves our own icon locally, without asking anyone", () => {
    // The pilot captured genscore.es showing the generic globe inside our own
    // product: the service had never crawled it.
    expect(faviconImgProps("genscore.es", 56)).toEqual({ src: "/brand/genscore-tile.svg" });
    expect(faviconImgProps("www.genscore.es", 26)).toEqual({ src: "/brand/genscore-tile.svg" });
    expect(faviconImgProps("  GENSCORE.ES ", 38)).toEqual({ src: "/brand/genscore-tile.svg" });
  });

  it("does not mistake a domain that merely contains ours", () => {
    expect(faviconImgProps("notgenscore.es", 26)?.src).toContain("domain=notgenscore.es");
    expect(faviconImgProps("genscore.es.evil.com", 26)?.src).toContain("domain=genscore.es.evil.com");
  });
});
