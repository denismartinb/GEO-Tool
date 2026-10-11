import "server-only";

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runDailyCronScan } from "@/lib/scan/cron";
import { isAuthorizedInternalRequest } from "@/lib/api/internal-auth";
import { withCronMonitor } from "@/lib/observability/cron-monitor";
import { reportError } from "@/lib/observability/report-error";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function handleGet(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!isAuthorizedInternalRequest(request, cronSecret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (process.env.CRON_SCANS_ENABLED !== "true") {
    return NextResponse.json({ skipped: "cron_scans_disabled" });
  }

  const service = createServiceClient();

  try {
    const { processed, scanned, results, deferred, continuationScheduled } = await runDailyCronScan({ service });
    return NextResponse.json({ processed, scanned, results, deferred, continuationScheduled });
  } catch (error) {
    await reportError(error, "cron:weekly-scans");
    return NextResponse.json({ processed: 0, error: "query_failed" }, { status: 500 });
  }
}

// OBSERVABILITY-1 (log §300): Sentry Cron Monitor — missed, timed-out and
// 5xx runs open an issue (lib/observability/cron-monitor.ts).
export const GET = withCronMonitor("/api/cron/weekly-scans", handleGet);
