import "server-only";

import { NextResponse } from "next/server";
import { isAuthorizedInternalRequest } from "@/lib/api/internal-auth";
import { withCronMonitor } from "@/lib/observability/cron-monitor";
import { runWeeklySeoTracking } from "@/lib/seo-tracking/weekly";
import { createServiceClient } from "@/lib/supabase/service";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * SEO-TRACK-1 (log §345, §346). Every 10 minutes ("*\/10 * * * *", pg_cron,
 * migration 0045, log §347): the weekly Google Top 20 of every tracked keyword, from
 * DataForSEO. Each pass takes what is still pending for the week (new
 * keywords, or all of them once a new week starts on Monday UTC); a pass with
 * nothing pending makes no provider call. Writes are idempotent per keyword
 * and week, so a manual re-run (same `CRON_SECRET`) never pays twice.
 */
async function handleGet(request: Request) {
  if (!isAuthorizedInternalRequest(request, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary = await runWeeklySeoTracking(createServiceClient());
  if (summary.status !== "ran") return NextResponse.json(summary);

  console.info("[geo:seo-serp] pass", {
    weekStart: summary.weekStart,
    pending: summary.pending,
    saved: summary.serp.saved,
    deferred: summary.serp.deferred,
    errors: summary.serp.errors,
    stoppedBy: summary.serp.stoppedBy,
    spentUsd: Number(summary.serp.spentUsd.toFixed(4)),
    backlinksRefreshed: summary.backlinksRefreshed,
    overCap: summary.overCap
  });
  return NextResponse.json(summary);
}

export const GET = withCronMonitor("/api/cron/seo-serp", handleGet);
