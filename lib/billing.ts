import "server-only";

import { cache } from "react";
import { requireUser } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { sendTrialEndedEmail } from "@/lib/email/transactional";
import { PLANS, type Plan } from "@/app/pricing/plans-data";
import { getActiveSubscriptionPromo } from "@/lib/stripe";
import type { AuthenticatedContext } from "@/lib/auth";

const DEFAULT_PLAN_ID: Plan["id"] = "pro";

export type ActiveProjectSummary = { id: string; name: string; domain: string };

export type UsageSummary = {
  planId: Plan["id"];
  promptCount: number;
  promptCap: number;
  projectCount: number;
  projectCap: number;
  engineCount: number;
  engineCap: number;
  activeProjects: ActiveProjectSummary[];
  /** Whether the account has ever had a real Stripe customer — kept even after a downgrade/cancellation so past invoices stay reachable via the Customer Portal. */
  hasStripeCustomer: boolean;
  /** BILLING-STRIPE-1 PR 3: null once there's no active reverse trial (never started, converted to a real subscription, or already expired and downgraded). */
  trialEndsAt: string | null;
  /** Whether `current_plan` is backed by a real Stripe subscription, as opposed to an unconverted reverse trial — distinguishes "paying Pro" from "trialing Pro" for the change-plan flow and the Portal cancel button. */
  hasStripeSubscription: boolean;
  /** Set when a Portal-driven cancellation is scheduled (Stripe's cancel_at_period_end) — the real date the plan stops, not yet reflected as a downgrade since the account keeps access until then. */
  cancelAt: string | null;
  /** PRICING-PROMO-1: set when the real Stripe subscription is currently under one of our promo coupons — read from Stripe itself, see `getActiveSubscriptionPromo`. Null for a plain subscription, a trial, or Free. */
  subscriptionPromo: { promoPrice: number; endsAt: string } | null;
};

type TrialFields = {
  current_plan?: string | null;
  trial_ends_at?: string | null;
  stripe_subscription_id?: string | null;
  email?: string | null;
};

/**
 * The read-only half of `applyTrialExpiry`: "has this reverse trial elapsed?",
 * with no write and no email. Extracted (GENSCORE-HEADER-2) so a display-only
 * caller can resolve the *effective* plan without triggering enforcement —
 * `/api/me` paints the public header's plan badge and is reachable from every
 * static marketing page, which is far more traffic than the console, and an
 * endpoint whose job is to paint a badge must not send a customer email.
 * Enforcement still happens where it always did: `applyTrialExpiry` below, on
 * the console's own plan read.
 *
 * Both callers share this predicate rather than restating it — a second copy
 * of "is the trial over?" would drift the badge away from the real gate.
 */
export function isTrialElapsed(row: TrialFields | null | undefined): boolean {
  if (!row?.trial_ends_at || row.stripe_subscription_id) return false;
  return new Date(row.trial_ends_at).getTime() <= Date.now();
}

/**
 * A reverse-trial account (`current_plan='pro'`, `trial_ends_at` set at
 * signup — see 0017_reverse_trial.sql) downgrades to Free the first time its
 * plan is read after the trial window ends, checked lazily here rather than
 * via a cron — matches this codebase's "recheck at the point of use" style
 * (PRICING-TRUTH-1's real enforcement). Never touches an account with a real
 * `stripe_subscription_id`: converting to a paid plan during the trial must
 * never be undone just because the original trial window elapsed. Fails
 * safe — if the (privileged, service-role) downgrade write itself fails,
 * callers still see the pre-expiry plan rather than a silently-wrong one.
 */
async function applyTrialExpiry(userId: string, row: TrialFields | null | undefined): Promise<string | null | undefined> {
  // `!row` is what narrows the type below; `isTrialElapsed` is a plain
  // predicate on purpose — returning false means "the trial is still running",
  // never "there is no row", so it must not be a type guard.
  if (!row || !isTrialElapsed(row)) return row?.current_plan;

  try {
    const service = createServiceClient();
    const { error } = await service
      .from("profiles")
      .update({ current_plan: "free", trial_ends_at: null })
      .eq("id", userId);

    if (error) {
      console.error("[geo:billing] failed to downgrade an expired trial", { userId, message: error.message });
      return row.current_plan;
    }
  } catch (configError) {
    console.error("[geo:billing] service client unavailable to downgrade an expired trial", {
      userId,
      message: configError instanceof Error ? configError.message : String(configError)
    });
    return row.current_plan;
  }

  if (row.email) {
    await sendTrialEndedEmail(row.email);
  }

  return "free";
}

