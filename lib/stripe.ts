import "server-only";

import Stripe from "stripe";
import { FOUNDER_SLOTS, PLANS, type Plan } from "@/app/pricing/plans-data";

/**
 * BILLING-STRIPE-1: only Starter and Pro are self-serve Stripe products —
 * Free has no subscription, and Agency is "hablar con ventas" (no
 * self-service price per PRICING-TRUTH-1). Price ids live in env vars, not
 * committed here, since they differ between Stripe test and live mode.
 * FOUNDER-PRICE-1: the amount behind each id must match `PLANS` —
 * `stripePriceMatchesPlan` makes checkout refuse when it does not.
 */
const SELF_SERVE_PRICE_ENV_VAR: Partial<Record<Plan["id"], string | undefined>> = {
  starter: process.env.STRIPE_PRICE_ID_STARTER,
  pro: process.env.STRIPE_PRICE_ID_PRO
};

export type SelfServePlanId = "starter" | "pro";

export function isSelfServePlan(planId: string): planId is SelfServePlanId {
  return planId === "starter" || planId === "pro";
}

export function getPriceIdForPlan(planId: SelfServePlanId): string | null {
  return SELF_SERVE_PRICE_ENV_VAR[planId] ?? null;
}

export function getPlanIdForPriceId(priceId: string): SelfServePlanId | null {
  for (const [planId, envPriceId] of Object.entries(SELF_SERVE_PRICE_ENV_VAR)) {
    if (envPriceId && envPriceId === priceId) return planId as SelfServePlanId;
  }
  return null;
}

/**
 * FOUNDER-PRICE-1 (log §237): un cupón de Stripe por plan, creado a mano en
 * el Dashboard (nunca por esta app), con `duration: forever`, `currency: eur`
 * y `amount_off` = `price − promoPrice` del plan. `amount_off` y no
 * `percent_off` porque un 30 % sobre 29 € son 20,30 €, no los 20 € que enseña
 * la pantalla. Variables nuevas a propósito (no las `_PROMO` de
 * PRICING-PROMO-1): esos cupones son de 6 meses, y reutilizar el nombre
 * habría anunciado "para siempre" sobre un descuento que caduca.
 */
const FOUNDER_COUPON_ENV_VAR: Partial<Record<Plan["id"], string | undefined>> = {
  starter: process.env.STRIPE_COUPON_ID_STARTER_FOUNDER,
  pro: process.env.STRIPE_COUPON_ID_PRO_FOUNDER
};

export function getPromoCouponIdForPlan(planId: SelfServePlanId): string | null {
  return FOUNDER_COUPON_ENV_VAR[planId] ?? null;
}

export type FounderOffer = {
  /** Planes cuyo precio fundador se puede mostrar Y cobrar ahora mismo. */
  planIds: SelfServePlanId[];
  /** Plazas libres de `FOUNDER_SLOTS`, sumando los canjes de todos los cupones. */
  remaining: number;
  total: number;
};

const NO_FOUNDER_OFFER: FounderOffer = { planIds: [], remaining: 0, total: FOUNDER_SLOTS };
const FOUNDER_OFFER_TTL_MS = 5 * 60 * 1000;
const FOUNDER_OFFER_ERROR_TTL_MS = 60 * 1000;
let founderOfferCache: { value: FounderOffer; expiresAt: number } | null = null;

/** Para el checkout: tras un fallo, la siguiente lectura vuelve a Stripe. */
export function invalidateFounderOfferCache(): void {
  founderOfferCache = null;
}

/**
 * Whether a Stripe coupon is exactly the discount `plan` advertises:
 * forever, in euros, for `price − promoPrice`, still redeemable. Anything
 * else — a percentage, the old 6-month launch coupon, a typo in the amount —
 * means the screen and the charge would disagree, so the offer is not shown.
 */
