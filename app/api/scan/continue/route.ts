import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { executePendingScan } from "@/lib/scan/scan-runner";
import { createServiceClient } from "@/lib/supabase/service";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  projectId: z.string().uuid(),
  runId: z.string().uuid()
});

/**
 * Internal continuation endpoint for a multi-batch scan campaign
 * (SCAN-CHAIN-1, docs/adr/0014-batched-self-chaining-scan-execution.md).
 * `executePendingScan` calls this (via `after()`, fire-and-forget) after
 * finishing one batch of MAX_REAL_SCAN_PROMPTS when prompt jobs are still
 * pending, so the next batch runs in its own fresh 60s-budgeted invocation
 * instead of trying to fit an entire large campaign inside one function
 * call. Not user-facing — authenticated by a shared secret (mirrors
 * `/api/cron/weekly-scans`), same as any other system-triggered execution
 * path in this codebase.
 */
export async function POST(request: Request) {
  const secret = process.env.SCAN_CONTINUE_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { projectId, runId } = parsed.data;
  const service = createServiceClient();

  try {
    await executePendingScan({ projectId, runId, supabase: service });
    return NextResponse.json({ ok: true });
  } catch (error) {
    // executePendingScan already persists the sanitized failure state on the
    // run itself; this response code is only informational for logs.
    console.error("[scan-runner] /api/scan/continue batch failed", {
      projectId,
      runId,
      message: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
