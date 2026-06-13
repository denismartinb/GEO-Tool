import "server-only";

export const MAX_REAL_SCAN_PROMPTS = 6;
export const MAX_EXTRACTION_RESULTS = 10;
export const EXTRACTION_VERSION = "gemini-extraction-v1";
export const ENABLE_SYNC_SCAN_EXECUTION = process.env.ENABLE_SYNC_SCAN_EXECUTION === "true";

/**
 * Bound on per-prompt retry attempts within a single scan run (SCAN-ROBUST-1).
 * `jobs.max_attempts` defaults to 3 (supabase/migrations/0001_v0_schema.sql),
 * but with `MAX_REAL_SCAN_PROMPTS=6` sequential Gemini calls inside the ~60s
 * `maxDuration` budget (docs/adr/0003), retrying every failed prompt up to 3
 * times could exhaust the whole run on a handful of unlucky prompts. Cap the
 * TOTAL attempts (first try + retries) per prompt at 2 — i.e. exactly one
 * retry — regardless of `max_attempts`, while still honoring a lower
 * `max_attempts` if a job ever has one. The retry is only taken for
 * *recoverable* per-prompt errors (HTTP failure, empty response, rate limit,
 * `GeminiTimeoutError`) — see `lib/scan/executor.ts`.
 */
export const PROMPT_RETRY_MAX_TOTAL_ATTEMPTS = 2;

/**
 * Delay before retrying a failed prompt within the same run. Kept short
 * because the retry must fit inside the same ~60s run budget alongside the
 * remaining prompts.
 */
export const PROMPT_RETRY_DELAY_MS = 500;

/**
 * Timeout thresholds for the scan lifecycle reconciliation pass, per
 * docs/scan-lifecycle.md ("Timeout detection") and
 * docs/adr/0003-sync-scan-execution-and-maxduration.md. A `running` row older
 * than this is presumed to have been killed by the Vercel function timeout
 * without updating its status; a `pending` row older than this never got
 * picked up and is considered stale.
 */
/**
 * 180s (raised from 120s). Worst case under SCAN-ROBUST-1's per-prompt retry
 * (PROMPT_RETRY_MAX_TOTAL_ATTEMPTS=2, each attempt up to the Gemini call
 * timeout, plus PROMPT_RETRY_DELAY_MS between attempts), MAX_REAL_SCAN_PROMPTS=6
 * sequential prompts can legitimately take close to or over 120s without any
 * single call failing outright (~6 * (2 * 20s + 0.5s) ~= 243s worst case).
 * 120s was too tight and caused reconcileStuckScanRuns to mark genuinely
 * in-flight runs as "failed" mid-execution, which (before the idempotency
 * guards above) produced orphaned duplicate auto-retry runs. 180s comfortably
 * covers realistic multi-retry runs while still catching genuinely hung runs
 * (e.g. a request that never returns and isn't caught by the per-call
 * timeout).
 */
export const SCAN_RUNNING_TIMEOUT_SECONDS = 180;
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

/**
 * `scan_runs.error_summary` written by `executor.ts` when the prompt loop
 * finishes with `successful_prompts === 0` (every prompt failed, but each
 * failure was individually recoverable — see docs/scan-lifecycle.md). Unlike
 * `GeminiConfigError` (missing API key / invalid model, which remains a
 * terminal, never-retried failure), zero successful prompts is treated as a
 * SCAN-ROBUST-1 auto-retry candidate, same bounded cap/lookback as timeouts
 * (`reconcileStuckScanRuns`).
 *
 * This is a sanitized, user-facing string (per `getSanitizedScanError`), not
 * an internal code — it is shown directly when no retry is in flight, and
 * mapped to the "Reintentando…" notice while a retry has just been
 * triggered, mirroring TIMEOUT_ERROR_SUMMARIES.
 */
export const SCAN_NO_RESULTS_ERROR_SUMMARY = "No se ha obtenido ningún resultado del escaneo.";

/**
 * Terminal variant written once the SCAN_NO_RESULTS_ERROR_SUMMARY auto-retry
 * cap has been reached for this project (no further auto-retry).
 */
export const SCAN_NO_RESULTS_RETRY_EXHAUSTED_ERROR_SUMMARY =
  "No se ha obtenido ningún resultado del escaneo (reintento agotado).";

/**
 * The full set of `error_summary` values that `reconcileStuckScanRuns`
 * treats as recoverable and counts toward SCAN_TIMEOUT_AUTO_RETRY_CAP within
 * SCAN_TIMEOUT_RETRY_LOOKBACK_HOURS (SCAN-ROBUST-1: generalizes the
 * timeout-only auto-retry from PR #78 to also cover "zero successful
 * prompts"). Excludes the `_retry_exhausted` variants, which are terminal and
 * must not themselves count as new failures eligible for retry (they were
 * already counted when first recorded).
 */
export const RECOVERABLE_ERROR_SUMMARIES = new Set<string>([
  SCAN_TIMEOUT_ERROR_SUMMARY,
  SCAN_PENDING_TIMEOUT_ERROR_SUMMARY,
  SCAN_NO_RESULTS_ERROR_SUMMARY
]);

export const RETRY_EXHAUSTED_ERROR_SUMMARIES = new Set<string>([
  SCAN_TIMEOUT_RETRY_EXHAUSTED_ERROR_SUMMARY,
  SCAN_PENDING_TIMEOUT_RETRY_EXHAUSTED_ERROR_SUMMARY,
  SCAN_NO_RESULTS_RETRY_EXHAUSTED_ERROR_SUMMARY
]);

/**
 * Union of RECOVERABLE_ERROR_SUMMARIES and RETRY_EXHAUSTED_ERROR_SUMMARIES:
 * every `error_summary` that counts toward SCAN_TIMEOUT_AUTO_RETRY_CAP when
 * computing how many recoverable failures a project has had within
 * SCAN_TIMEOUT_RETRY_LOOKBACK_HOURS (a `_retry_exhausted` row still counts as
 * "one of the failures in this retry storm" for the purposes of the cap).
 */
export const ALL_RECOVERABLE_ERROR_SUMMARIES = new Set<string>([
  ...RECOVERABLE_ERROR_SUMMARIES,
  ...RETRY_EXHAUSTED_ERROR_SUMMARIES
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
