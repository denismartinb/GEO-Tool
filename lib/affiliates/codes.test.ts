import { describe, expect, it } from "vitest";
import {
  AFFILIATE_REF_COOKIE_MAX_AGE_S,
  normalizeAffiliateCode,
  parseAffiliateCodes,
  readRefCookie,
  referralCodeForNewAccount,
  resolveAffiliateCode
} from "@/lib/affiliates/codes";
import { exampleMonthlyCommissionEur, formatCommissionRate } from "@/lib/affiliates/terms";

const ENV = "campamentoweb, Newsletter-SEO ,no valid!,x";

describe("affiliate codes", () => {
  it("accepts lowercase letters, digits and hyphens, 2–40 chars", () => {
    expect(normalizeAffiliateCode("campamentoweb")).toBe("campamentoweb");
    expect(normalizeAffiliateCode("  Newsletter-SEO ")).toBe("newsletter-seo");
    expect(normalizeAffiliateCode("a")).toBeNull();
    expect(normalizeAffiliateCode("a".repeat(41))).toBeNull();
    expect(normalizeAffiliateCode("con espacio")).toBeNull();
    expect(normalizeAffiliateCode("<script>")).toBeNull();
    expect(normalizeAffiliateCode(null)).toBeNull();
  });

  it("parses AFFILIATE_CODES and drops malformed entries", () => {
    expect([...parseAffiliateCodes(ENV)]).toEqual(["campamentoweb", "newsletter-seo"]);
    expect(parseAffiliateCodes(undefined).size).toBe(0);
  });

  it("resolves only approved codes; with no env nothing is valid", () => {
    expect(resolveAffiliateCode("CampamentoWeb", ENV)).toBe("campamentoweb");
    expect(resolveAffiliateCode("otro", ENV)).toBeNull();
    expect(resolveAffiliateCode("campamentoweb", undefined)).toBeNull();
    expect(resolveAffiliateCode("campamentoweb", "")).toBeNull();
  });

  it("reads gs_ref from a cookie header", () => {
    expect(readRefCookie("a=1; gs_ref=campamentoweb; b=2")).toBe("campamentoweb");
    expect(readRefCookie("gs_ref=%3Cx%3E")).toBeNull();
    expect(readRefCookie("other=1")).toBeNull();
    expect(readRefCookie(null)).toBeNull();
  });

  it("never overwrites an existing attribution", () => {
    expect(referralCodeForNewAccount({ cookieCode: "campamentoweb", existing: undefined, envValue: ENV })).toBe("campamentoweb");
    expect(referralCodeForNewAccount({ cookieCode: "campamentoweb", existing: "newsletter-seo", envValue: ENV })).toBeNull();
    expect(referralCodeForNewAccount({ cookieCode: "desconocido", existing: null, envValue: ENV })).toBeNull();
  });

  it("keeps the cookie 90 days", () => {
    expect(AFFILIATE_REF_COOKIE_MAX_AGE_S).toBe(90 * 24 * 60 * 60);
  });
});

describe("affiliate terms", () => {
  it("computes the page's example from the gross price: 69 € with VAT → about 17 €", () => {
    expect(exampleMonthlyCommissionEur(69)).toBe(17);
    expect(formatCommissionRate()).toBe("30 %");
  });
});
