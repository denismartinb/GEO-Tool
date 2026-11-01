import { describe, expect, it } from "vitest";
import {
  EXT_PROMO_DISMISS_COOLDOWN_MS,
  extPromoStoreHref,
  isDesktopChrome,
  isExtPromoEligible,
  isExtPromoPath,
  placementFor
} from "./install-promo";

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const CHROME_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const CHROME_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1";
const EDGE = `${CHROME_MAC} Edg/130.0.0.0`;
const SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

const base = {
  pathname: "/blog/x",
  desktopChrome: true,
  now: 1_000_000_000_000,
  dismissedAt: null,
  installed: null,
  shownThisVisit: null,
  freeReportEligible: false
};

describe("isDesktopChrome", () => {
  it("accepts Chrome on a desktop, by client hints or by UA", () => {
    expect(isDesktopChrome({ userAgent: CHROME_MAC })).toBe(true);
    expect(
      isDesktopChrome({ userAgent: CHROME_MAC, mobile: false, brands: [{ brand: "Chromium" }, { brand: "Google Chrome" }] })
    ).toBe(true);
  });

  it("rejects phones, the Android app, other Chromium browsers and Safari", () => {
    expect(isDesktopChrome({ userAgent: CHROME_ANDROID })).toBe(false);
    expect(isDesktopChrome({ userAgent: CHROME_IOS })).toBe(false);
    expect(isDesktopChrome({ userAgent: CHROME_MAC, mobile: true, brands: [{ brand: "Google Chrome" }] })).toBe(false);
    expect(isDesktopChrome({ userAgent: EDGE })).toBe(false);
    expect(isDesktopChrome({ userAgent: CHROME_MAC, brands: [{ brand: "Chromium" }, { brand: "Brave" }] })).toBe(false);
    expect(isDesktopChrome({ userAgent: SAFARI })).toBe(false);
  });
});

describe("isExtPromoPath / placementFor", () => {
  it("covers the public site and the console", () => {
    for (const p of ["/", "/blog/x", "/precios", "/dashboard", "/dashboard/projects/abc/prompts"]) {
      expect(isExtPromoPath(p)).toBe(true);
    }
  });

  it("stays off sign-in, operator, print pages and the new-domain wizard", () => {
    for (const p of ["/login", "/signup", "/auth/confirm", "/mfa", "/admin/panel", "/debug", "/informe/abc", "/dashboard/projects/new"]) {
      expect(isExtPromoPath(p)).toBe(false);
    }
  });

  it("knows which side of the domain it is on", () => {
    expect(placementFor("/blog/x")).toBe("web");
    expect(placementFor("/dashboard/projects/abc")).toBe("consola");
  });
});

describe("isExtPromoEligible", () => {
  it("shows by default on desktop Chrome", () => {
    expect(isExtPromoEligible(base)).toBe(true);
  });

  it("never on another browser", () => {
    expect(isExtPromoEligible({ ...base, desktopChrome: false })).toBe(false);
  });

  it("never alongside the free-report card", () => {
    expect(isExtPromoEligible({ ...base, freeReportEligible: true })).toBe(false);
  });

  it("«Ya la tengo» hides it for good; once per visit", () => {
    expect(isExtPromoEligible({ ...base, installed: "1" })).toBe(false);
    expect(isExtPromoEligible({ ...base, shownThisVisit: "1" })).toBe(false);
  });

  it("the X hides it 30 days", () => {
    const justClosed = String(base.now - 1000);
    const longAgo = String(base.now - EXT_PROMO_DISMISS_COOLDOWN_MS - 1);
    expect(isExtPromoEligible({ ...base, dismissedAt: justClosed })).toBe(false);
    expect(isExtPromoEligible({ ...base, dismissedAt: longAgo })).toBe(true);
  });
});

describe("extPromoStoreHref", () => {
  it("tags the store link with where the click came from", () => {
    const url = new URL(extPromoStoreHref("consola"));
    expect(url.hostname).toBe("chromewebstore.google.com");
    expect(url.searchParams.get("utm_source")).toBe("genscore.es");
    expect(url.searchParams.get("utm_medium")).toBe("aviso");
    expect(url.searchParams.get("utm_campaign")).toBe("extension-chrome");
    expect(url.searchParams.get("utm_content")).toBe("consola");
  });
});
