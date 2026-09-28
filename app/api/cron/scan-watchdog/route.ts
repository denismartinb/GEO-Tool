import "server-only";

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runScanWatchdog } from "@/lib/scan/watchdog";
import { isAuthorizedInternalRequest } from "@/lib/api/internal-auth";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * ALERTS-ALWAYS-1: every 15 minutes (`vercel.json`), reconcile stalled scans
 * across every project and email the operator about anything a customer is no
 * longer getting. See `lib/scan/watchdog.ts`.
 *
 * Deliberately NOT gated on `CRON_SCANS_ENABLED`: that switch stops the sweep
 * from STARTING scans, while this route mostly reads and alerts. The one
 * thing it can start — an auto-retry from `reconcileStuckScanRuns` — is the
 * same thing any page view of the project already does.
 */
export async function GET(request: Request) {
  if (!isAuthorizedInternalRequest(request, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runScanWatchdog({ service: createServiceClient() });
    console.info("[geo:scan:watchdog] pass summary", summary);
    return NextResponse.json(summary);
  } catch (error) {
    console.error("[geo:scan:watchdog] pass failed", {
      message: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json({ error: "watchdog_failed" }, { status: 500 });
  }
}