export function couponMatchesFounderPrice(
  coupon: Pick<Stripe.Coupon, "valid" | "duration" | "amount_off" | "currency">,
  plan: Pick<Plan, "price" | "promoPrice">
): boolean {
  if (plan.promoPrice === undefined) return false;
  return (
    coupon.valid === true &&
    coupon.duration === "forever" &&
    coupon.currency === "eur" &&
    coupon.amount_off === Math.round((plan.price - plan.promoPrice) * 100)
  );
}

/**
 * FOUNDER-PRICE-1: the one source of truth for "can the founder price be
 * shown and charged right now, and how many slots are left". Reads the
 * coupons from Stripe — never trusts the env var alone — and caches for five
 * minutes so a page render is not one Stripe call per visitor. Fails closed:
 * no Stripe, an unreachable API or a misconfigured coupon all mean no offer,
 * never an advertised discount checkout cannot apply.
 */
export async function getFounderOffer(now: number = Date.now()): Promise<FounderOffer> {
  if (founderOfferCache && founderOfferCache.expiresAt > now) return founderOfferCache.value;

  const stripe = getStripeClient();
  const configured = (["starter", "pro"] as const)
    .map((id) => ({ id, couponId: getPromoCouponIdForPlan(id) }))
    .filter((entry): entry is { id: SelfServePlanId; couponId: string } => entry.couponId !== null);
  if (!stripe || configured.length === 0) return NO_FOUNDER_OFFER;

  try {
    const coupons = await Promise.all(configured.map(({ couponId }) => stripe.coupons.retrieve(couponId)));
    const redeemed = coupons.reduce((sum, coupon) => sum + (coupon.times_redeemed ?? 0), 0);
    const remaining = Math.max(0, FOUNDER_SLOTS - redeemed);
    const planIds =
      remaining === 0
        ? []
        : configured
            .filter(({ id }, i) => {
              const plan = PLANS.find((p) => p.id === id);
              return plan !== undefined && couponMatchesFounderPrice(coupons[i], plan);
            })
            .map(({ id }) => id);
    const value: FounderOffer = { planIds, remaining: planIds.length > 0 ? remaining : 0, total: FOUNDER_SLOTS };
    founderOfferCache = { value, expiresAt: now + FOUNDER_OFFER_TTL_MS };
    return value;
  } catch (error) {
    console.error("[geo:billing] failed to read founder coupons from Stripe", {
      message: error instanceof Error ? error.message : String(error)
    });
    founderOfferCache = { value: NO_FOUNDER_OFFER, expiresAt: now + FOUNDER_OFFER_ERROR_TTL_MS };
    return NO_FOUNDER_OFFER;
  }
}

/**
 * Los planes cuyo precio fundador se puede mostrar de verdad ahora mismo.
 * Fuente única para `/pricing`, la consola, los correos y el checkout, así
 * que ninguna pantalla puede divergir de lo que se cobra.
 */
export async function getActivePromoPlanIds(): Promise<SelfServePlanId[]> {
  return (await getFounderOffer()).planIds;
}

/**
 * FOUNDER-PRICE-1: guard against the catalog and Stripe disagreeing. Price
 * ids live in env vars, so a deploy that ships new `PLANS` prices before the
 * env points at the matching Stripe Price would show one amount and charge
 * another. Checkout refuses instead (`createCheckoutSession`).
 */
export async function stripePriceMatchesPlan(
  stripe: Stripe,
  priceId: string,
  planId: SelfServePlanId
): Promise<boolean> {
  const plan = PLANS.find((p) => p.id === planId);
  if (!plan) return false;
  const price = await stripe.prices.retrieve(priceId);
  return price.currency === "eur" && price.unit_amount === Math.round(plan.price * 100);
}

/**
 * Whether a REAL subscription is currently under one of our own founder
 * coupons — read from Stripe itself. Matches the discount's coupon id against
 * `getPromoCouponIdForPlan(planId)` rather than trusting any discount present,
 * so a manually-applied support coupon in the Stripe Dashboard is never
 * mislabeled as "precio fundador". A founder discount is `forever`, so there
 * is no end date to report. Returns null on any failure — the "Tu plan" card
 * falls back to the plain price rather than guessing.
 */
