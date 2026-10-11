import { describe, expect, it } from "vitest";
import { buildAffiliateShareUrl, normalizeCampaign, summarizeAffiliateCodes } from "@/lib/admin/affiliates";

describe("buildAffiliateShareUrl", () => {
  it("puts ref first, tags the source and medium, and keeps the home path as /", () => {
    expect(buildAffiliateShareUrl({ siteUrl: "https://www.genscore.es/", code: "campamentoweb", path: "/" })).toBe(
      "https://www.genscore.es/?ref=campamentoweb&utm_source=campamentoweb&utm_medium=afiliado"
    );
  });

  it("adds a normalized campaign only when one is given", () => {
    expect(
      buildAffiliateShareUrl({ siteUrl: "https://www.genscore.es", code: "newsletter-seo", path: "/precios", campaign: "Octubre LinkedIn" })
    ).toBe("https://www.genscore.es/precios?ref=newsletter-seo&utm_source=newsletter-seo&utm_medium=afiliado&utm_campaign=octubre-linkedin");
    expect(buildAffiliateShareUrl({ siteUrl: "https://x.es", code: "ab", path: "precios", campaign: "  " })).toBe(
      "https://x.es/precios?ref=ab&utm_source=ab&utm_medium=afiliado"
    );
  });
});

describe("normalizeCampaign", () => {
  it("slugs accents and spaces and drops empty input", () => {
    expect(normalizeCampaign("Promoción Otoño!")).toBe("promocion-otono");
    expect(normalizeCampaign("---")).toBeNull();
    expect(normalizeCampaign(undefined)).toBeNull();
  });
});

describe("summarizeAffiliateCodes", () => {
  it("lists every active code, even with no accounts, and counts sign-ups and paid ones", () => {
    const rows = summarizeAffiliateCodes("campamentoweb, newsletter-seo, MAL CODIGO", [
      { referralCode: "newsletter-seo", paid: true },
      { referralCode: "newsletter-seo", paid: false },
      { referralCode: null, paid: true },
      { referralCode: 42, paid: false }
    ]);
    expect(rows).toEqual([
      { code: "newsletter-seo", active: true, signups: 2, paid: 1 },
      { code: "campamentoweb", active: true, signups: 0, paid: 0 }
    ]);
  });

  it("keeps a retired code that still has accounts, after the active ones", () => {
    const rows = summarizeAffiliateCodes("campamentoweb", [{ referralCode: "antiguo", paid: true }]);
    expect(rows).toEqual([
      { code: "campamentoweb", active: true, signups: 0, paid: 0 },
      { code: "antiguo", active: false, signups: 1, paid: 1 }
    ]);
  });

  it("returns nothing when the env is empty and no account carries a code", () => {
    expect(summarizeAffiliateCodes(undefined, [{ referralCode: undefined, paid: false }])).toEqual([]);
  });
});
