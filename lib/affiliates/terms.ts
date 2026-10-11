/**
 * AFFILIATES-1 — the programme's terms, in one place.
 *
 * Founder decisions (2026-10-10): 30 % of what is actually charged without
 * VAT (after discounts), for 12 months from the referred account's first paid
 * invoice, Pro plan only, real payments only. The 7-day trial never counts
 * because nothing is charged. Refunds do not generate commission. Payout by
 * monthly bank transfer once 50 € have accumulated, against the affiliate's
 * invoice. The page copy, the monthly report and the referral cookie all read
 * these constants, so the page cannot promise a figure the report does not
 * pay.
 *
 * Pure on purpose (no `server-only`): the middleware (Edge) and the page both
 * import it.
 */

export const AFFILIATE_COMMISSION_RATE = 0.3;
export const AFFILIATE_COMMISSION_MONTHS = 12;
export const AFFILIATE_COOKIE_DAYS = 90;
export const AFFILIATE_PAYOUT_MIN_EUR = 50;
/** The plan whose payments earn commission. Only one, on purpose. */
export const AFFILIATE_PLAN_ID = "pro" as const;
/** Spanish VAT. `/precios` shows prices with VAT included. */
export const SPANISH_VAT_RATE = 0.21;

/**
 * Commission on one monthly payment of `grossMonthlyEur` (VAT included), in
 * whole euros, for the page's example. The report computes the real figure
 * from Stripe's own tax amount, never from this rate.
 */
export function exampleMonthlyCommissionEur(grossMonthlyEur: number): number {
  return Math.round((grossMonthlyEur / (1 + SPANISH_VAT_RATE)) * AFFILIATE_COMMISSION_RATE);
}

/** "30 %" — Spanish typography puts a space before the percent sign. */
export function formatCommissionRate(): string {
  return `${Math.round(AFFILIATE_COMMISSION_RATE * 100)} %`;
}
