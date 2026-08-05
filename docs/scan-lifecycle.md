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
job when a run is created (`lib/scan/run-creation.ts`).

**One job per (prompt, sample)** since SAMPLING-1 (ADR 0030): when
`prompts × engines` falls short of the response floor
(`MIN_RESPONSES_PER_RUN`, `lib/scan/sampling.ts`), the run repeats its prompt
set and each repetition gets its own jobs, carrying `sample_index` in
`payload_json`. Two consequences worth stating here, because both are easy to
get wrong from elsewhere in the lifecycle:

- `scan_runs.total_prompts` counts **jobs**, not distinct prompts — every
  progress figure divides `successful_prompts + failed_prompts` (job counts)
  by it. The distinct prompt count is `total_prompts / sample_count`.
- The unit of work is `(run, prompt, engine, sample)`. `processPromptJob`'s
  "does a result already exist" check is scoped to `sample_index`; without
  that scope every repetition after the first would find sample 0's rows and
  complete without making a call.

`executePendingScan`
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

## Structured extraction (EXTRACTION-RELIABILITY-1)

Extraction is not a postscript to a run — it is what produces
`extracted_json`, and therefore everything the product scores and displays. A
row holding a real engine answer that nothing extracted is invisible to the
entire product, so the lifecycle treats it as unfinished work, not as a
detail.

**Extraction runs per batch, plus a final sweep.** Each batch extracts the
rows it just generated, in the same invocation; the finalize batch runs one
more pass to catch anything an earlier pass could not reach. Before
EXTRACTION-RELIABILITY-1 it ran exactly once, at finalize, capped at 20 rows
(`MAX_EXTRACTION_RESULTS`) — a cap sized when a run was a single batch and
never revisited after SCAN-CHAIN-1 made campaigns span many. Everything past
the 20th row was silently discarded: on a 30-row run that was a third of the
answers, on a 300-row Pro run 93%. See `docs/adr/0029`.

**A pass is bounded by rate and time, never by row count.**
`EXTRACTION_CONCURRENCY` (4) bounds in-flight calls. The time bound is
`SCAN_INVOCATION_WORK_BUDGET_MS` (45s) and it belongs to the **whole
invocation**, not to each pass: `executePendingScan` computes one absolute
deadline at entry and threads it into every extraction pass it runs, so
generation, the batch pass and the finalize sweep all draw from the same
budget. Rows a pass cannot reach stay eligible for the next invocation. A
per-pass budget instead of a shared one is what killed a real scan in preview
— see `docs/adr/0029`, Addendum.

**A finalize claim is leased, not permanent.** Because extraction now runs
inside the finalize step, that step is long enough to be killed mid-flight, and
a killed invocation cannot release the `scan_finalize` job it claimed. Nothing
else recovers a `jobs` row — `reconcileStuckScanRuns` only touches
`scan_runs` — so a job whose `locked_at` is older than
`FINALIZE_LOCK_LEASE_MS` (90s) may be taken over by another invocation, via the
same atomic claim the prompt batches use. Without this, one killed invocation
stranded the campaign permanently.

**Per-call retries.** Every extraction call goes through
`fetchExtractionWithRetry` (`lib/llm/extraction-fetch.ts`):
`EXTRACTION_CALL_TIMEOUT_MS` (20s) per attempt, `EXTRACTION_MAX_ATTEMPTS` (3)
with exponential backoff plus full jitter, honoring a clamped `Retry-After`.
429 and 5xx are retryable; 400/401/403 are not (the key or model id is wrong,
and retrying only burns budget the remaining rows need). Before this phase,
extraction on all three providers had neither a timeout nor a retry while
generation had both — which is why every observed provider outage killed
extraction and left generation working.

**Failures are categorized and sanitized.** `extraction_error` stores
`category: message`, where category is one of `quota | timeout | http | empty
| invalid_json | schema | config | unknown`. Only messages this codebase
authored are ever persisted; anything else is flattened to
`unknown: Extraction failed.`. Query a provider outage with
`extraction_error LIKE 'quota:%'`.

**A row that failed extraction is not re-attempted within the run.** It has
already spent its bounded retries and carries a truthful error. Re-queueing it
every pass would let one systematic failure consume the whole budget and
starve rows nothing has looked at yet.

**What the user sees while it runs (Fase C).** The progress screen
(`components/scan-in-progress.tsx`) covers **both** stages: generation over the
first half of the bar, extraction over the second, each with its own measured
counter. It never reaches 100% while the run is in flight. Before Fase C it
measured generation only, so from Fase A onwards it pinned at "100% · X de X"
for the whole extraction stretch — with the project section behind the overlay,
which reads as a hung scan. The analysis denominator is counted from the rows
that exist rather than derived from `prompts × engines × samples`, because that
arithmetic already changed once (SAMPLING-1, ADR 0030). `withAnalysisProgress`
(`lib/scan/active-run-progress.ts`) is the single place that computes it for
the five screens that render the component and for the 3s poll endpoint.

**A run that loses data alerts the operator (Fase B).** After a run reaches a
terminal state, `checkAndSendScanHealthAlert` (`lib/scan/scan-health-alert.ts`)
evaluates its rows and emails `OPS_ALERT_EMAIL` when something actionable
happened: a `quota:` or `config:` extraction error (no threshold — neither
heals on its own), an engine that answered prompts but extracted nothing at
all, or a run that ended `failed` with its auto-retry already spent. Isolated
model noise (`schema`, `invalid_json`, `empty`, `timeout`) deliberately does
NOT alert — it self-corrects on the next scan and there is nothing to fix —
but it still counts toward the engine-down check. Deduped on (engine, reason)
across **every** project for `SCAN_HEALTH_ALERT_DEDUPE_HOURS` (24h), because
the daily cron would otherwise turn one incident into one email per project.
Fail-soft: an alert can never sink a scan. See `docs/adr/0029`, Fase B.

**Finalize defers rather than completing over a hole.** If
`countUnprocessedExtractionRows` is non-zero at finalize, the `scan_finalize`
job is released back to `pending`, progress counters are refreshed (bumping
`updated_at`, so the reconciliation pass does not mistake a deferring run for
a stalled one) and a continuation is scheduled. Termination is guaranteed:
every pass either extracts a row or records an error on it, and both take that
row out of the unprocessed set. A genuine stall is still caught by the
timeout + auto-retry below.

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
4. **No mute rows.** A run may not be marked `completed` while it holds an
   engine answer that nothing has tried to extract. Either the row carries
   `extracted_json` at the current `EXTRACTION_VERSION`, or it carries a
   categorized `extraction_error` explaining why not. Completing over such a
   gap publishes a score computed from a fraction of the run's own data and
   calls it done — which is exactly what happened before
   EXTRACTION-RELIABILITY-1 (`docs/adr/0029`). Enforced in `executePendingScan`
   via `countUnprocessedExtractionRows`.
5. **No user-facing cancel today.** There is no cancel-scan action or button.
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
