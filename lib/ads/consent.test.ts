import { describe, expect, it } from "vitest";
import { CONSENT_COOKIE, isAdCookieName, parseConsentCookie, serializeConsentCookie } from "@/lib/ads/consent";

describe("parseConsentCookie", () => {
  it("returns null when the visitor has not answered", () => {
    expect(parseConsentCookie("")).toBeNull();
    expect(parseConsentCookie("sb-access-token=abc; other=1")).toBeNull();
  });

  it("reads both answers of the current version", () => {
    expect(parseConsentCookie(`a=1; ${CONSENT_COOKIE}=v1%3Agranted`)).toBe("granted");
    expect(parseConsentCookie(`${CONSENT_COOKIE}=v1%3Adenied; a=1`)).toBe("denied");
  });

  it("treats an answer to an older banner version as no answer", () => {
    expect(parseConsentCookie(`${CONSENT_COOKIE}=v0%3Agranted`)).toBeNull();
    expect(parseConsentCookie(`${CONSENT_COOKIE}=granted`)).toBeNull();
  });

  it("round-trips through serializeConsentCookie", () => {
    const header = serializeConsentCookie("granted", true).split(";")[0];
    expect(parseConsentCookie(header)).toBe("granted");
  });
});

describe("serializeConsentCookie", () => {
  it("is site-wide, lax, bounded to 180 days and Secure on https", () => {
    const value = serializeConsentCookie("denied", true);
    expect(value).toContain("Path=/");
    expect(value).toContain("SameSite=Lax");
    expect(value).toContain(`Max-Age=${180 * 24 * 60 * 60}`);
    expect(value).toContain("Secure");
    expect(serializeConsentCookie("denied", false)).not.toContain("Secure");
  });
});

describe("isAdCookieName", () => {
  it("matches the first-party cookies the ad tags write", () => {
    for (const name of ["_gcl_au", "_gcl_aw", "_gac_UA-1", "li_fat_id", "li_sugr"]) {
      expect(isAdCookieName(name)).toBe(true);
    }
  });

  it("never matches the session or the consent cookie itself", () => {
    for (const name of [CONSENT_COOKIE, "sb-xyz-auth-token", "gs_active_project", "li_other"]) {
      expect(isAdCookieName(name)).toBe(false);
    }
  });
});

describe("parsePendingConversion", () => {
  it("only accepts a known conversion kind", async () => {
    const { parsePendingConversion } = await import("@/lib/ads/pending-conversion");
    expect(parsePendingConversion("gs_pending_conversion=sign_up")).toBe("sign_up");
    expect(parsePendingConversion("a=1; gs_pending_conversion=whatever")).toBeNull();
    expect(parsePendingConversion("")).toBeNull();
  });
});
