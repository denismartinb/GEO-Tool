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
/**
 * How many extraction calls may be in flight at once
 * (EXTRACTION-RELIABILITY-1, docs/adr/0029).
 *
 * This replaces the former `MAX_EXTRACTION_RESULTS` cap (= 20), which was a
 * *row* limit rather than a concurrency limit and silently discarded every
 * eligible row past the 20th. It was sized when a run was a single batch;
 * SCAN-CHAIN-1 made a campaign span many batches (up to the plan's prompt
 * cap × active engines — 300 rows on Pro), and the cap was never revisited,
 * so a 30-row run persisted 20 extractions and left 10 rows permanently
 * unprocessed with no error and no log. Measured on production data
 * (2026-08-04): `procesadas + con_error` summed to exactly 20 on every
 * 30-row run, across every project.
 *
 * A concurrency limit is the right shape for the real constraint. Extraction
 * requests are the heaviest in the pipeline (full schema instruction + the
 * entire raw response), and the old code dispatched all of them at once via
 * `Promise.allSettled`, which is a good way to manufacture the very 429s
 * that then killed every row. 4 keeps the pass moving without bursting.
 */
export const EXTRACTION_CONCURRENCY = 4;


/**
 * Wall-clock budget for **all** the work one `executePendingScan` invocation
 * may do, measured from the moment it starts — not a per-pass allowance.
 *
 * This is a shared deadline on purpose, and the distinction is what a first
 * cut of EXTRACTION-RELIABILITY-1 got wrong in production (IKEA run
 * 9608d861, 2026-08-04, `scan_timeout` after 190.9s with all 26 prompts
 * generated fine). That version gave each extraction pass its own fixed 25s.
 * The invocation that processes the *last* batch runs three things in a row —
 * generation (~20s), that batch's extraction pass (25s), then the finalize
 * sweep (another 25s) — which is ~70s of work inside a 60s `maxDuration`.
 * Vercel killed it mid-sweep, so it never reached the code that releases the
 * finalize job or writes progress, and the campaign stalled until the
 * reconciliation pass failed it.
 *
 * One absolute deadline for the whole invocation makes that arithmetic
 * impossible: whatever generation spends, extraction gets what is left and
 * not a millisecond more, and a pass that finds no budget simply defers its
 * rows to the next invocation instead of overrunning. 45s leaves headroom
 * under the 60s ceiling for the finalize bookkeeping, scoring and
 * recommendations that follow.
 */
export const SCAN_INVOCATION_WORK_BUDGET_MS = 45_000;

/**
 * What one `executePendingScan` call may cost its caller in the worst case:
 * the work budget above, plus the bookkeeping that is deliberately outside it
 * (the finalize claim, scoring, recommendations, the run's own status write).
 *
 * Only the foreground driver needs this. `autoExecutePendingScan` loops
 * batches inside a single server action, and it used to decide whether to keep
 * going by checking elapsed time *after* an iteration
 * (`do { ... } while (elapsed < budget)`). That asks the wrong question: an
 * iteration starting at 39s looks fine by a 40s budget and can still spend
 * another 45s, putting the action ~24s past the 60s `maxDuration`. Vercel then
 * kills it mid-batch — and before PROMPT_LOCK_LEASE_MS existed, the jobs that
 * invocation had claimed were stranded `running` for good.
 *
 * This is the same mistake, in the same pipeline, that `docs/adr/0029`'s
 * Addendum documented one level down ("budget new work against the invocation,
 * not against itself"); the driver above it was never re-checked.
 */
export const SCAN_INVOCATION_WORST_CASE_MS = 50_000;

/**
 * How far into its `maxDuration=60s` budget the foreground driver may still
 * *start* another `executePendingScan` call. The 5s below the ceiling covers
 * the driver's own tail (the run-status read, `revalidatePath`, serializing
 * the response) so that returning "running" to the client is itself never the
 * thing that overruns.
 */
export const AUTO_EXECUTE_SAFE_CEILING_MS = 55_000;

