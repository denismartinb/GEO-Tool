import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isTrialElapsed, resolveEffectivePlanId, resolvePlan, SYSTEM_PLAN_COLUMNS } from "@/lib/billing";

/**
 * CHROME-EXT-1 paso 02 — the session the Chrome extension's panel reads with
 * (`docs/chrome-extension/task-intake-report.md` §18).
 *
 * No token of its own: the extension holds `host_permissions` for
 * www.genscore.es, so its requests carry the same Supabase session cookie as
 * the console, and this is the user's own RLS-scoped client. Unlike
 * `requireUser` it answers 401 instead of redirecting, which is what a fetch
 * from the panel can act on.
 *
 * Read-only like `/api/me`: the plan comes from `isTrialElapsed` +
 * `resolveEffectivePlanId`, never `getPlanForUser`, so opening the panel never
 * performs the trial downgrade or sends the "trial ended" email.
 */

export type ExtAccount = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: { id: string; email: string | null };
  profile: Record<string, unknown> | null;
  planId: string;
  planName: string;
  domainCap: number;
  trialEndsAt: string | null;
};

/** Nothing here may be cached by a browser or a proxy: it is one account's data. */
export const EXT_HEADERS = { "Cache-Control": "private, no-store", Vary: "Cookie" } as const;

export function extJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: EXT_HEADERS });
}

export async function readExtAccount(): Promise<ExtAccount | null> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select(SYSTEM_PLAN_COLUMNS).eq("id", user.id).maybeSingle();
  const elapsed = isTrialElapsed(profile);
  const plan = resolvePlan(resolveEffectivePlanId(elapsed ? "free" : profile?.current_plan, user.email));
  const trialEndsAt =
    !elapsed && profile?.trial_ends_at && !profile?.stripe_subscription_id ? (profile.trial_ends_at as string) : null;
  return {
    supabase,
    user: { id: user.id, email: user.email ?? null },
    profile: (profile as Record<string, unknown> | null) ?? null,
    planId: plan.id,
    planName: plan.name,
    domainCap: plan.caps.projects,
    trialEndsAt
  };
}

export type ExtProjectRow = { id: string; name: string; brand: string | null; domain: string };

/** The account's live projects, newest first, filtered by owner as well as by RLS. */
export async function listExtProjects(account: ExtAccount): Promise<ExtProjectRow[]> {
  const { data } = await account.supabase
    .from("projects")
    .select("id, name, brand, domain")
    .eq("owner_user_id", account.user.id)
    .eq("is_archived", false)
    .order("created_at", { ascending: false });
  return (data ?? []) as ExtProjectRow[];
}
