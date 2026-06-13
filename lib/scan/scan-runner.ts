import "server-only";

// Barrel for the scan-runner module.
//
// The implementation that used to live in this single ~1,300-line file has
// been split into focused modules under `lib/scan/` (PRs 1-7 of the
// scan-runner modular split):
//   - constants.ts       thresholds, error-summary strings, feature flags
//   - types.ts           shared types and ProjectActionError
//   - errors.ts          scan error helpers (sanitize / display mapping)
//   - job-logging.ts     logJob
//   - extraction.ts      runStructuredExtractionForRun
//   - reconciliation.ts  reconcileStuckScanRuns (timeout pass + auto-retry)
//   - run-creation.ts    createPendingScanRun(ForCron)
//   - executor.ts        executePendingScan
//   - launch.ts          launchScan
//
// This file re-exports the public surface so existing call sites and the
// scan-runner.test.ts keep importing from `@/lib/scan/scan-runner` unchanged.
// New code may import from the specific modules above instead.

export {
  ALL_RECOVERABLE_ERROR_SUMMARIES,
  ENABLE_SYNC_SCAN_EXECUTION,
  EXTRACTION_VERSION,
  MAX_EXTRACTION_RESULTS,
  MAX_REAL_SCAN_PROMPTS,
  PROMPT_RETRY_DELAY_MS,
  PROMPT_RETRY_MAX_TOTAL_ATTEMPTS,
  RECONCILE_LOG_PREFIX,
  RECOVERABLE_ERROR_SUMMARIES,
  RETRY_EXHAUSTED_ERROR_SUMMARIES,
  SCAN_NO_RESULTS_ERROR_SUMMARY,
  SCAN_NO_RESULTS_RETRY_EXHAUSTED_ERROR_SUMMARY,
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
export {
  getActionErrorCode,
  getSanitizedScanError,
  getDisplayErrorSummary,
  getRunErrorDisplay
} from "@/lib/scan/errors";
export { reconcileStuckScanRuns } from "@/lib/scan/reconciliation";
export { createPendingScanRun, createPendingScanRunForCron } from "@/lib/scan/run-creation";
export { executePendingScan } from "@/lib/scan/executor";
export { launchScan } from "@/lib/scan/launch";
