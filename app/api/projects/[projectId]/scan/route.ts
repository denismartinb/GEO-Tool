import "server-only";
import { NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { executePendingScan, getActionErrorCode, getSanitizedScanError, launchScan } from "@/lib/scan/scan-runner";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ projectId: z.string().uuid() });

/**
 * Manual scan launch (ASYNC-SCAN-1c). Responds as soon as the pending run
 * exists instead of holding the request through the first execution batch,
 * so the client can refresh and show the "Escaneo en curso" banner
 * immediately. Execution starts server-side via `after()` (so a closed tab
 * doesn't strand the run) and is also driven by the runs page's
 * `AutoExecuteScan` foreground loop once the refresh mounts it — the two
 * can never double-process a batch thanks to the atomic job claim
 * (docs/adr/0014).
 */
export async function POST(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_project_id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await launchScan({ projectId: parsed.data.projectId, supabase, user, deferExecution: true });
    after(() =>
      executePendingScan({ projectId: parsed.data.projectId, runId: result.runId, supabase }).catch((error) => {
        // executePendingScan persists sanitized failure state on the run
        // itself; a throw here (e.g. run already claimed by the foreground
        // driver) must not surface as an unhandled rejection.
        console.error("[scan-runner] deferred launch execution failed", {
          projectId: parsed.data.projectId,
          runId: result.runId,
          message: error instanceof Error ? error.message : String(error)
        });
      })
    );
    return NextResponse.json({ runId: result.runId, executed: result.executed });
  } catch (error) {
    return NextResponse.json(
      { error: getActionErrorCode(error), message: getSanitizedScanError(error) },
      { status: 422 }
    );
  }
}
