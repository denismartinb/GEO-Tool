import { describe, expect, it } from "vitest";
import { brandLabel, isBrandDomain, isSameOrSubdomain, normalizeDomain } from "./brand-domain";

describe("normalizeDomain", () => {
  it("strips scheme, www and path", () => {
    expect(normalizeDomain("https://www.ikea.es/rooms/")).toBe("ikea.es");
    expect(normalizeDomain("  HTTP://IKEA.ES  ")).toBe("ikea.es");
  });

  it("leaves a bare host untouched", () => {
    expect(normalizeDomain("ikea.es")).toBe("ikea.es");
  });
});

describe("isSameOrSubdomain", () => {
  it("matches the same host and real subdomains", () => {
    expect(isSameOrSubdomain("ikea.es", "ikea.es")).toBe(true);
    expect(isSameOrSubdomain("blog.ikea.es", "ikea.es")).toBe(true);
  });

  it("does not match on a partial label", () => {
    expect(isSameOrSubdomain("notikea.es", "ikea.es")).toBe(false);
  });

  it("does not match across TLDs — that is isBrandDomain's job", () => {
    expect(isSameOrSubdomain("ikea.com", "ikea.es")).toBe(false);
  });

  it("is false for empty input", () => {
    expect(isSameOrSubdomain("", "ikea.es")).toBe(false);
    expect(isSameOrSubdomain("ikea.es", "")).toBe(false);
  });
});

describe("brandLabel", () => {
  it("reads the label before a single-level suffix", () => {
    expect(brandLabel("ikea.es")).toBe("ikea");
    expect(brandLabel("ikea.com")).toBe("ikea");
    expect(brandLabel("blog.ikea.es")).toBe("ikea");
    expect(brandLabel("es.homary.com")).toBe("homary");
  });

  it("reads the label before a two-level suffix", () => {
    expect(brandLabel("mercadolibre.com.co")).toBe("mercadolibre");
    expect(brandLabel("listado.mercadolibre.com.mx")).toBe("mercadolibre");
    expect(brandLabel("bbc.co.uk")).toBe("bbc");
  });

  it("returns empty for input without a registrable label", () => {
    expect(brandLabel("")).toBe("");
    expect(brandLabel("localhost")).toBe("");
    expect(brandLabel("com.mx")).toBe("");
  });
});

describe("isBrandDomain", () => {
  // The case the founder reported: a real ikea.com citation on an ikea.es
  // project was being counted as a third party, under-reporting
  // citation_score / authority / own_citation_share.
  it("matches the same brand across TLDs", () => {
    expect(isBrandDomain("ikea.com", "ikea.es")).toBe(true);
    expect(isBrandDomain("ikea.es", "ikea.com")).toBe(true);
    expect(isBrandDomain("ikea.com.mx", "ikea.es")).toBe(true);
  });

  it("still matches exact hosts and subdomains", () => {
    expect(isBrandDomain("ikea.es", "ikea.es")).toBe(true);
    expect(isBrandDomain("www.ikea.es", "ikea.es")).toBe(true);
    expect(isBrandDomain("blog.ikea.es", "ikea.es")).toBe(true);
    expect(isBrandDomain("es.ikea.com", "ikea.es")).toBe(true);
  });

  it("does not match a different brand", () => {
    expect(isBrandDomain("conforama.es", "ikea.es")).toBe(false);
    expect(isBrandDomain("leroymerlin.es", "ikea.es")).toBe(false);
    expect(isBrandDomain("notikea.com", "ikea.es")).toBe(false);
    expect(isBrandDomain("ikeahackers.net", "ikea.es")).toBe(false);
  });

  it("tolerates scheme, www and path on either side", () => {
    expect(isBrandDomain("https://www.ikea.com/es/es/", "ikea.es")).toBe(true);
  });

  it("is false for missing or unusable input", () => {
    expect(isBrandDomain(null, "ikea.es")).toBe(false);
    expect(isBrandDomain(undefined, "ikea.es")).toBe(false);
    expect(isBrandDomain("   ", "ikea.es")).toBe(false);
    expect(isBrandDomain("ikea.com", "")).toBe(false);
    expect(isBrandDomain("ikea.com", null)).toBe(false);
  });

  // Documented, accepted trade-off of the heuristic (founder decision
  // 2026-07-25): two unrelated owners of the same label on different TLDs
  // match. Pinned as a test so the behaviour is a known choice, not a
  // surprise regression later.
  it("accepts the known false-positive of same-label different-owner domains", () => {
    expect(isBrandDomain("sofas.com", "sofas.es")).toBe(true);
  });
});
