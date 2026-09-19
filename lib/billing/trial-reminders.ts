import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import { sendTrialEndingSoonEmail } from "@/lib/email/transactional";

/** Milliseconds in 3 days — the reminder is due once this much or less remains. */
const REMINDER_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

type ReminderCandidateRow = {
  id: string;
  email: string | null;
  trial_ends_at: string | null;
};

/**
 * TRIAL-REMINDER-3D-1 (founder-approved 2026-09-19). Sends "your Pro trial
 * ends in 3 days" to every reverse-trial account inside that window.
 *
 * Eligibility is "3 days or less remain, and this account was never
 * reminded" rather than a narrow same-day window — `trial_reminder_sent_at`
 * is the real idempotency guard, so the query doesn't need to land in the
 * exact same instant every day to avoid a double send; it only needs to
 * never re-select an account it already reminded. `stripe_subscription_id IS
 * NULL` is the same guard `isTrialElapsed` (`lib/billing.ts`) already uses:
 * an account that converted to a paid plan mid-trial is never "about to lose
 * Pro", it's already keeping it.
 *
 * Send THEN mark, deliberately — the fail direction accepted in the Task
 * Intake report. If the mark-as-sent write fails after a successful send,
 * the worst case is one duplicate email on the next daily pass; marking
 * first and sending second would risk the opposite failure — a reminder
 * silently never sent at all, which defeats the entire point of this phase.
 * A duplicate reminder is a cheap, visible cost; a missing one is not.
 */
export async function runTrialReminders({
  service
}: {
  service: ReturnType<typeof createServiceClient>;
}): Promise<{ processed: number; sent: number; skipped: number }> {
  const dueBeforeIso = new Date(Date.now() + REMINDER_WINDOW_MS).toISOString();
  const nowIso = new Date().toISOString();

  const { data: candidates, error } = await service
    .from("profiles")
    .select("id, email, trial_ends_at")
    .not("trial_ends_at", "is", null)
    .is("stripe_subscription_id", null)
    .is("trial_reminder_sent_at", null)
    .lte("trial_ends_at", dueBeforeIso)
    .gt("trial_ends_at", nowIso);

  if (error) {
    console.error("[geo:billing:trial-reminders] failed to load candidate profiles", { message: error.message });
    throw new Error("query_failed");
  }

  let sent = 0;
  let skipped = 0;

  for (const row of (candidates ?? []) as ReminderCandidateRow[]) {
    if (!row.email || !row.trial_ends_at) {
      skipped += 1;
      continue;
    }

    await sendTrialEndingSoonEmail(row.email, new Date(row.trial_ends_at));
    sent += 1;

    const { error: markError } = await service
      .from("profiles")
      .update({ trial_reminder_sent_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("trial_reminder_sent_at", null);

    if (markError) {
      console.error("[geo:billing:trial-reminders] sent the reminder but failed to mark it — next pass may resend", {
        userId: row.id,
        message: markError.message
      });
    }
  }

  return { processed: (candidates ?? []).length, sent, skipped };
}
