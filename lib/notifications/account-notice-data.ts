import "server-only";

import { PLANS } from "@/app/pricing/plans-data";
import { getPlanForUser } from "@/lib/billing";
import { getFounderOffer } from "@/lib/stripe";
import { buildAccountNotice, type AccountNotice } from "@/lib/notifications/account-notice";
import type { AuthenticatedContext } from "@/lib/auth";

/**
 * Loads what the «Tu cuenta» lane needs (NOTIF-LANES-1, log §297). Called only
 * from the console layout, not from `getWorkspaceCounters`, so the Domains
 * screen does not pay for it.
 *
 * The plan comes from `getPlanForUser` (already cached for this request, and
 * already applying trial expiry and comped). Stripe and the last scan are only
 * read when there is a notice to show. Any failure means no notice: the bell
 * must never break the console.
 */
export async function getAccountNotice(
  supabase: AuthenticatedContext["supabase"],
  userId: string,
  now: number = Date.now()
): Promise<AccountNotice | null> {
  try {
    const plan = await getPlanForUser(supabase, userId);
    if (plan.id !== "pro" && plan.id !== "free") return null;

    const { data: profile } = await supabase
      .from("profiles")
      .select("trial_ends_at, stripe_subscription_id")
      .eq("id", userId)
      .maybeSingle();

    const isTrial = plan.id === "pro" && Boolean(profile?.trial_ends_at) && !profile?.stripe_subscription_id;
    if (plan.id === "pro" && !isTrial) return null;

    const [offer, lastScan] = await Promise.all([
      getFounderOffer(now),
      plan.id === "free"
        ? supabase
            .from("scan_runs")
            .select("finished_at")
            .eq("status", "completed")
            .not("finished_at", "is", null)
            .order("finished_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null })
    ]);

    const proPromoPrice = PLANS.find((p) => p.id === "pro")?.promoPrice;
    const founderPrice = offer.planIds.includes("pro") && typeof proPromoPrice === "number" ? proPromoPrice : null;

    return buildAccountNotice({
      planId: plan.id,
      trialEndsAt: (profile?.trial_ends_at as string | null | undefined) ?? null,
      hasSubscription: Boolean(profile?.stripe_subscription_id),
      lastCompletedScanAt: (lastScan.data?.finished_at as string | null | undefined) ?? null,
      founderPrice,
      now
    });
  } catch (error) {
    console.error("getAccountNotice failed", error instanceof Error ? error.message : "unknown");
    return null;
  }
}
