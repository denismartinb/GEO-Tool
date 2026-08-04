# Scan Lifecycle — State Machine

Owned by: `reliability` agent. Every scan run in GEO Studio must conform to
this state machine. Deviations from it are bugs.

---

## States

```
pending → running → completed
                  ↘ failed
```

| State | Meaning |
|---|---|
| `pending` | Scan has been created but execution has not started |
| `running` | Execution is in progress (Gemini call active) |
| `completed` | Execution completed successfully; results and scores persisted |
| `failed` | Execution failed or finished with zero successful prompts; sanitized reason persisted; run is terminal |
| `cancelled` | Allowed by the `scan_runs_status_chk` schema constraint, but **no code path writes it today** — there is no cancel-scan action or UI button. Treat as reserved for a future phase, not part of the current state machine. |

There is also a non-terminal `superseded` status, written to a project's
*previous* `completed` run when a newer run for the same project completes
(see `lib/scan/scan-runner.ts`, status `"superseded"`). It marks a run as
no longer the latest, not a failure.

**A `pending` or `running` run must never be stuck indefinitely.** The
reconciliation pass described below ensures every such run eventually
becomes terminal (`failed` or `completed`).

---

## Transition rules

### pending → running
- Triggered when the scan executor picks up the run.
- Written to DB (`status: "running"`, `started_at`, `error_summary: null`)
  before any Gemini call begins.
- This transition happens exactly once per campaign, on its first batch (see
  "Batched, self-chaining execution" below) — a run can stay `running` across
  many subsequent batches without ever going back through `pending`.

### running → completed
- After **every** `scan_prompt` job for the campaign has reached a terminal
  state (`completed` or `failed`) — not just the jobs in the most recent
  batch — AND every eligible `scan_prompt_results` row has been through
  structured extraction (see "Chained structured extraction (SCAN-CHAIN-2)"
  below) — results persisted, and scores computed via
  `computeRunScoresFromResults`.
- Sets `finished_at`.

---

## Batched, self-chaining execution (SCAN-CHAIN-1)

A project's active prompts (up to its plan's cap — Free 10, Starter 25, Pro
100, Agency 300, see `app/pricing/plans-data.ts`) all get a real `scan_prompt`
job when a run is created (`lib/scan/run-creation.ts`). `executePendingScan`
does **not** try to process all of them in one invocation: it atomically
claims up to `MAX_REAL_SCAN_PROMPTS` (10) still-`pending` jobs per call —
enough to fit comfortably inside the ~60s Vercel `maxDuration` budget
(docs/adr/0003) — processes that batch, and once every `scan_prompt` job is
terminal, atomically claims the run's `scan_finalize` job as a single-owner
gate and runs structured extraction, scoring, and recommendations exactly
once, then marks the run `completed`.

There are **two ways the remaining batches get driven**, chosen by
`executePendingScan`'s `scheduleContinuation` flag:

- **Foreground (default for the manual "Lanzar escaneo" / onboarding path):**
  the `autoExecutePendingScan` server action loops `executePendingScan`
  (`scheduleContinuation: false`) batch after batch within one request's
  ~40s budget, then returns the run's status; the `AutoExecuteScan` client
  component re-invokes it until the run is terminal. This drives the whole
  campaign through the **authenticated user session**, so it needs neither the
  continuation secret nor a reachable self-URL — it works on preview deploys
  and behind Vercel deployment protection, where a server-to-server self-fetch
  would be blocked.
- **Background (the daily cron / a browser-closed continuation):**
  `executePendingScan` (default `scheduleContinuation: true`) schedules, via
  Next.js's `after()` (fire-and-forget), a POST to `/api/scan/continue` that
  runs the next batch in its own fresh invocation. This requires
  `SCAN_CONTINUE_SECRET` and a reachable deployment URL (see
  `docs/environment-contract.md`); if that dispatch is lost, the run simply
  stalls until the timeout + auto-retry below picks it up.

