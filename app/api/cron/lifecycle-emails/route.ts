import "server-only";

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isAuthorizedInternalRequest } from "@/lib/api/internal-auth";
import {
  lifecycleDeadline,
  runConfirmationReminders,
  runLifecycleEmails,
  runTrialEndEmails,
  runWinbackEmails
} from "@/lib/email/lifecycle/runner";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * LIFECYCLE-TRIAL-1 (log §233). Daily at 07:45 UTC (09:45 Madrid in summer,
 * 08:45 in winter): the trial emails D1, D3 and D5; (LIFECYCLE-WINBACK-1,
 * §238) the end-of-trial email and the win-back emails D+3 and D+10; and
 * (CONFIRM-REMINDER-1, §234) one reminder to sign-ups that never confirmed
 * their email. All passes share one deadline inside the 60 s invocation. Same auth as every other
 * cron (Vercel sends `CRON_SECRET`); the kill switch is
 * `LIFECYCLE_EMAILS_ENABLED`, read inside `runLifecycleEmails`, so the route
 * ships inert until the founder turns it on.
 */
export async function GET(request: Request) {
  if (!isAuthorizedInternalRequest(request, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const deadline = lifecycleDeadline();
  const trial = await runLifecycleEmails({ service, deadline });
  // LIFECYCLE-WINBACK-1 (log §238): end of trial first, so D+3 can anchor on it.
  const trialEnd = await runTrialEndEmails({ service, deadline });
  const winback = await runWinbackEmails({ service, deadline });
  // CONFIRM-REMINDER-1 (log §234): sign-ups that never confirmed their email.
  const confirmations = await runConfirmationReminders({ service });
  const failed = [trial, trialEnd, winback, confirmations].some((pass) => pass.status === "query_failed");
  return NextResponse.json({ trial, trialEnd, winback, confirmations }, { status: failed ? 500 : 200 });
}
