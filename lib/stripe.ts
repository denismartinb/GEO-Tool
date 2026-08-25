import "server-only";

import Stripe from "stripe";
import { isPromoActive, PLANS, type Plan } from "@/app/pricing/plans-data";

/**
 * BILLING-STRIPE-1: only Starter and Pro are self-serve Stripe products —
 * Free has no subscription, and Agency is "hablar con ventas" (no
 * self-service price per PRICING-TRUTH-1). Price ids live in env vars, not
 * committed here, since they differ between Stripe test mode (used until
 * the founder's go-live checklist — Vercel Pro, alta autónomo, VeriFactu
 * decision — is done) and live mode.
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
 * PRICING-PROMO-1: cupón real de Stripe (`amount_off`, `duration: repeating`,
 * `duration_in_months: 6`, `redeem_by` = `PROMO_ENDS_AT`) — creado a mano en
 * el Dashboard (test mode hoy; live cuando se active), nunca por esta app.
 * `null` mientras no exista, y entonces el checkout cobra el precio normal.
 */
const SELF_SERVE_PROMO_COUPON_ENV_VAR: Partial<Record<Plan["id"], string | undefined>> = {
  starter: process.env.STRIPE_COUPON_ID_STARTER_PROMO,
  pro: process.env.STRIPE_COUPON_ID_PRO_PROMO
};

export function getPromoCouponIdForPlan(planId: SelfServePlanId): string | null {
  return SELF_SERVE_PROMO_COUPON_ENV_VAR[planId] ?? null;
}

/**
 * Los planes cuya promo se puede mostrar de verdad ahora mismo: la fecha no
 * ha pasado Y el cupón de Stripe que la haría real está configurado. Nunca al
 * revés — mostrar el precio tachado sin cupón anunciaría un descuento que el
 * checkout no puede dar, que es justo lo que esta fase existe para evitar.
 * Fuente única para `/pricing` y para el modal de cambio de plan, así que las
 * dos pantallas no puedan divergir sobre qué planes llevan promo.
 */
export function getActivePromoPlanIds(): SelfServePlanId[] {
  if (!isPromoActive()) return [];
  return (["starter", "pro"] as const).filter((id) => getPromoCouponIdForPlan(id) !== null);
}

/**
 * PRICING-PROMO-1: whether a REAL subscription is currently under one of our
 * own promo coupons, and until when — read from Stripe itself, never
 * inferred from `isPromoActive()` (that only says whether *new* checkouts
 * can still redeem the coupon; a subscriber who redeemed it before
 * `PROMO_ENDS_AT` keeps their 6 months running well past that date). Matches
 * the discount's coupon id against `getPromoCouponIdForPlan(planId)` rather
 * than trusting any discount present, so a manually-applied support coupon
 * in the Stripe Dashboard is never mislabeled as "precio de lanzamiento".
 * Returns null on any failure (unconfigured Stripe, unreachable API, no
 * matching discount) — the "Tu plan" card falls back to the plain price
 * rather than guessing.
 */
export async function getActiveSubscriptionPromo(
  subscriptionId: string,
  planId: Plan["id"]
): Promise<{ promoPrice: number; endsAt: string } | null> {
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
    if (!match || typeof match === "string" || !match.end) return null;

    // The Plan definition, not the coupon's amount_off, is the source of
    // truth for the price shown — same reasoning as getActivePromoPlanIds.
    const plan = PLANS.find((p) => p.id === planId);
    if (!plan || plan.promoPrice === undefined) return null;

    return { promoPrice: plan.promoPrice, endsAt: new Date(match.end * 1000).toISOString() };
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
    customFields.push({ name: "NIF", value: truncateForInvoiceField(details.taxId) });
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