export async function getActiveSubscriptionPromo(
  subscriptionId: string,
  planId: Plan["id"]
): Promise<{ promoPrice: number } | null> {
  if (!isSelfServePlan(planId)) return null;
  const couponId = getPromoCouponIdForPlan(planId);
  if (!couponId) return null;

  const stripe = getStripeClient();
  if (!stripe) return null;

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["discounts"] });
    const match = (subscription.discounts ?? []).find((d) => {
      if (typeof d === "string") return false;
      const coupon = d.source.coupon;
      return (typeof coupon === "string" ? coupon : coupon?.id) === couponId;
    });
    if (!match || typeof match === "string") return null;

    // The Plan definition, not the coupon's amount_off, is the source of
    // truth for the price shown — same reasoning as getFounderOffer.
    const plan = PLANS.find((p) => p.id === planId);
    if (!plan || plan.promoPrice === undefined) return null;

    return { promoPrice: plan.promoPrice };
  } catch (error) {
    console.error("[geo:billing] failed to read subscription discount from Stripe", {
      subscriptionId,
      message: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

// Stripe caps both the name and the value of an `invoice_settings.custom_fields`
// entry at 30 characters; anything longer is truncated rather than sent raw and
// rejected by the API (`https://docs.stripe.com/api/customers/update`).
const INVOICE_CUSTOM_FIELD_VALUE_LIMIT = 30;

function truncateForInvoiceField(value: string): string {
  return value.length > INVOICE_CUSTOM_FIELD_VALUE_LIMIT
    ? value.slice(0, INVOICE_CUSTOM_FIELD_VALUE_LIMIT)
    : value;
}

/**
 * BILLING-INVOICE-FIELDS-1 (Task Intake approved 2026-08-25): pushes "Datos de
 * facturación" (razón social, NIF) onto the Stripe customer so they print on
 * real invoices, via `invoice_settings.custom_fields` rather than typed
 * `tax_id_data` — free text, no fiscal-type inference, matches what the
 * settings form actually collects.
 *
 * Best-effort and silent on failure: this runs after the Supabase write that
 * is the account's source of truth, so a Stripe outage must not make the
 * settings form fail to save. Empty fields clear `custom_fields` entirely
 * (`null`, not `[]` — Stripe requires null to remove them) so unsetting a
 * value in the form removes it from future invoices instead of leaving a
 * stale one behind.
 */
export async function syncBillingDetailsToStripeCustomer(
  customerId: string,
  details: { legalName: string; taxId: string }
): Promise<void> {
  const stripe = getStripeClient();
  if (!stripe) return;

  const customFields: Stripe.CustomerUpdateParams.InvoiceSettings.CustomField[] = [];
  if (details.legalName) {
    customFields.push({ name: "Razón social", value: truncateForInvoiceField(details.legalName) });
  }
  if (details.taxId) {
    customFields.push({ name: "NIF/CIF", value: truncateForInvoiceField(details.taxId) });
  }

  try {
    await stripe.customers.update(customerId, {
      invoice_settings: { custom_fields: customFields.length > 0 ? customFields : null }
    });
  } catch (error) {
    console.error("[geo:billing] failed to sync billing details to Stripe customer", {
      customerId,
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

let cachedClient: Stripe | null = null;

/**
 * Returns null (not a thrown error) when STRIPE_SECRET_KEY is unset, so
 * callers can show "facturación no disponible todavía" instead of crashing
 * — same inert-until-configured pattern as Sentry/PostHog
 * (docs/environment-contract.md).
 */
export function getStripeClient(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;

  if (!cachedClient) {
    cachedClient = new Stripe(secretKey);
  }
  return cachedClient;
}