/**
 * How long a claimed `scan_finalize` job may stay `running` before another
 * invocation is allowed to take it over.
 *
 * Finalize used to be near-instant, so a claim that was never released could
 * not realistically happen. Since extraction runs inside the finalize step it
 * is long enough to be killed mid-flight, and `reconcileStuckScanRuns` only
 * ever touches `scan_runs` — it never releases a `jobs` row. Without a lease,
 * one killed invocation strands the campaign permanently: every later
 * invocation fails the `status = 'pending'` claim, returns immediately, and
 * nothing writes progress again (exactly the 2026-08-04 IKEA failure).
 *
 * The takeover is still exclusive: the claim is an `UPDATE ... WHERE
 * locked_at < now - lease RETURNING`, so whichever invocation commits first
 * moves `locked_at` and every racing one stops matching — the same atomic
 * claim pattern the prompt batches already use. 90s is comfortably longer
 * than any live invocation (capped at 45s of work above), so a lease can only
 * expire on an invocation that is genuinely gone.
 */
export const FINALIZE_LOCK_LEASE_MS = 90_000;

/**
 * How long a claimed `scan_prompt` job may stay `running` before another
 * invocation is allowed to take it over (SCAN-DRIVE-1).
 *
 * The same argument that gave `scan_finalize` a lease applies here and was
 * simply never extended to the prompt batches: a batch spends tens of seconds
 * on concurrent provider calls, so the invocation holding it is long enough to
 * be killed by Vercel's `maxDuration`, and a killed invocation cannot release
 * the jobs it claimed. `reconcileStuckScanRuns` only ever touches `scan_runs`,
 * never `jobs`, so without a lease those rows stay `running` forever: every
 * later invocation's claim (`WHERE status = 'pending'`) skips them, the
 * campaign can never reach "every prompt job terminal", and finalize is
 * unreachable even though the run looks alive.
 *
 * 90s matches FINALIZE_LOCK_LEASE_MS and is comfortably longer than any live
 * invocation (capped at SCAN_INVOCATION_WORK_BUDGET_MS of work), so a lease
 * can only expire on an invocation that is genuinely gone.
 */
export const PROMPT_LOCK_LEASE_MS = 90_000;

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
 *
 * "verified-mention-v1" (MENTION-VERIFY-1, docs/adr/0021) — brand.mentioned
 * and competitors[].mentioned are now verified against the raw response text
 * (verifyExtractedMentions, lib/scan/extraction.ts) before persistence,
 * instead of trusting the extraction model's "mentioned: true" claim as-is.
 * Root cause: the extraction prompt (shared shape across
 * extractGeminiStructuredData/extractClaudeStructuredData/
 * extractOpenAIStructuredData) never required "mentioned" to be based on the
 * entity's name genuinely appearing in the text, so a topically-relevant but
 * brand-silent response could be flagged as a mention with fabricated
 * "evidence" — observed in production for a brand whose name reads as a
 * generic description of its own product category. Bumping this version
 * means `hasUntrustedCompetitorSet` (lib/scoring/run-scoring.ts) — already
 * keyed on any extraction_version mismatch, not specifically ADR 0018's
 * concern — now ALSO drops prominence/standing/geo_score-confidence to null
 * for any run containing a pre-this-fix row, for free, with no new gating
 * code. `visibility_score`/`competitor_gap_score` themselves are NOT nulled:
 * consistent with the boundary ADR 0018 itself already drew (it never
 * touched these two fields either), and every NEW scan's brand_mentioned is
 * already verified at write time regardless — see docs/adr/0021 for why a
 * broader nullable-everywhere gate was considered and rejected as
 * disproportionate to a narrow within-run mixed-version edge case. No
 * backfill in this phase (MENTION-VERIFY-2).
 */
export const EXTRACTION_VERSION = "verified-mention-v1";

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

/**
 * Marker written to `job_logs` whenever an operator scan-health alert is sent
 * (EXTRACTION-RELIABILITY-1 Fase B, docs/adr/0029). Doubles as the dedupe
 * store's lookup key — see `alreadyAlerted` in lib/scan/scan-health-alert.ts
 * for why `job_logs` rather than `notifications` or a new table.
 */
