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

### running → completed
- After all prompts have been executed, results persisted, and scores
  computed via `computeRunScoresFromResults`.
- Sets `finished_at`.

### running|pending → failed
- On any **unrecoverable** error: a Gemini configuration error (missing API
  key, invalid `GEMINI_MODEL`), a timeout, or a failure to create/find scan
  jobs. Configuration errors affect every prompt equally, so they abort the
  whole run immediately.
- A **per-prompt** Gemini error (HTTP failure, empty response, rate limit
  after one retry) is **recoverable**: that prompt is recorded as failed
  (`failed_prompts` incremented, its job marked `failed` with a sanitized
  `last_error`) and the run continues with the next prompt. It does not by
  itself transition the run to `failed`.
- If the run finishes the prompt loop with **zero successful prompts**
  (`successful_prompts === 0`), the run is still marked `failed` rather than
  `completed`, to avoid a misleading "completed with no data" state.
- Sets `finished_at` and an internal-only, sanitized `error_summary` (no raw
  secrets, no stack traces, no raw Gemini error objects). `error_summary` is
  mapped to a user-facing message by `getDisplayErrorSummary` /
  `getRunErrorDisplay`.

---

## Timeout detection and auto-retry (`reconcileStuckScanRuns`)

A run in `running` state for longer than `SCAN_RUNNING_TIMEOUT_SECONDS`
(120s) is presumed to have timed out (e.g. Vercel function killed without
updating state). A run in `pending` state for longer than
`SCAN_PENDING_TIMEOUT_SECONDS` (300s) is stale. On the next reconciliation
pass (triggered by UI load or the weekly-scans cron), both are transitioned
to `failed` with an internal `error_summary` of `"scan_timeout"` /
`"scan_pending_timeout"`.

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
