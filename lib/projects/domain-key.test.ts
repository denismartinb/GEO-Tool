import { describe, expect, it } from "vitest";
import { firstScanDomainKey } from "./domain-key";

describe("firstScanDomainKey — URL variants must not mint a new first-scan exemption", () => {
  const same = [
    "example.com",
    "EXAMPLE.COM",
    "  example.com  ",
    "www.example.com",
    "http://example.com",
    "https://www.example.com/",
    "https://example.com/precios/planes?utm_source=x#top",
    "example.com:443",
    "https://example.com:8443/path",
    "example.com.",
    "https://user:pass@example.com/",
    "HTTPS://Example.Com./Docs"
  ];

  it.each(same)("%s → example.com", (variant) => {
    expect(firstScanDomainKey(variant)).toBe("example.com");
  });

  it("folds an internationalised domain and its punycode form into one key", () => {
    expect(firstScanDomainKey("bücher.de")).toBe("xn--bcher-kva.de");
    expect(firstScanDomainKey("xn--bcher-kva.de")).toBe("xn--bcher-kva.de");
    expect(firstScanDomainKey("https://www.BÜCHER.de/")).toBe(firstScanDomainKey("xn--bcher-kva.de"));
  });

  it("keeps subdomains DISTINCT (open proposal: merging needs a public-suffix list)", () => {
    expect(firstScanDomainKey("blog.example.com")).toBe("blog.example.com");
    expect(firstScanDomainKey("blog.example.com")).not.toBe(firstScanDomainKey("example.com"));
    // 'www.' is the one prefix treated as the same site, as the product already does.
    expect(firstScanDomainKey("www.blog.example.com")).toBe("www.blog.example.com".replace(/^www\./, ""));
  });

  it("has no notion of country or language: they live on the project, not on the domain", () => {
    // The function takes a domain only; the same domain for ES and MX is, by construction, one key.
    expect(firstScanDomainKey("example.com")).toBe(firstScanDomainKey("https://example.com/es-mx/"));
  });

  it("returns null for anything that is not a plausible domain, so nothing can claim an exemption with junk", () => {
    for (const junk of ["", "   ", "localhost", "not a domain", "http://", "a..b", "-bad.com", "exa mple.com", "1.2", "//", "192.168.0.1", "http://[::1]/", "999.999.999.999"]) {
      expect(firstScanDomainKey(junk), JSON.stringify(junk)).toBeNull();
    }
  });
});
