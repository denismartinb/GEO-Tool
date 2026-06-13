import "server-only";

export const MAX_REAL_SCAN_PROMPTS = 10;
export const MAX_EXTRACTION_RESULTS = 10;
export const EXTRACTION_VERSION = "gemini-extraction-v1";
export const ENABLE_SYNC_SCAN_EXECUTION = process.env.ENABLE_SYNC_SCAN_EXECUTION === "true";

/**
 * Timeout thresholds for the scan lifecycle reconciliation pass, per
 * docs/scan-lifecycle.md ("Timeout detection") and
 * docs/adr/0003-sync-scan-execution-and-maxduration.md. A `running` row older
 * than this is presumed to have been killed by the Vercel function timeout
 * without updating its status; a `pending` row older than this never got
 * picked up and is considered stale.
 */
export const SCAN_RUNNING_TIMEOUT_SECONDS = 90;
export const SCAN_PENDING_TIMEOUT_SECONDS = 300;

/**
 * Internal-only `error_summary` values stored on `scan_runs` rows when the
 * reconciliation pass (`reconcileStuckScanRuns`) detects a stuck `running` or
 * `pending` row. These values are never shown verbatim to the user — see
 * `getDisplayErrorSummary` for the user-facing mapping — but are kept
 * descriptive in the DB for diagnostics (sanitized: no raw provider errors,
 * no secrets).
 *
 * The `_retry_exhausted` variants are used when the auto-retry cap
 * (`SCAN_TIMEOUT_AUTO_RETRY_CAP`) has already been reached for this project,
 * so this occurrence will NOT trigger another auto-retry.
 */
export const SCAN_TIMEOUT_ERROR_SUMMARY = "scan_timeout";
export const SCAN_PENDING_TIMEOUT_ERROR_SUMMARY = "scan_pending_timeout";
export const SCAN_TIMEOUT_RETRY_EXHAUSTED_ERROR_SUMMARY = "scan_timeout_retry_exhausted";
export const SCAN_PENDING_TIMEOUT_RETRY_EXHAUSTED_ERROR_SUMMARY = "scan_pending_timeout_retry_exhausted";

/**
 * The set of internal `error_summary` values that mean "this run failed
 * because the reconciliation pass detected it was stuck (timed out)", used
 * both to count prior timeout-failures for the auto-retry cap and to decide
 * how to render the run in the UI (`getDisplayErrorSummary`).
 */
export const TIMEOUT_ERROR_SUMMARIES = new Set<string>([
  SCAN_TIMEOUT_ERROR_SUMMARY,
  SCAN_PENDING_TIMEOUT_ERROR_SUMMARY,
  SCAN_TIMEOUT_RETRY_EXHAUSTED_ERROR_SUMMARY,
  SCAN_PENDING_TIMEOUT_RETRY_EXHAUSTED_ERROR_SUMMARY
]);

export const RETRY_EXHAUSTED_ERROR_SUMMARIES = new Set<string>([
  SCAN_TIMEOUT_RETRY_EXHAUSTED_ERROR_SUMMARY,
  SCAN_PENDING_TIMEOUT_RETRY_EXHAUSTED_ERROR_SUMMARY
]);

/**
 * Auto-retry cap for timeout-caused failures (docs/scan-lifecycle.md,
 * "Timeout detection"; reliability ADR — see PR #78).
 *
 * Rationale: a single timeout could be transient (e.g. a slow Gemini call
 * that happened to land near the maxDuration boundary), so the FIRST time a
 * project's scan times out, `reconcileStuckScanRuns` automatically launches a
 * fresh `pending` run for that project — the user doesn't have to click
 * "Lanzar escaneo" again.
 *
 * If a project's scans STRUCTURALLY cannot finish within
 * SCAN_RUNNING_TIMEOUT_SECONDS (too many prompts, persistent Gemini latency,
 * etc.), every retry would also time out, so auto-retrying forever would
 * burn Gemini quota in an infinite loop. The cap stops this: once a project
 * has `SCAN_TIMEOUT_AUTO_RETRY_CAP` timeout-failed runs within the lookback
 * window, the next timeout is recorded as terminal `failed`
 * (`*_retry_exhausted`) with NO further auto-retry, and the user must launch
 * manually (which surfaces a calmer "couldn't complete" message, not the raw
 * timeout wording).
 *
 * Cap = 1 (one free auto-retry per lookback window). Enforced in
 * `reconcileStuckScanRuns` by counting prior `failed` rows for the same
 * `project_id` whose `error_summary` is in TIMEOUT_ERROR_SUMMARIES and whose
 * `created_at` falls within SCAN_TIMEOUT_RETRY_LOOKBACK_HOURS.
 */
export const SCAN_TIMEOUT_AUTO_RETRY_CAP = 1;

/**
 * Lookback window for counting prior timeout-failures when enforcing
 * SCAN_TIMEOUT_AUTO_RETRY_CAP. 24h is long enough to catch a same-day retry
 * storm but short enough that a project which had a one-off timeout
 * yesterday gets a fresh auto-retry budget today.
 */
export const SCAN_TIMEOUT_RETRY_LOOKBACK_HOURS = 24;

export const RECONCILE_LOG_PREFIX = "[geo:scan:reconcile]";
