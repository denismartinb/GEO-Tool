import "server-only";

import Stripe from "stripe";
import type { Plan } from "@/app/pricing/plans-data";

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
