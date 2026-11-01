/**
 * EXT-PROMO-1 (log §403) — when genscore.es offers to install the Chrome
 * extension. Pure, so the rules Denis approved on the canvas
 * (`docs/design-reference/ext-promo-1/`) are tested without a browser:
 *
 *  - only Google Chrome on a desktop: Chrome for Android or iPhone cannot
 *    install extensions, and Edge, Brave or Opera would land on a store page
 *    that is not theirs. The Android app is Chrome on a phone, so it is out too;
 *  - the whole domain except sign-in, MFA, operator and print pages and the
 *    new-domain wizard (the first-scan mission hides it by CSS);
 *  - never on the same page view as the free-report corner card;
 *  - closed with the X, it stays away 30 days; «Ya la tengo» hides it for good
 *    in that browser. The site cannot tell whether the extension is installed:
 *    the 1.0.1 manifest exposes nothing to the page.
 */
import { CHROME_WEB_STORE_URL } from "@/lib/blog/chrome-extension";

export const EXT_PROMO_DELAY_MS = 8_000;
export const EXT_PROMO_DISMISS_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

/** localStorage: epoch ms of the last close with the X. */
export const EXT_PROMO_DISMISSED_AT_KEY = "gs.chromeExt.dismissedAt";
/** localStorage: the visitor said they already have it. */
export const EXT_PROMO_INSTALLED_KEY = "gs.chromeExt.installed";
/** sessionStorage: the card already appeared during this visit. */
export const EXT_PROMO_SHOWN_THIS_VISIT_KEY = "gs.chromeExt.shown";

const EXCLUDED_PREFIXES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/auth",
  "/mfa",
  "/admin",
  "/debug",
  "/informe",
  "/baja",
  "/dashboard/projects/new"
] as const;

export type ExtPromoPlacement = "web" | "consola";

export function placementFor(pathname: string): ExtPromoPlacement {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/") ? "consola" : "web";
}

export function isExtPromoPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return !EXCLUDED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export type BrowserSignals = {
  userAgent: string;
  /** `navigator.userAgentData`, when the browser has it. */
  brands?: readonly { brand: string }[] | null;
  mobile?: boolean | null;
};

/** Google Chrome on a desktop, and nothing else. */
export function isDesktopChrome(signals: BrowserSignals): boolean {
  const ua = signals.userAgent;
  if (/Android|iPhone|iPad|iPod|Mobile|CriOS/i.test(ua)) return false;
  if (signals.mobile === true) return false;
  if (signals.brands && signals.brands.length > 0) {
    return signals.brands.some((b) => b.brand === "Google Chrome");
  }
  // No client hints: fall back to the UA string, excluding the Chromium forks.
  return /Chrome\/\d+/.test(ua) && !/Edg\/|OPR\/|Brave|YaBrowser|SamsungBrowser|Vivaldi/i.test(ua);
}

export type ExtPromoEligibility = {
  pathname: string | null | undefined;
  desktopChrome: boolean;
  now: number;
  /** Raw storage values; `null` when absent or unreadable. */
  dismissedAt: string | null;
  installed: string | null;
  shownThisVisit: string | null;
  /** The free-report corner card may appear on this page view. */
  freeReportEligible: boolean;
};

export function isExtPromoEligible(input: ExtPromoEligibility): boolean {
  if (!input.desktopChrome) return false;
  if (!isExtPromoPath(input.pathname)) return false;
  if (input.installed) return false;
  if (input.shownThisVisit) return false;
  if (input.freeReportEligible) return false;
  const dismissedAt = Number(input.dismissedAt);
  if (input.dismissedAt && Number.isFinite(dismissedAt) && input.now - dismissedAt < EXT_PROMO_DISMISS_COOLDOWN_MS) {
    return false;
  }
  return true;
}

/** The store link, tagged so the store's own stats say where installs came from. */
export function extPromoStoreHref(placement: ExtPromoPlacement): string {
  const params = new URLSearchParams({
    utm_source: "genscore.es",
    utm_medium: "aviso",
    utm_campaign: "extension-chrome",
    utm_content: placement
  });
  return `${CHROME_WEB_STORE_URL}?${params.toString()}`;
}