export const SCAN_HEALTH_ALERT_LOG_MESSAGE = "scan_health_alert_sent";

/**
 * Written to `job_logs` when a run HAS alert-worthy findings but the channel
 * cannot deliver them (no `OPS_ALERT_EMAIL`, no `RESEND_API_KEY`, or the send
 * threw).
 *
 * A `console.error` alone was not enough: Vercel runtime logs are short-lived
 * and awkward to reach, so when the first real verification of this phase
 * produced no email, the reason was unreachable and the failure could not be
 * told apart from "there was nothing to report" (2026-08-05). Persisting the
 * breadcrumb makes the alerting path diagnosable with the same SQL everything
 * else here is diagnosed with — which is this ADR's own thesis applied to its
 * own code.
 */
export const SCAN_HEALTH_ALERT_UNDELIVERABLE_LOG_MESSAGE = "scan_health_alert_undeliverable";

/**
 * How long one (engine, reason) incident stays deduped, across every project.
 *
 * 24h is chosen against the daily cron: a single exhausted API account is one
 * incident, and without a cross-project window it would send one email per
 * project per sweep. An alert that arrives twenty times teaches the operator
 * to ignore it, which is worse than not sending it.
 */
export const SCAN_HEALTH_ALERT_DEDUPE_HOURS = 24;


/**
 * Longest the scan may spend staggering one batch's prompt jobs, and the gap
 * between two consecutive starts inside that ceiling.
 *
 * A batch used to dispatch up to `MAX_REAL_SCAN_PROMPTS` jobs at the very same
 * instant, each firing one call per engine — up to 10 simultaneous Gemini
 * requests from a standing start, times `BATCH_CONCURRENCY` projects in a cron
 * sweep. The web audit already paces its own Gemini calls (700ms); generation
 * did not, and manufacturing a burst is a good way to manufacture the 429 that
 * kills it (same reasoning as `EXTRACTION_CONCURRENCY`).
 *
 * The ceiling is what keeps this honest against `.claude/rules/scan.md`'s
 * "budget new work against the invocation": 2s of a 45s work budget, spent
 * once per batch, and skipped entirely when the deadline is close — see
 * `computeStaggerDelaysMs`. The calls still overlap; only their starts are
 * spread.
 */
export const PROMPT_JOB_STAGGER_MS = 250;

/** Hard ceiling on the total stagger of a single batch. */
export const PROMPT_JOB_STAGGER_TOTAL_MAX_MS = 2_000;

/**
 * Below this much remaining invocation budget the stagger is dropped
 * altogether. Pacing is a nicety; finishing the batch is not.
 */
export const PROMPT_JOB_STAGGER_MIN_REMAINING_MS = 20_000;

/**
 * How far into its `maxDuration=60s` budget the recurring-scan sweep
 * (`runDailyCronScan`) may still *start* another batch of projects.
 *
 * Sibling of AUTO_EXECUTE_SAFE_CEILING_MS, with a different tail: the sweep's
 * is its summary log, the JSON response, and firing the `after()` dispatch of
 * the next chain link. Same value, stated separately rather than shared, so
 * that re-tuning one driver's headroom cannot silently re-tune the other's.
 *
 * The sweep used to bound itself with `if (elapsed > 45s) break` — the "after"
 * form this codebase has now been bitten by twice (docs/adr/0029 Addendum,
 * docs/adr/0037). A batch starting at 44.9s could still spend
 * SCAN_INVOCATION_WORST_CASE_MS, putting the invocation ~35s past the ceiling.
 * Vercel then kills it before the response — and because BOTH continuations
 * (the sweep's next link and each scan's own next batch) are registered with
 * `after()`, which never runs without a response, one overrun silently ends
 * the whole day's sweep (RECURRING-CADENCE-1, log §191).
 */
export const SWEEP_SAFE_CEILING_MS = 55_000;
