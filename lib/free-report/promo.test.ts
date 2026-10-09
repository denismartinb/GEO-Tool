import { describe, expect, it } from "vitest";
import {
  freeReportHref,
  isPromoEligible,
  isPromoPath,
  PROMO_DISMISS_COOLDOWN_MS,
  scrollFractionOf,
  shouldTriggerPromo,
  type PromoEligibility
} from "@/lib/free-report/promo";

const NOW = 1_800_000_000_000;

function eligible(overrides: Partial<PromoEligibility> = {}): boolean {
  return isPromoEligible({
    pathname: "/blog/como-saber-si-tu-marca-aparece-en-chatgpt",
    loggedIn: false,
    now: NOW,
    dismissedAt: null,
    requested: null,
    shownThisVisit: null,
    ...overrides
  });
}

describe("isPromoPath", () => {
  it("allows the four content surfaces and their children", () => {
    for (const path of ["/blog", "/blog/x", "/comparativas/genscore-vs-otterly", "/glosario/geo", "/docs"]) {
      expect(isPromoPath(path)).toBe(true);
    }
  });

  it("never shows on the home, pricing, signup, console or the landing itself", () => {
    for (const path of ["/", "/precios", "/signup", "/login", "/dashboard", "/gratis/informe-geo", "/geo", "/blogger"]) {
      expect(isPromoPath(path)).toBe(false);
    }
    expect(isPromoPath(null)).toBe(false);
  });
});

describe("isPromoEligible", () => {
  it("is eligible for an anonymous first-time reader", () => {
    expect(eligible()).toBe(true);
  });

  it("is not shown to someone logged in", () => {
    expect(eligible({ loggedIn: true })).toBe(false);
  });

  it("never comes back once the report was requested", () => {
    expect(eligible({ requested: "1" })).toBe(false);
  });

  it("appears at most once per visit", () => {
    expect(eligible({ shownThisVisit: "1" })).toBe(false);
  });

  it("stays away for 7 days after being closed, then may return", () => {
    expect(eligible({ dismissedAt: String(NOW - 1000) })).toBe(false);
    expect(eligible({ dismissedAt: String(NOW - PROMO_DISMISS_COOLDOWN_MS + 1) })).toBe(false);
    expect(eligible({ dismissedAt: String(NOW - PROMO_DISMISS_COOLDOWN_MS) })).toBe(true);
  });

  it("ignores a corrupt dismissal value instead of hiding the card forever", () => {
    expect(eligible({ dismissedAt: "not-a-number" })).toBe(true);
  });
});

describe("shouldTriggerPromo", () => {
  it("fires after 40 seconds or past half the page, whichever comes first", () => {
    expect(shouldTriggerPromo({ elapsedMs: 39_999, scrollFraction: 0.49 })).toBe(false);
    expect(shouldTriggerPromo({ elapsedMs: 40_000, scrollFraction: 0 })).toBe(true);
    expect(shouldTriggerPromo({ elapsedMs: 0, scrollFraction: 0.5 })).toBe(true);
  });
});

describe("scrollFractionOf", () => {
  it("measures against the scrollable height and clamps", () => {
    expect(scrollFractionOf(500, 1000, 2000)).toBe(0.5);
    expect(scrollFractionOf(5000, 1000, 2000)).toBe(1);
    expect(scrollFractionOf(0, 1000, 800)).toBe(0);
  });
});

describe("freeReportHref", () => {
  it("tags the entry point with ?desde=, not a UTM", () => {
    expect(freeReportHref("banda-portada")).toBe("/gratis/informe-geo?desde=banda-portada");
  });
});
