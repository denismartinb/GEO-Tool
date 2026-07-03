import "server-only";

import { requireUser } from "@/lib/auth";
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
};

function resolvePlan(planId: string | null | undefined): Plan {
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
  const { data } = await supabase.from("profiles").select("current_plan").eq("id", userId).maybeSingle();
  return resolvePlan(data?.current_plan as Plan["id"] | undefined);
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
    supabase.from("profiles").select("current_plan").eq("id", user.id).maybeSingle(),
    supabase.from("projects").select("id, name, domain").eq("is_archived", false),
    supabase.from("project_prompts").select("id").eq("is_active", true),
    supabase
      .from("scan_prompt_results")
      .select("provider")
      .order("created_at", { ascending: false })
      .limit(500)
  ]);

  const plan = resolvePlan(profile?.current_plan as Plan["id"] | undefined);

  const engineSet = new Set((results ?? []).map((r) => r.provider).filter(Boolean));

  return {
    planId: plan.id,
    promptCount: prompts?.length ?? 0,
    promptCap: plan.caps.prompts,
    projectCount: projects?.length ?? 0,
    projectCap: plan.caps.projects,
    engineCount: engineSet.size,
    engineCap: plan.caps.engines,
    activeProjects: projects ?? []
  };
}
