/**
 * FREE-REPORT-2 — when the «informe gratis» corner card may appear on a
 * content page. Pure, so the rules the founder approved on the canvas
 * (`docs/design-reference/free-report-1/`, log §252) are tested without a
 * browser:
 *
 *  - only on content pages (blog, comparativas, glosario, docs) — never on the
 *    home, pricing, signup or the console, where a pop-up would compete with
 *    the trial signup button, which is worth more than an email;
 *  - after 40 s on the page or past half the article, whichever comes first;
 *  - once per visit; closed, it stays away for 7 days; once the visitor has
 *    asked for the report, never again;
 *  - not for someone logged in, who is already a user.
 */

export const FREE_REPORT_PATH = "/gratis/informe-geo";

/** Where the card is allowed. Prefix match on the pathname. */
export const PROMO_PATH_PREFIXES = ["/blog", "/comparativas", "/glosario", "/docs"] as const;

export const PROMO_DELAY_MS = 40_000;
export const PROMO_SCROLL_FRACTION = 0.5;
export const PROMO_DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

/** localStorage: epoch ms of the last close. */
export const PROMO_DISMISSED_AT_KEY = "gs.freeReport.dismissedAt";
/** localStorage: set once the visitor's request was accepted. */
export const PROMO_REQUESTED_KEY = "gs.freeReport.requested";
/** sessionStorage: the card already appeared during this visit. */
export const PROMO_SHOWN_THIS_VISIT_KEY = "gs.freeReport.shown";

/**
 * `?desde=` tag each entry point adds to the landing link, so the operator
 * email says where the request came from. Not a UTM on purpose: UTMs on
 * internal links overwrite the visit's real campaign in analytics.
 */
export const FREE_REPORT_ENTRY = {
  blogCard: "tarjeta-contenido",
  homeBand: "banda-portada",
  pricingLine: "linea-precios"
} as const;

export function freeReportHref(entry: (typeof FREE_REPORT_ENTRY)[keyof typeof FREE_REPORT_ENTRY]): string {
  return `${FREE_REPORT_PATH}?desde=${entry}`;
}

export function isPromoPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return PROMO_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export type PromoEligibility = {
  pathname: string | null | undefined;
  loggedIn: boolean;
  now: number;
  /** Raw localStorage/sessionStorage values; `null` when absent or unreadable. */
  dismissedAt: string | null;
  requested: string | null;
  shownThisVisit: string | null;
};

/** Whether the card may appear at all on this page view. Timing is separate. */
export function isPromoEligible(input: PromoEligibility): boolean {
  if (!isPromoPath(input.pathname)) return false;
  if (input.loggedIn) return false;
  if (input.requested) return false;
  if (input.shownThisVisit) return false;
  const dismissedAt = Number(input.dismissedAt);
  if (input.dismissedAt && Number.isFinite(dismissedAt) && input.now - dismissedAt < PROMO_DISMISS_COOLDOWN_MS) {
    return false;
  }
  return true;
}

/** Whether an eligible card should appear now: time on page or scroll depth. */
export function shouldTriggerPromo(input: { elapsedMs: number; scrollFraction: number }): boolean {
  return input.elapsedMs >= PROMO_DELAY_MS || input.scrollFraction >= PROMO_SCROLL_FRACTION;
}

/** Fraction of the scrollable page the visitor has passed, 0..1. */
export function scrollFractionOf(scrollY: number, viewportHeight: number, documentHeight: number): number {
  const scrollable = documentHeight - viewportHeight;
  if (scrollable <= 0) return 0;
  return Math.min(1, Math.max(0, scrollY / scrollable));
}
