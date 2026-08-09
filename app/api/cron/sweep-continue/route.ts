import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveMaxSweepChainInvocations, runDailyCronScan } from "@/lib/scan/cron";
import { isAuthorizedInternalRequest } from "@/lib/api/internal-auth";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * A legitimately dispatched chainIndex is always in [1, cap-1]: the dispatch
 * side only chains while `chainIndex + 1 < maxChainInvocations`. Built per
 * request so the bound tracks the env-configured cap, mirroring the
 * dispatch-side check instead of a looser hardcoded sanity number.
 */
function bodySchema() {
  return z.object({
    chainIndex: z.number().int().min(1).max(resolveMaxSweepChainInvocations() - 1)
  });
}

/**
 * Internal continuation endpoint for the self-chaining daily recurring-scan
 * sweep (ASYNC-SCAN-1a, docs/adr/0016). `runDailyCronScan` dispatches a POST
 * here (via `after()`, fire-and-forget) when candidates were deferred by the
 * per-invocation project cap or time budget, so the next batch of projects
 * runs in its own fresh 60s-budgeted invocation — same pattern as
 * `/api/scan/continue` (docs/adr/0014), one level up: projects instead of
 * prompt batches. Not user-facing — authenticated by `CRON_SECRET`, the same
 * secret Vercel sends to `/api/cron/weekly-scans`, and gated by the same
 * `CRON_SCANS_ENABLED` kill switch so disabling the cron also stops any
 * in-flight chain.
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!isAuthorizedInternalRequest(request, cronSecret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (process.env.CRON_SCANS_ENABLED !== "true") {
    return NextResponse.json({ skipped: "cron_scans_disabled" });
  }

  const parsed = bodySchema().safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const service = createServiceClient();

  try {
    const { processed, scanned, results, deferred, continuationScheduled } = await runDailyCronScan({
      service,
      chainIndex: parsed.data.chainIndex
    });
    return NextResponse.json({ processed, scanned, results, deferred, continuationScheduled });
  } catch {
    return NextResponse.json({ processed: 0, error: "query_failed" }, { status: 500 });
  }
}
