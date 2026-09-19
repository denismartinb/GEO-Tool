import "server-only";

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runTrialReminders } from "@/lib/billing/trial-reminders";
import { isAuthorizedInternalRequest } from "@/lib/api/internal-auth";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * TRIAL-REMINDER-3D-1 (founder-approved 2026-09-19). Same auth/kill-switch
 * pattern as /api/cron/weekly-digest: Vercel injects the Authorization
 * header automatically when CRON_SECRET is set, matching vercel.json's
 * schedule. Own, independent kill-switch (CRON_TRIAL_REMINDER_ENABLED) —
 * this endpoint sends customer emails, so it must never turn on just
 * because another cron's flag did (same reasoning as CRON_DIGEST_ENABLED).
 * Disabled by default; the founder turns it on explicitly in Vercel.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!isAuthorizedInternalRequest(request, cronSecret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (process.env.CRON_TRIAL_REMINDER_ENABLED !== "true") {
    return NextResponse.json({ skipped: "cron_trial_reminder_disabled" });
  }

  const service = createServiceClient();

  try {
    const { processed, sent, skipped } = await runTrialReminders({ service });
    return NextResponse.json({ processed, sent, skipped });
  } catch {
    return NextResponse.json({ processed: 0, error: "query_failed" }, { status: 500 });
  }
}
