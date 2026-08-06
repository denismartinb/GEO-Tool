import { describe, expect, it } from "vitest";
import { faviconImgProps, faviconSrcSet, faviconUrl, snapFaviconSize } from "./favicon";

describe("snapFaviconSize", () => {
  it("rounds up to the next size the service actually serves", () => {
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

  it("caps at 256 — S2 serves nothing larger", () => {
    expect(snapFaviconSize(168)).toBe(256);
    expect(snapFaviconSize(1024)).toBe(256);
  });

  it("is defensive about nonsense input", () => {
    expect(snapFaviconSize(0)).toBe(16);
    expect(snapFaviconSize(-10)).toBe(16);
    expect(snapFaviconSize(Number.NaN)).toBe(16);
  });
});

describe("faviconUrl", () => {
  it("normalizes the domain and snaps the requested size", () => {
    expect(faviconUrl("  WWW.Ikea.ES ", 38)).toBe(
      "https://www.google.com/s2/favicons?domain=ikea.es&sz=64"
    );
  });

  it("defaults to 64 to preserve the pre-FAVICON-QUALITY-1 behaviour", () => {
    expect(faviconUrl("ikea.es")).toBe(
      "https://www.google.com/s2/favicons?domain=ikea.es&sz=64"
    );
  });

  it("is null for a missing or empty domain", () => {
    expect(faviconUrl(null)).toBeNull();
    expect(faviconUrl(undefined)).toBeNull();
    expect(faviconUrl("   ")).toBeNull();
  });
});

describe("faviconSrcSet", () => {
  it("covers 2x and 3x for the Domains hero, the worst offender at 56 CSS px", () => {
    // 56 -> 64, 112 -> 128, 168 -> 256. Before this change every density got 64.
    expect(faviconSrcSet("ikea.es", 56)).toBe(
      "https://www.google.com/s2/favicons?domain=ikea.es&sz=64 1x, " +
        "https://www.google.com/s2/favicons?domain=ikea.es&sz=128 2x, " +
        "https://www.google.com/s2/favicons?domain=ikea.es&sz=256 3x"
    );
  });

  it("collapses densities that snap to the same size", () => {
    // 38 -> 64, 76 -> 128, 114 -> 128. The 3x candidate would duplicate 2x.
    expect(faviconSrcSet("ikea.es", 38)).toBe(
      "https://www.google.com/s2/favicons?domain=ikea.es&sz=64 1x, " +
        "https://www.google.com/s2/favicons?domain=ikea.es&sz=128 2x"
    );
  });

  it("emits a single candidate once every density saturates at 256", () => {
    expect(faviconSrcSet("ikea.es", 300)).toBe(
      "https://www.google.com/s2/favicons?domain=ikea.es&sz=256 1x"
    );
  });

  it("is null for a missing domain", () => {
    expect(faviconSrcSet(null, 26)).toBeNull();
    expect(faviconSrcSet("  ", 26)).toBeNull();
  });
});

describe("faviconImgProps", () => {
  it("uses the 1x candidate as src so srcset-blind browsers are not oversized", () => {
    const props = faviconImgProps("ikea.es", 26);
    expect(props?.src).toBe("https://www.google.com/s2/favicons?domain=ikea.es&sz=32");
    expect(props?.srcSet.startsWith(`${props.src} 1x`)).toBe(true);
  });

  it("is null for a missing domain so call sites keep their letter fallback", () => {
    expect(faviconImgProps(null, 26)).toBeNull();
  });
});
