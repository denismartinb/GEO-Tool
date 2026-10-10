import "server-only";

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runScanDrain } from "@/lib/scan/drain";
import { isAuthorizedInternalRequest } from "@/lib/api/internal-auth";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * SCAN-CRON-DRAIN-1 (log §261): every 5 minutes (`vercel.json`), re-dispatch
 * young scan runs whose self-continuation chain stopped — Vercel cuts those
 * chains with 508 after a few hops, and a cron firing is what starts a fresh
 * one. See `lib/scan/drain.ts`.
 *
 * Not gated on `CRON_SCANS_ENABLED`, same reasoning as the watchdog: that
 * switch stops the sweep from STARTING scans; this only carries on runs that
 * already exist, which a page view of the project would also do.
 */
export async function GET(request: Request) {
  if (!isAuthorizedInternalRequest(request, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runScanDrain({ service: createServiceClient() });
    if (summary.dispatched > 0) console.info("[geo:scan:drain] pass summary", summary);
    return NextResponse.json(summary);
  } catch (error) {
    console.error("[geo:scan:drain] pass failed", {
      message: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json({ error: "scan_drain_failed" }, { status: 500 });
  }
}
