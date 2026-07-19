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
  user,
  onlyPromptIds,
  deferExecution = false
}: {
  projectId: string;
  supabase: AuthenticatedContext["supabase"];
  user: AuthenticatedContext["user"];
  /** See `createPendingScanRunCore`'s `onlyPromptIds` (ADD-PROMPTS-BACKEND-1). */
  onlyPromptIds?: string[];
  /**
   * When true, only create the pending run and return immediately — the
   * caller owns kicking off execution (ASYNC-SCAN-1c: the manual scan route
   * responds as soon as the run exists so the UI shows "Escaneo en curso" at
   * once, then starts execution via `after()`; the runs page's
   * `AutoExecuteScan` driver picks the run up on refresh as well). Callers
   * that need the run finished within their own request (add-prompts partial
   * launch) keep the default.
   */
  deferExecution?: boolean;
}): Promise<{ runId: string; executed: boolean }> {
  const runId = await createPendingScanRun({ projectId, supabase, user, onlyPromptIds });

  if (ENABLE_SYNC_SCAN_EXECUTION && !deferExecution) {
    await executePendingScan({ projectId, runId, supabase });
    return { runId, executed: true };
  }

  return { runId, executed: false };
}
