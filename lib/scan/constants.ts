import "server-only";

// Raised back to 10 (matching #113) as a deliberate, monitored experiment:
// multi-engine execution (migration 0009) fans each prompt out to one
// concurrent call per active engine — currently up to 2 (Gemini, Claude) — so
// 10 prompts means up to 20 concurrent outbound calls inside the ~60s
// maxDuration budget (Vercel Hobby plan, no headroom to raise maxDuration
// itself — docs/environment-contract.md). This reintroduces the
// Gemini-timeout-under-load risk documented in the ADR 0009 addendum; the
// founder explicitly chose to test 10 in production and measure real-world
// timeout/failure rates via job_logs rather than stage through an
// intermediate value. If GeminiTimeoutError rates rise materially, drop this
// back down (8 was the conservative fallback considered) rather than adding
// execution-side mitigations speculatively.
export const MAX_REAL_SCAN_PROMPTS = 10;
// One row per prompt per active engine (multi-engine execution, migration
// 0009) — currently up to 2 engines (Gemini, Claude), so size for
// MAX_REAL_SCAN_PROMPTS * 2 rather than MAX_REAL_SCAN_PROMPTS alone.
export const MAX_EXTRACTION_RESULTS = MAX_REAL_SCAN_PROMPTS * 2;
/**
 * "grounded-position-v1" — extraction runs with Google Search grounding
 * enabled on the Gemini visibility call
 * (docs/adr/0004-gemini-search-grounding.md) AND per-entity `position` data
 * (docs/adr/0005-average-brand-position.md). citations_count /
 * citation_found reflect real grounding sources only, and
 * extracted_json.brand.position / extracted_json.competitors[].position are
 * populated for the "Average Brand Position" metric. Bumping this version
 * from "grounded-v1" means prior runs (without position data) are
 * distinguishable: run_scores.details_json.brand_position is only present
 * for runs scored from "grounded-position-v1" extractions — see the ADR.
 *
 * "tracked-set-v1" (SCAN-TRACKED-SET-1, docs/adr/0018) — extracted_json.
 * competitors is now reconciled against the project's tracked competitor
 * list (reconcileExtractedCompetitors, lib/scan/extraction.ts) instead of
 * persisting the model's freeform output as-is: entities the model surfaced
 * on its own no longer pollute brand_position / mentioned_competitors_count
 * / standing. Rows with an OLDER extraction_version can have a
 * contaminated competitor set — lib/scoring/run-scoring.ts drops
 * prominence/standing to null for any run containing such a row rather than
 * computing on it silently. No backfill in this phase (SCAN-TRACKED-SET-2).
 */
export const EXTRACTION_VERSION = "tracked-set-v1";

/**
 * "neutral-sim-v1" — marks scan_prompt_results whose
 * raw_response_json.prompt_version was generated with the brand-blind
 * `generateGeminiVisibilityAnswer` prompt (docs/adr/0007-neutral-visibility-simulation.md).
 * Earlier runs sent `Brand:`/`Competitors:` in the generation prompt and a
 * systemInstruction telling Gemini to mention the brand, which made the
 * simulated answer circular (the brand was nearly always mentioned),
 * inflating `visibility_score` toward 100 and pinning `brand.position` to 1.
 * From this version onward, generation is brand-blind; only the separate
 * extraction pass (extractGeminiStructuredData, unchanged) is given the
 * brand/competitors to detect real mentions/position/sentiment in the
 * neutral answer. There is no backfill: old runs simply lack
 * raw_response_json.prompt_version (or have an older value).
 */
export const PROMPT_VERSION = "neutral-sim-v1";
export const ENABLE_SYNC_SCAN_EXECUTION = process.env.ENABLE_SYNC_SCAN_EXECUTION === "true";

/**
 * Bound on per-prompt retry attempts within a single scan run (SCAN-ROBUST-1).
 * `jobs.max_attempts` defaults to 3 (supabase/migrations/0001_v0_schema.sql),
 * but with `MAX_REAL_SCAN_PROMPTS=10` concurrent Gemini calls (SCAN-ROBUST-2,
 * `lib/scan/executor.ts`) inside the ~60s `maxDuration` budget (docs/adr/0003),
 * retrying every failed prompt up to 3 times could exhaust the whole run on a
 * handful of unlucky prompts. Cap the
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
export const SCAN_RUNNING_TIMEOUT_SECONDS = 120;
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
