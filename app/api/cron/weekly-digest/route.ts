import "server-only";

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runWeeklyDigest } from "@/lib/scan/weekly-digest";
import { isAuthorizedInternalRequest } from "@/lib/api/internal-auth";
import { withCronMonitor } from "@/lib/observability/cron-monitor";
import { reportError } from "@/lib/observability/report-error";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * ALERTS-1 Fase 6b. Same auth/kill-switch pattern as
 * /api/cron/weekly-scans: Vercel injects the Authorization header
 * automatically when CRON_SECRET is set on the project, matching
 * vercel.json's schedule ("0 8 * * 1" — every Monday). Disabled by default
 * via CRON_DIGEST_ENABLED so the feature ships inert until the founder
 * explicitly turns it on in Vercel.
 */
async function handleGet(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!isAuthorizedInternalRequest(request, cronSecret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (process.env.CRON_DIGEST_ENABLED !== "true") {
    return NextResponse.json({ skipped: "cron_digest_disabled" });
  }

  const service = createServiceClient();

  try {
    const { processed, sent, skipped } = await runWeeklyDigest({ service });
    return NextResponse.json({ processed, sent, skipped });
  } catch (error) {
    await reportError(error, "cron:weekly-digest");
    return NextResponse.json({ processed: 0, error: "query_failed" }, { status: 500 });
  }
}

// OBSERVABILITY-1 (log §299): Sentry Cron Monitor — missed, timed-out and
// 5xx runs open an issue (lib/observability/cron-monitor.ts).
export const GET = withCronMonitor("/api/cron/weekly-digest", handleGet);
