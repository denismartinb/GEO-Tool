import "server-only";

import Stripe from "stripe";
import { isPromoActive, type Plan } from "@/app/pricing/plans-data";

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
