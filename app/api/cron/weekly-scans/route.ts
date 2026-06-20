import "server-only";

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runDailyCronScan } from "@/lib/scan/cron";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (process.env.CRON_SCANS_ENABLED !== "true") {
    return NextResponse.json({ skipped: "cron_scans_disabled" });
  }

  const service = createServiceClient();

  try {
    const { processed, scanned, results } = await runDailyCronScan({ service });
    return NextResponse.json({ processed, scanned, results });
  } catch {
    return NextResponse.json({ processed: 0, error: "query_failed" }, { status: 500 });
  }
}
