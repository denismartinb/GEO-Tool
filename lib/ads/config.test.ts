import { describe, expect, it } from "vitest";
import { ADS_EXCLUDED_PATH, adsEnabled, readAdsConfig } from "@/lib/ads/config";

describe("readAdsConfig", () => {
  it("is dormant when nothing is configured", () => {
    const config = readAdsConfig({});
    expect(adsEnabled(config)).toBe(false);
    expect(config.googleAdsId).toBeNull();
    expect(config.linkedinPartnerId).toBeNull();
  });

  it("accepts well-formed ids and trims labels", () => {
    const config = readAdsConfig({
      NEXT_PUBLIC_GOOGLE_ADS_ID: " AW-123456789 ",
      NEXT_PUBLIC_GOOGLE_ADS_LABEL_SIGN_UP: " abcDEF ",
      NEXT_PUBLIC_LINKEDIN_PARTNER_ID: "987654"
    });
    expect(adsEnabled(config)).toBe(true);
    expect(config.googleAdsId).toBe("AW-123456789");
    expect(config.googleLabels.sign_up).toBe("abcDEF");
    expect(config.googleLabels.purchase).toBeNull();
    expect(config.linkedinPartnerId).toBe("987654");
  });

  it("rejects malformed ids instead of loading a tag for nothing", () => {
    const config = readAdsConfig({
      NEXT_PUBLIC_GOOGLE_ADS_ID: "G-ABC123",
      NEXT_PUBLIC_LINKEDIN_PARTNER_ID: "abc"
    });
    expect(adsEnabled(config)).toBe(false);
  });
});

describe("ADS_EXCLUDED_PATH", () => {
  it("excludes operator and security screens only", () => {
    expect(ADS_EXCLUDED_PATH.test("/admin")).toBe(true);
    expect(ADS_EXCLUDED_PATH.test("/admin/users")).toBe(true);
    expect(ADS_EXCLUDED_PATH.test("/mfa")).toBe(true);
    expect(ADS_EXCLUDED_PATH.test("/debug")).toBe(true);
    expect(ADS_EXCLUDED_PATH.test("/")).toBe(false);
    expect(ADS_EXCLUDED_PATH.test("/gratis/aparece-mi-marca-en-chatgpt")).toBe(false);
    expect(ADS_EXCLUDED_PATH.test("/administracion-de-fincas")).toBe(false);
  });
});
