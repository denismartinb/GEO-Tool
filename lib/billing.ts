import "server-only";

import { requireUser } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { PLANS, type Plan } from "@/app/pricing/plans-data";
import type { AuthenticatedContext } from "@/lib/scan/types";

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
};

type TrialFields = {
  current_plan?: string | null;
  trial_ends_at?: string | null;
  stripe_subscription_id?: string | null;
};

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
  if (!row?.trial_ends_at || row.stripe_subscription_id) return row?.current_plan;
  if (new Date(row.trial_ends_at).getTime() > Date.now()) return row.current_plan;

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
 */
export async function getPlanForUser(
  supabase: AuthenticatedContext["supabase"],
  userId: string
): Promise<Plan> {
  const { data } = await supabase
    .from("profiles")
    .select("current_plan, trial_ends_at, stripe_subscription_id")
    .eq("id", userId)
    .maybeSingle();
  const effectivePlanId = await applyTrialExpiry(userId, data);
  return resolvePlan(effectivePlanId as Plan["id"] | undefined);
}

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
      .select("current_plan, stripe_customer_id, stripe_subscription_id, trial_ends_at")
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
    trialEndsAt: trialExpired ? null : (profile?.trial_ends_at ?? null)
  };
}
