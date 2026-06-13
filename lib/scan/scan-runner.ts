import "server-only";

import { ENABLE_SYNC_SCAN_EXECUTION } from "@/lib/scan/constants";
import { type AuthenticatedContext } from "@/lib/scan/types";
import { createPendingScanRun } from "@/lib/scan/run-creation";
import { executePendingScan } from "@/lib/scan/executor";

// Barrel re-exports: keep the public surface of `@/lib/scan/scan-runner`
// unchanged after extracting constants and types into their own leaf modules
// (PR 1 of the scan-runner modular split). External call sites must continue
// to import everything from here.
export {
  ENABLE_SYNC_SCAN_EXECUTION,
  EXTRACTION_VERSION,
  MAX_EXTRACTION_RESULTS,
  MAX_REAL_SCAN_PROMPTS,
  RECONCILE_LOG_PREFIX,
  RETRY_EXHAUSTED_ERROR_SUMMARIES,
  SCAN_PENDING_TIMEOUT_ERROR_SUMMARY,
  SCAN_PENDING_TIMEOUT_RETRY_EXHAUSTED_ERROR_SUMMARY,
  SCAN_PENDING_TIMEOUT_SECONDS,
  SCAN_RUNNING_TIMEOUT_SECONDS,
  SCAN_TIMEOUT_AUTO_RETRY_CAP,
  SCAN_TIMEOUT_ERROR_SUMMARY,
  SCAN_TIMEOUT_RETRY_EXHAUSTED_ERROR_SUMMARY,
  SCAN_TIMEOUT_RETRY_LOOKBACK_HOURS,
  TIMEOUT_ERROR_SUMMARIES
} from "@/lib/scan/constants";
export {
  ProjectActionError,
  type AuthenticatedContext,
  type JobRow,
  type ProjectActionErrorCode,
  type RunErrorDisplay,
  type RunErrorDisplayKind,
  type ScanPromptResultRow
} from "@/lib/scan/types";

// Barrel re-exports: the scan error helpers now live in `@/lib/scan/errors`
// (PR 2 of the scan-runner modular split). They are re-exported here so
// external call sites and the existing scan-runner.test.ts keep importing
// them from `@/lib/scan/scan-runner` unchanged.
export {
  getActionErrorCode,
  getSanitizedScanError,
  getDisplayErrorSummary,
  getRunErrorDisplay
} from "@/lib/scan/errors";

// Barrel re-exports: the timeout reconciliation pass and the scan-run
// creation flow now live in `@/lib/scan/reconciliation` and
// `@/lib/scan/run-creation` (PR 5 of the scan-runner modular split). They are
// re-exported here so external call sites keep importing from
// `@/lib/scan/scan-runner` unchanged. `createPendingScanRunCore` stays
// internal to run-creation.ts and is deliberately not part of this surface.
export { reconcileStuckScanRuns } from "@/lib/scan/reconciliation";
export { createPendingScanRun, createPendingScanRunForCron } from "@/lib/scan/run-creation";

// Barrel re-export: the scan executor now lives in `@/lib/scan/executor`
// (PR 6 of the scan-runner modular split). Re-exported here so external call
// sites (e.g. the weekly-scans cron route) keep importing it from
// `@/lib/scan/scan-runner` unchanged. Also imported above for internal use by
// launchScan.
export { executePendingScan } from "@/lib/scan/executor";

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