/**
 * Resolves a stored `profiles.current_plan` value to its `Plan` definition,
 * falling back to `DEFAULT_PLAN_ID` for an unset/unknown value. Exported (not
 * just used internally) so system-level code without an authenticated user
 * session — e.g. `createPendingScanRunCore`'s owner-plan lookup for cron and
 * auto-retry runs — can resolve a plan's caps from a plain plan id read via
 * the service client.
 */
export function resolvePlan(planId: string | null | undefined): Plan {
  return PLANS.find((p) => p.id === planId) ?? PLANS.find((p) => p.id === DEFAULT_PLAN_ID)!;
}

/**
 * Raw Pro-tier check for feature gates (as opposed to the numeric-caps UI,
 * which uses `resolvePlan`/`getPlanForUser`). Deliberately does NOT go
 * through `resolvePlan`: that function defaults a missing/unrecognized value
 * to "pro" (`DEFAULT_PLAN_ID`), which is a safe, generous default for a usage
 * bar but would silently grant a paid-only ACTION to any account whose
 * profile row is missing or hasn't loaded — never trust a gate to a fallback
 * that resolves toward "yes". Fails closed: only an exact "pro" or "agency"
 * value passes; anything else (free, starter, null, undefined, unrecognized)
 * is denied.
 */
export function isProOrAbove(rawCurrentPlan: string | null | undefined): boolean {
  return rawCurrentPlan === "pro" || rawCurrentPlan === "agency";
}

/**
 * Fetches the caller's real plan (for limit-enforcement checks in server
 * actions that already hold an authenticated `supabase`/`user` from
 * `requireUser()` — avoids a second auth round trip).
 *
 * Memoizado con `React.cache()` por petición (PRELAUNCH-HARDENING-1 Fase V,
 * V8). Dos motivos, y el segundo no es de rendimiento:
 *
 *  1. El layout del dashboard y alguna página (p. ej. Auditoría web) piden el
 *     plan en el mismo render, y eran dos lecturas de `profiles` idénticas.
 *  2. `applyTrialExpiry` **tiene efectos**: degrada el plan y manda el email
 *     de "trial terminado". Dos llamadas concurrentes dentro del mismo render
 *     podían leer la fila antes de la actualización y mandar ese email dos
 *     veces al mismo cliente. Con una sola ejecución por petición, ese camino
 *     corre una vez.
 *
 * La clave incluye el cliente `supabase`; como `requireUser()` ya está
 * memoizado, todas las pantallas comparten la misma referencia y el acierto es
 * real. Un llamador que construya su propio cliente simplemente no acierta —
 * mismo comportamiento que hoy, nunca peor.
 */
export const getPlanForUser = cache(async function getPlanForUser(
  supabase: AuthenticatedContext["supabase"],
  userId: string
): Promise<Plan> {
  const { data } = await supabase
    .from("profiles")
    .select("current_plan, trial_ends_at, stripe_subscription_id, email")
    .eq("id", userId)
    .maybeSingle();
  const effectivePlanId = await applyTrialExpiry(userId, data);
  return resolvePlan(effectivePlanId as Plan["id"] | undefined);
});

/**
 * Real usage counters and current plan for the "Plan y facturación" page.
 * Mirrors the RLS-scoped, no-explicit-owner-filter query style used by
 * getWorkspaceCounters(): every query below relies on RLS to limit rows to
 * the current user's own data.
 */
