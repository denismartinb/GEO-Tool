import "server-only";

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isAuthorizedInternalRequest } from "@/lib/api/internal-auth";
import { runLifecycleEmails } from "@/lib/email/lifecycle/runner";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * LIFECYCLE-TRIAL-1 (log §233). Daily at 07:45 UTC (09:45 Madrid in summer,
 * 08:45 in winter): the trial emails D1, D3 and D5. Same auth as every other
 * cron (Vercel sends `CRON_SECRET`); the kill switch is
 * `LIFECYCLE_EMAILS_ENABLED`, read inside `runLifecycleEmails`, so the route
 * ships inert until the founder turns it on.
 */
export async function GET(request: Request) {
  if (!isAuthorizedInternalRequest(request, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runLifecycleEmails({ service: createServiceClient() });
  return NextResponse.json(result, { status: result.status === "query_failed" ? 500 : 200 });
}
