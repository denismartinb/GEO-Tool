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
  batch — results persisted, and scores computed via
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
(docs/adr/0003) — processes that batch, and then:

- if more `scan_prompt` jobs are still `pending` or `running` for this run,
  schedules (via Next.js's `after()`, fire-and-forget) a POST to
  `/api/scan/continue` that runs the next batch in its own fresh invocation,
  without making whoever called `executePendingScan` (the manual "Lanzar
  escaneo" action, the daily cron) wait for the rest of the campaign;
- once every `scan_prompt` job is terminal, atomically claims the run's
  `scan_finalize` job as a single-owner gate and runs structured extraction,
  scoring, and recommendations exactly once, then marks the run `completed`.

See `docs/adr/0014-batched-self-chaining-scan-execution.md` for the full
design and its rationale (why this, instead of an async worker or raising
Vercel's plan). The claim step (`UPDATE ... WHERE status = 'pending' ...
RETURNING`) is what makes a duplicate/racing invocation over the same batch a
safe no-op rather than double-processed work — a job is only ever picked up
by whichever invocation's update commits first.

`scan_runs.successful_prompts`/`failed_prompts` are recomputed from the
`jobs` table on every batch (not incremented), so they always reflect the
whole campaign's progress, not just the most recent batch — this is what the
real-progress bar (`components/scan-in-progress.tsx`) reads, and what a
duplicate invocation racing against another cannot corrupt.

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
