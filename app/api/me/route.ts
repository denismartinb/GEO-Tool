import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isTrialElapsed, resolvePlan } from "@/lib/billing";

export const dynamic = "force-dynamic";

/**
 * GENSCORE-HEADER-2 — the identity the public header paints when a visitor is
 * already logged in (`components/marketing/public-header.tsx`).
 *
 * Why an endpoint at all: every public marketing surface is statically
 * prerendered, and that is deliberate (SEO-POS-1, GROWTH-2/3). Reading the
 * session server-side inside the shared header would opt all ~45 of them out
 * of static rendering, so the header asks for this from the client instead and
 * the pages stay static.
 *
 * RLS-scoped via the user's own client — no service-role shortcut. Returns
 * exactly what the chip renders and nothing else: no project list, no
 * counters, no notifications (`getWorkspaceCounters`, which the console's own
 * sidebar uses, is far too much work to hang off a blog page load).
 *
 * Read-only on purpose: the plan is resolved through `isTrialElapsed` rather
 * than `getPlanForUser`, so painting a badge never performs the trial
 * downgrade or sends the "trial ended" email. Enforcement stays on the
 * console's plan read, which is where it has always been.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  // Anonymous is the expected case on a marketing page, not an error — 200
  // with a null user keeps it out of the browser console as a failed request.
  if (!user) {
    return NextResponse.json({ user: null });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("current_plan, trial_ends_at, stripe_subscription_id")
    .eq("id", user.id)
    .maybeSingle();

  const plan = resolvePlan(isTrialElapsed(profile) ? "free" : profile?.current_plan);

  return NextResponse.json({
    user: {
      email: user.email ?? "",
      planId: plan.id,
      planName: plan.name
    }
  });
}
