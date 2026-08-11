import "server-only";

import { sendNewSignupOpsAlertEmail } from "@/lib/email/transactional";
import type { createClient } from "@/lib/supabase/server";

/**
 * ADMIN-CONSOLE-1: shared by the two real signup call sites
 * (`app/signup/actions.ts` for an immediate-session password signup,
 * `app/auth/callback/route.ts` for a confirmed-link or Google signup) so
 * the "read the plan this account actually got, then alert" logic exists
 * once. Reads `profiles` with the caller's own just-created session — RLS's
 * `profiles_select_own` (0002_v0_rls.sql) allows it, no service role needed.
 *
 * Never throws: an alert-gathering failure must not turn a real signup into
 * a failed one. `sendNewSignupOpsAlertEmail` itself already no-ops when
 * unconfigured and never throws either (see `lib/email/transactional.ts`).
 */
export async function sendNewSignupOpsAlert(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: { id: string; email: string; created_at?: string },
  method: "password" | "google"
): Promise<void> {
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("current_plan, trial_ends_at")
      .eq("id", user.id)
      .maybeSingle();

    await sendNewSignupOpsAlertEmail({
      email: user.email,
      userId: user.id,
      method,
      planId: profile?.current_plan ?? "free",
      trialEndsAt: profile?.trial_ends_at ?? null,
      createdAt: user.created_at ? new Date(user.created_at) : new Date()
    });
  } catch (error) {
    console.error("[geo:admin] failed to gather data for the new-signup ops alert", {
      userId: user.id,
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
