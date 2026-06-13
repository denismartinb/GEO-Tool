import "server-only";

import { ENABLE_SYNC_SCAN_EXECUTION } from "@/lib/scan/constants";
import { type AuthenticatedContext } from "@/lib/scan/types";
import { createPendingScanRun } from "@/lib/scan/run-creation";
import { executePendingScan } from "@/lib/scan/executor";

/**
 * Create a pending run and, when sync execution is enabled, run it to completion
 * in-request. Used by both the manual "launch scan" action and the automatic
 * scan triggered right after a new domain is created.
 * Returns the run id and whether it was executed synchronously.
 */
export async function launchScan({
  projectId,
  supabase,
  user
}: {
  projectId: string;
  supabase: AuthenticatedContext["supabase"];
  user: AuthenticatedContext["user"];
}): Promise<{ runId: string; executed: boolean }> {
  const runId = await createPendingScanRun({ projectId, supabase, user });

  if (ENABLE_SYNC_SCAN_EXECUTION) {
    await executePendingScan({ projectId, runId, supabase });
    return { runId, executed: true };
  }

  return { runId, executed: false };
}
