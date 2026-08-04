import "server-only";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { MAX_AUDIT_WORKER_CHAIN, processDueWebAuditJobs } from "@/lib/web-audit/audit-job-runner";
import { isAutoWebAuditEnabled, triggerWebAuditRun } from "@/lib/web-audit/audit-dispatch";

/**
 * `chainIndex` counts self-dispatches within one chain. Absent (or 0) on the
 * two entry points — the executor's `after()` and the daily sweep. The cap is
 * a hard backstop under the per-job continuation cap: even if every claimed
 * job parks for continuation forever, the chain terminates and the daily
 * sweep restarts it, instead of a serverless function calling itself without
 * end.
 */
const bodySchema = z.object({
  chainIndex: z.number().int().min(0).max(MAX_AUDIT_WORKER_CHAIN).optional()
});

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * AUDIT-AFTER-SCAN-1 — worker endpoint for the post-scan web audit queue.
 *
 * Not user-facing. Three callers, in descending order of how fast they get
 * the audit onto the screen:
 *
 *   1. the scan executor, via `after()` the moment a run completes — the
 *      fast path, so the audit lands minutes after the scan;
 *   2. itself, when a coverage campaign was parked mid-flight (the campaign
 *      spans many batched calls, exactly like `/api/scan/continue`
 *      (docs/adr/0014) and `/api/cron/sweep-continue` (docs/adr/0016));
 *   3. the daily Vercel cron below — the safety net that recovers anything
 *      whose dispatch was lost and picks up retries that have come due.
 *
 * (3) is why the queue exists at all: a lost `after()` must not mean a
 * silently missing audit. It runs at 07:00, an hour after the daily scan
 * sweep, so the day's automatic scans have finished queueing their audits.
 *
 * `GET` is Vercel's cron entry point (crons are always GET); `POST` carries
 * `chainIndex` for the self-dispatch. Both require `CRON_SECRET` — the same
 * secret Vercel sends to `/api/cron/weekly-scans`.
 */
export async function POST(request: Request) {
  const denied = rejectUnauthorized(request);
  if (denied) return denied;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  return runWorker(parsed.data.chainIndex ?? 0);
}

/** Vercel's cron entry point. Always starts a fresh chain. */
export async function GET(request: Request) {
  const denied = rejectUnauthorized(request);
  if (denied) return denied;

  return runWorker(0);
}

function rejectUnauthorized(request: Request): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

async function runWorker(chainIndex: number) {
  if (!isAutoWebAuditEnabled()) {
    return NextResponse.json({ skipped: "auto_web_audit_disabled" });
  }

  const service = createServiceClient();

  try {
    const { processed, outcomes, hasMoreWork } = await processDueWebAuditJobs({ service });

    const continuationScheduled = hasMoreWork && chainIndex + 1 < MAX_AUDIT_WORKER_CHAIN;
    if (continuationScheduled) {
      after(() => triggerWebAuditRun({ chainIndex: chainIndex + 1 }));
    }

    return NextResponse.json({
      processed,
      results: outcomes.map((o) => o.result),
      continuationScheduled
    });
  } catch (error) {
    // Never leak a raw Postgres/provider error to the caller. The jobs
    // themselves are durable — whatever failed here is retried by the sweep.
    console.error("[geo:audit-after-scan] worker invocation failed", {
      message: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json({ processed: 0, error: "run_failed" }, { status: 500 });
  }
}