See `docs/adr/0014-batched-self-chaining-scan-execution.md` for the full
design and its rationale (why this, instead of an async worker or raising
Vercel's plan). The claim step (`UPDATE ... WHERE status = 'pending' ...
RETURNING`) is what makes a duplicate/racing invocation over the same batch a
safe no-op rather than double-processed work — a job is only ever picked up
by whichever invocation's update commits first, so the foreground loop and a
background continuation can never double-process a batch even if both fire.

`scan_runs.successful_prompts`/`failed_prompts` are recomputed from the
`jobs` table on every batch (not incremented), so they always reflect the
whole campaign's progress, not just the most recent batch — this is what the
real-progress bar (`components/scan-in-progress.tsx`) reads, and what a
duplicate invocation racing against another cannot corrupt.

---

## Chained structured extraction (SCAN-CHAIN-2)

Once every `scan_prompt` job for a campaign is terminal, the invocation that
observes this atomically claims the run's `scan_finalize` job (single-owner
gate, same claim pattern as above) and runs structured extraction
(`runStructuredExtractionForRun`, `lib/scan/extraction.ts`) — one LLM call
per `scan_prompt_results` row, turning its raw answer into `extracted_json`
(mention, position, sentiment, citations). This step feeds prominence,
citation/authority, and share-of-voice scoring; presence is computed inline
at generation time and does not depend on it.

Like `scan_prompt` execution itself, extraction is **batched and
self-chaining**, not a single unbounded call: `runStructuredExtractionForRun`
processes at most `EXTRACTION_BATCH_SIZE` (`MAX_REAL_SCAN_PROMPTS * 3` —
sized for up to 3 active engines) still-eligible rows per call and reports
`{ processed, remaining }`. A row is eligible when its generation completed,
it hasn't already succeeded at the current `EXTRACTION_VERSION`, and it
doesn't already carry a non-null `extraction_error` from a prior attempt in
this same run (a failed row is terminal, never retried — see
docs/adr/0027-chained-structured-extraction.md for why retrying it would
re-chain forever).

If `remaining > 0` after a batch, the run is **not** scored:
`executePendingScan` re-queues `scan_finalize` back to `pending` (reverting
the claim's `attempt_count` increment — a continuation is not a failure
retry and must not consume one of the job's `max_attempts`) and hands off to
the next batch via the same mechanism SCAN-CHAIN-1 uses for `scan_prompt`
batches: a background self-fetch (`scheduleContinuation: true`) or simply
returning for the foreground driver's own loop. Only once `remaining === 0`
does the run proceed to scoring and `completed`. `scan_runs.updated_at` is
touched on every extraction-continuation round too (via
`refreshRunProgressCounters`), so the stuck-run timeout below never misfires
on a campaign whose `scan_prompt` batches all finished but whose extraction
is still chaining through several rounds.

A campaign with more `scan_prompt_results` rows than `EXTRACTION_BATCH_SIZE`
(any Starter/Pro/Agency run with 3 active engines) therefore completes
extraction over multiple chained invocations before scoring — see
docs/adr/0027 for the full design, the three failure traps it closes
(infinite re-chain on a failed row, attempt-count exhaustion, and a
double-claim race), and why this was a P0 (an un-extracted row's
`citation_found` defaults to `false` in the DB and still counted toward the
authority score's denominator, artificially deflating it for any run larger
than the old hard cap).

---

### running|pending → failed
- On any **unrecoverable** error: a Gemini configuration error (missing API
  key, invalid `GEMINI_MODEL`), a timeout, or a failure to create/find scan
  jobs. Configuration errors affect every prompt equally, so they abort the
  whole run immediately.
- A **per-prompt** Gemini error (HTTP failure, empty response, rate limit,
  or a hard per-call timeout — see "Per-call timeout" below) is
  **recoverable**: the executor retries that single prompt, bounded by
  `PROMPT_RETRY_MAX_TOTAL_ATTEMPTS` (2 total attempts, i.e. one retry) and by
  the job's `max_attempts`, with a short `PROMPT_RETRY_DELAY_MS` (500ms) delay
  between attempts. If every attempt fails, that prompt is recorded as failed
  (`failed_prompts` incremented, its job marked `failed` with a sanitized
  `last_error`) and the run continues with the next prompt. It does not by
  itself transition the run to `failed`. `GeminiConfigError` is never retried
  at the per-prompt level — it is unrecoverable and aborts the whole run
  immediately (see above).
- If the run finishes the prompt loop with **zero successful prompts**
  (`successful_prompts === 0`), the run is still marked `failed` rather than
  `completed`, to avoid a misleading "completed with no data" state. This case
  uses its own `error_summary`, `SCAN_NO_RESULTS_ERROR_SUMMARY`
  (`ProjectActionError("scan_failed_no_results")`), distinct from the generic
  `"scan_failed"` message — this lets `reconcileStuckScanRuns` recognize it as
  **recoverable** (eligible for the same bounded auto-retry as a timeout, see
  below) while a `GeminiConfigError`-caused abort remains terminal and is never
  retried.
- Sets `finished_at` and an internal-only, sanitized `error_summary` (no raw
  secrets, no stack traces, no raw Gemini error objects). `error_summary` is
  mapped to a user-facing message by `getDisplayErrorSummary` /
  `getRunErrorDisplay`.

### Per-call timeout (Gemini)
- `generateGeminiVisibilityAnswer` (the per-prompt scan call in
  `lib/llm/gemini.ts`) enforces a hard `GEMINI_CALL_TIMEOUT_MS` (20s) timeout
  via `AbortController`, so a single stuck call cannot block progress
  indefinitely.
- On timeout, the call throws `GeminiTimeoutError`, which the executor treats
  as a normal recoverable per-prompt error (see above) — it triggers the
  per-prompt retry, then (if exhausted) marks that prompt's job `failed` with a
  sanitized `last_error`. It never crashes the whole run.
- **Worst-case budget note**: the ~60s Vercel `maxDuration`
  (`docs/adr/0003-sync-scan-execution-and-maxduration.md`) is a *typical-case*
  target **per batch** (`MAX_REAL_SCAN_PROMPTS=10`), not a hard guarantee, and
  since SCAN-CHAIN-1 it is no longer a ceiling on the whole campaign — see
  "Batched, self-chaining execution" above. Since SCAN-ROBUST-2 (`docs/adr/0003`,
  "Addendum (2026-06-14)"), `scan_prompt` jobs within a batch run concurrently
  via `Promise.allSettled`, so the per-prompt retry costs (`2 × 20s + 500ms`
  each) overlap rather than sum — a pathological batch where every prompt
  times out and retries once still takes roughly one prompt's worst case
  (~40.5s), not 10 × that. That worst case is bounded by the running-timeout +
  reconciliation auto-retry below, not by the per-call timeout alone.

---

## Daily sweep capacity (ASYNC-SCAN-1a)

One level above individual runs, the daily recurring-scan sweep
(`runDailyCronScan`, `lib/scan/cron.ts`) is itself self-chaining: a single
daily cron firing processes projects in invocation-sized links
(`MAX_PROJECTS_PER_CRON_RUN` each), dispatching the next link via `after()`
+ `/api/cron/sweep-continue` (secret-gated by `CRON_SECRET`) until every
eligible project is handled or the `MAX_SWEEP_CHAIN_INVOCATIONS` cap is
reached. Each link only *starts* a project's campaign — everything below
(batching, continuation, reconciliation) is governed by this document
unchanged. See `docs/adr/0016-self-chaining-daily-cron-sweep.md` for
convergence/termination guarantees and capacity math.

---

## Timeout detection and auto-retry (`reconcileStuckScanRuns`)

A run in `running` state whose `updated_at` is older than
`SCAN_RUNNING_TIMEOUT_SECONDS` (120s) — not `started_at` — is presumed to
have timed out (e.g. Vercel function killed without updating state, or a
SCAN-CHAIN-1 continuation dispatch that was lost). A run in `pending` state
for longer than `SCAN_PENDING_TIMEOUT_SECONDS` (300s) is stale. On the next
reconciliation pass (triggered by UI load or the weekly-scans cron), both are
transitioned to `failed` with an internal `error_summary` of `"scan_timeout"`
/ `"scan_pending_timeout"`.

Anchoring on `updated_at` rather than `started_at` is what lets a legitimate
multi-batch campaign (SCAN-CHAIN-1) stay `running` far longer than 120s
without being mistaken for stuck: `updated_at` is bumped by the DB's own
`set_updated_at` trigger every time a batch makes real progress
(`refreshRunProgressCounters`'s write to `scan_runs`), so only a campaign that
has genuinely stopped advancing — not one that is still working through its
prompts — ever looks stale by this check.

This reconciliation is what unblocks the "one active scan per project"
invariant: a stuck run no longer permanently blocks new scans, because it
becomes terminal (`failed`) on the next pass instead of remaining
`pending`/`running` forever.

**Auto-retry with cap (PR #78):** when a run is marked `failed` due to
timeout, `reconcileStuckScanRuns` counts prior timeout-failed runs for the
same project within `SCAN_TIMEOUT_RETRY_LOOKBACK_HOURS` (24h). If that count
is below `SCAN_TIMEOUT_AUTO_RETRY_CAP` (1), a fresh `pending` run is created
automatically (`trigger_source: "cron"`) — the user doesn't need to retry
manually. If the cap is reached, the row is marked with a
`"scan_timeout_retry_exhausted"` / `"scan_pending_timeout_retry_exhausted"`
`error_summary` instead, and the user sees a calmer message inviting a
manual retry, without entering an unbounded auto-retry loop.

**Generalized auto-retry (SCAN-ROBUST-1):** the same cap and lookback window
apply across *all* recoverable failure reasons, not just timeouts.
`RECOVERABLE_ERROR_SUMMARIES` (`SCAN_TIMEOUT_ERROR_SUMMARY`,
`SCAN_PENDING_TIMEOUT_ERROR_SUMMARY`, `SCAN_NO_RESULTS_ERROR_SUMMARY`) and
`ALL_RECOVERABLE_ERROR_SUMMARIES` (which also includes the corresponding
`*_retry_exhausted` variants, for cap counting) are used by
`countRecentRecoverableFailures` to compute a single shared count per project
within the lookback window — a project gets **at most one** auto-retry per
reconciliation pass, regardless of how many different recoverable reasons are
involved.

In addition to the existing `pending`/`running` timeout passes,
`reconcileStuckScanRuns` runs a third pass over already-`failed` runs whose
`error_summary` is `SCAN_NO_RESULTS_ERROR_SUMMARY` (zero successful prompts).
For each such run (skipped if a newer `scan_runs` row already exists for the
project — it has already been superseded by a manual relaunch or an earlier
auto-retry):
- if the shared cap is reached, the row's `error_summary` is updated to
  `SCAN_NO_RESULTS_RETRY_EXHAUSTED_ERROR_SUMMARY` (terminal, "you can launch a
  new scan" message);
- otherwise, a fresh `pending` run is created automatically, same as the
  timeout passes.

A `GeminiConfigError`-caused `failed` run (generic `"scan_failed"`
`error_summary`, not in `ALL_RECOVERABLE_ERROR_SUMMARIES`) is never matched by
this pass and is never auto-retried — it remains terminal until the user fixes
the underlying configuration and launches a new scan manually.

---

## Invariants

1. **One active scan per project.** If a `pending` or `running` scan exists
   for a project, launching a new scan is blocked with a clear UI message
   (`active_run_exists`).
2. **Terminal states are terminal.** A `completed` or `failed` run must never
   be updated back to `running` or `pending`.
3. **No silent hangs.** If the execution process dies (Vercel timeout, OOM,
   crash), `reconcileStuckScanRuns` eventually corrects the DB row to
   `failed` (with auto-retry, see above).
4. **No user-facing cancel today.** There is no cancel-scan action or button.
   A user blocked by a stuck `pending`/`running` run relies on the timeout +
   auto-retry mechanism above, not on cancelling it themselves. Adding a
   cancel action is tracked as a future phase (see
   `docs/director-strategy.md`), not a current invariant.

---

## Known history

The sync execution + `maxDuration=60` approach was chosen over async/background
workers to avoid infra complexity at private-beta scale. See
`docs/adr/0003-sync-scan-execution-and-maxduration.md`. If that tradeoff is
revisited, this document must be updated alongside the ADR.

Structured extraction was originally a single unbounded call, hard-capped at
20 rows and never revisited for the rest of a large run — silently starving
prominence/citation/authority scoring on any campaign larger than that cap
while `citation_found` defaulted to `false` for the un-extracted rows and
still counted toward the authority denominator. Fixed by chaining extraction
the same way `scan_prompt` execution is chained — see "Chained structured
extraction (SCAN-CHAIN-2)" above and
`docs/adr/0027-chained-structured-extraction.md`.