export async function getUsageSummary(): Promise<UsageSummary> {
  const { supabase, user } = await requireUser();

  const [{ data: profile }, { data: projects }, { data: prompts }, { data: results }] = await Promise.all([
    supabase
      .from("profiles")
      .select("current_plan, stripe_customer_id, stripe_subscription_id, trial_ends_at, email, cancel_at")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("projects").select("id, name, domain").eq("is_archived", false),
    supabase.from("project_prompts").select("id").eq("is_active", true),
    supabase
      .from("scan_prompt_results")
      .select("provider")
      .order("created_at", { ascending: false })
      .limit(500)
  ]);

  const effectivePlanId = await applyTrialExpiry(user.id, profile);
  const plan = resolvePlan(effectivePlanId as Plan["id"] | undefined);
  const trialExpired = effectivePlanId !== profile?.current_plan;

  const engineSet = new Set((results ?? []).map((r) => r.provider).filter(Boolean));

  const subscriptionPromo = profile?.stripe_subscription_id
    ? await getActiveSubscriptionPromo(profile.stripe_subscription_id, plan.id)
    : null;

  return {
    planId: plan.id,
    promptCount: prompts?.length ?? 0,
    promptCap: plan.caps.prompts,
    projectCount: projects?.length ?? 0,
    projectCap: plan.caps.projects,
    engineCount: engineSet.size,
    engineCap: plan.caps.engines,
    activeProjects: projects ?? [],
    hasStripeCustomer: Boolean(profile?.stripe_customer_id),
    trialEndsAt: trialExpired ? null : (profile?.trial_ends_at ?? null),
    hasStripeSubscription: Boolean(profile?.stripe_subscription_id),
    cancelAt: (profile?.cancel_at as string | null | undefined) ?? null,
    subscriptionPromo
  };
}

export type DomainOverage = {
  isOverCapacity: boolean;
  planId: Plan["id"];
  planName: string;
  activeCount: number;
  cap: number;
  requiredRemoveCount: number;
  domains: ActiveProjectSummary[];
  hasStripeSubscription: boolean;
};

/**
 * DOMAINS-OVERAGE-GATE-1: cheap, dedicated check for the blocking gate
 * mounted in the dashboard layout on every navigation — deliberately NOT
 * `getUsageSummary()` (four parallel queries including up to 500 scan
 * result rows and a Stripe promo lookup), which would be wasted work on
 * every page load for the near-totality of accounts that are never over
 * their plan's domain cap. Same fail-safe direction as
 * SAMPLING-DEBUG-TOGGLE-1's dedicated query (.claude/rules/scan.md): a read
 * error here reads toward "not over capacity" — today's shipped behaviour,
 * no block at all — never toward blocking the entire console for every user
 * on a transient read error.
 *
 * Deliberately does NOT go through `getPlanForUser()`: `resolvePlan()`
 * defaults an unresolvable plan id to `DEFAULT_PLAN_ID` ("pro", cap 5) — the
 * right call for a usage bar (generous), wrong for a BLOCKING gate. That
 * default is fine for a profile row that exists with a genuinely unset
 * `current_plan` (existing, accepted behaviour elsewhere in this file); it
 * is NOT fine for a row this query failed to find at all — that would read
 * an Agency-tier account (cap 999) hit by a transient read glitch as capped
 * at 5, and lock a legitimate paying customer out of the whole console on a
 * blip (caught in QA review before merge). A missing/errored profile row
 * fails toward "not over capacity" here too, same direction as the count
 * query below. This also means trial-expiry recompute (`applyTrialExpiry`)
 * is skipped for this one check — the narrow window where that matters (a
 * trial expired but hasn't been recomputed by another read yet) only ever
 * makes this check UNDER-detect overage, the same safe direction.
 */
export async function getDomainOverage(): Promise<DomainOverage> {
  const { supabase, user } = await requireUser();

  const { data: profileRow, error: profileError } = await supabase
    .from("profiles")
    .select("current_plan, stripe_subscription_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profileRow) {
    const fallbackPlan = resolvePlan(undefined);
    return {
      isOverCapacity: false,
      planId: fallbackPlan.id,
      planName: fallbackPlan.name,
      activeCount: 0,
      cap: 0,
      requiredRemoveCount: 0,
      domains: [],
      hasStripeSubscription: false
    };
  }

  const plan = resolvePlan(profileRow.current_plan as Plan["id"] | undefined);
  const hasStripeSubscription = Boolean(profileRow.stripe_subscription_id);

  const { count: activeCount, error: countError } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("is_archived", false);

  if (countError || activeCount == null || activeCount <= plan.caps.projects) {
    return {
      isOverCapacity: false,
      planId: plan.id,
      planName: plan.name,
      activeCount: activeCount ?? 0,
      cap: plan.caps.projects,
      requiredRemoveCount: 0,
      domains: [],
      hasStripeSubscription
    };
  }

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, domain")
    .eq("is_archived", false)
    .order("created_at", { ascending: true });

  const domains = projects ?? [];

  return {
    isOverCapacity: true,
    planId: plan.id,
    planName: plan.name,
    activeCount: domains.length,
    cap: plan.caps.projects,
    requiredRemoveCount: Math.max(0, domains.length - plan.caps.projects),
    domains,
    hasStripeSubscription
  };
}
