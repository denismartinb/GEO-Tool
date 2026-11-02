/**
 * EXT-PROMO-1 (log §410) — when genscore.es offers to install the Chrome
 * extension. Pure, so the rules Denis approved on the canvas
 * (`docs/design-reference/ext-promo-1/`) are tested without a browser:
 *
 *  - only Google Chrome on a desktop: Chrome for Android or iPhone cannot
 *    install extensions, and Edge, Brave or Opera would land on a store page
 *    that is not theirs. The Android app is Chrome on a phone, so it is out too;
 *  - the whole domain except sign-in, MFA, operator and print pages and the
 *    new-domain wizard (the first-scan mission hides it by CSS);
 *  - on every public page. On content pages (blog, comparativas, glosario,
 *    docs), where the free-report card lives, only once ever: after that those
 *    pages belong to the free-report card (Denis, 2026-11-01). While this card
 *    is on screen the free-report card waits (`FreeReportPromoCard` checks for
 *    `.ext-promo`), so the two never show at once;
 *  - in the console, only for someone who never saw it on the public web in
 *    this browser (EXT-REACH-1, log §436);
 *  - closed with the X, it stays away 30 days; «Ya la tengo» hides it for good
 *    in that browser. The site cannot tell whether the extension is installed:
 *    the 1.0.1 manifest exposes nothing to the page.
 */
import { CHROME_WEB_STORE_URL } from "@/lib/blog/chrome-extension";
import { isPromoPath } from "@/lib/free-report/promo";

export const EXT_PROMO_DELAY_MS = 4_000;
export const EXT_PROMO_DISMISS_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

/** localStorage: epoch ms of the last close with the X. */
export const EXT_PROMO_DISMISSED_AT_KEY = "gs.chromeExt.dismissedAt";
/** localStorage: the visitor said they already have it. */
export const EXT_PROMO_INSTALLED_KEY = "gs.chromeExt.installed";
/** localStorage: the card already appeared once on a content page. */
export const EXT_PROMO_SEEN_ON_CONTENT_KEY = "gs.chromeExt.seenOnContent";
/**
 * localStorage: the card already appeared on the public web in this browser.
 * EXT-REACH-1 (log §436): the console only offers it to someone who never saw
 * it there (Denis, 2026-11-02).
 */
export const EXT_PROMO_SEEN_ON_WEB_KEY = "gs.chromeExt.seenOnWeb";
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
  seenOnContent: string | null;
  /** Absent on old callers: treated as never seen. */
  seenOnWeb?: string | null;
};

export function isExtPromoEligible(input: ExtPromoEligibility): boolean {
  if (!input.desktopChrome) return false;
  if (!isExtPromoPath(input.pathname)) return false;
  if (input.installed) return false;
  if (input.shownThisVisit) return false;
  if (input.seenOnContent && isPromoPath(input.pathname)) return false;
  if (input.seenOnWeb && input.pathname && placementFor(input.pathname) === "consola") return false;
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

/**
 * EXT-REACH-1 (log §436): the store link from the free checker's result. Same
 * tags as the floating card, its own `utm_medium`, so the two read apart.
 */
export function checkerStoreHref(): string {
  const params = new URLSearchParams({
    utm_source: "genscore.es",
    utm_medium: "comprobador",
    utm_campaign: "extension-chrome"
  });
  return `${CHROME_WEB_STORE_URL}?${params.toString()}`;
}

/** Reads the browser's own signals; `false` outside a browser. */
export function detectDesktopChrome(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { userAgentData?: { brands?: { brand: string }[]; mobile?: boolean } };
  return isDesktopChrome({
    userAgent: nav.userAgent,
    brands: nav.userAgentData?.brands ?? null,
    mobile: nav.userAgentData?.mobile ?? null
  });
}
