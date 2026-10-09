import { describe, expect, it } from "vitest";
import {
  CONSENT_ALL,
  CONSENT_COOKIE,
  CONSENT_NONE,
  isAdCookieName,
  isWithdrawal,
  parseConsentCookie,
  serializeConsentCookie
} from "@/lib/ads/consent";

describe("parseConsentCookie", () => {
  it("returns null when the visitor has not answered", () => {
    expect(parseConsentCookie("")).toBeNull();
    expect(parseConsentCookie("sb-access-token=abc; other=1")).toBeNull();
  });

  it("reads each purpose of the current version separately", () => {
    expect(parseConsentCookie(`a=1; ${CONSENT_COOKIE}=v2%3Am1r0`)).toEqual({ measurement: true, remarketing: false });
    expect(parseConsentCookie(`${CONSENT_COOKIE}=v2%3Am0r1; a=1`)).toEqual({ measurement: false, remarketing: true });
    expect(parseConsentCookie(`${CONSENT_COOKIE}=v2%3Am0r0`)).toEqual(CONSENT_NONE);
  });

  it("treats an answer to an older banner version as no answer", () => {
    expect(parseConsentCookie(`${CONSENT_COOKIE}=v1%3Agranted`)).toBeNull();
    expect(parseConsentCookie(`${CONSENT_COOKIE}=granted`)).toBeNull();
    expect(parseConsentCookie(`${CONSENT_COOKIE}=v2%3Am1`)).toBeNull();
  });

  it("round-trips through serializeConsentCookie", () => {
    for (const state of [CONSENT_ALL, CONSENT_NONE, { measurement: true, remarketing: false }]) {
      const header = serializeConsentCookie(state, true).split(";")[0];
      expect(parseConsentCookie(header)).toEqual(state);
    }
  });
});

describe("isWithdrawal", () => {
  it("is true only when a purpose that was granted is now refused", () => {
    expect(isWithdrawal(null, CONSENT_NONE)).toBe(false);
    expect(isWithdrawal(CONSENT_NONE, CONSENT_ALL)).toBe(false);
    expect(isWithdrawal({ measurement: true, remarketing: false }, CONSENT_ALL)).toBe(false);
    expect(isWithdrawal(CONSENT_ALL, { measurement: true, remarketing: false })).toBe(true);
    expect(isWithdrawal({ measurement: true, remarketing: false }, CONSENT_NONE)).toBe(true);
  });
});

describe("serializeConsentCookie", () => {
  it("is site-wide, lax, bounded to 180 days and Secure on https", () => {
    const value = serializeConsentCookie(CONSENT_NONE, true);
    expect(value).toContain("Path=/");
    expect(value).toContain("SameSite=Lax");
    expect(value).toContain(`Max-Age=${180 * 24 * 60 * 60}`);
    expect(value).toContain("Secure");
    expect(serializeConsentCookie(CONSENT_NONE, false)).not.toContain("Secure");
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
