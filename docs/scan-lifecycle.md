# Scan Lifecycle — State Machine

Owned by: `reliability` agent. Every scan run in Lumira must conform to
this state machine. Deviations from it are bugs.

---

## States

```
pending → running → done
                 ↘ failed
                 ↘ cancelled
```

| State | Meaning |
|---|---|
| `pending` | Scan has been created but execution has not started |
| `running` | Execution is in progress (Gemini call active) |
| `done` | Execution completed successfully; results persisted |
| `failed` | Execution failed; sanitized reason persisted; run is terminal |
| `cancelled` | User or system cancelled the run before completion; terminal |

**There is no other valid state.** A run must never be stuck in `pending` or
`running` indefinitely.

---

## Transition rules

### pending → running
- Triggered when the scan executor picks up the run.
- Must be written to DB before any Gemini call begins.

### running → done
- After all prompts have been executed and results persisted.
- Set `completed_at`.

### running → failed
- On any **unrecoverable** error: a Gemini configuration error (missing API
  key, invalid `GEMINI_MODEL`), a timeout, or an extraction-stage failure.
  Configuration errors affect every prompt equally, so they abort the whole
  run immediately.
- A **per-prompt** Gemini error (HTTP failure, empty response, rate limit
  after one retry) is **recoverable**: that prompt is recorded as failed
  (`failed_prompts` incremented, its job marked `failed` with a sanitized
  `last_error`) and the run continues with the next prompt. It does not by
  itself transition the run to `failed`.
- If the run finishes the prompt loop with **zero successful prompts**
  (`successful_prompts === 0`), the run is still marked `failed` rather than
  `completed`, to avoid a misleading "completed with no data" state.
- Set `failed_at` and a **sanitized** `error_message` (no raw secrets, no stack
  traces, no raw Gemini error objects).
- A run that exceeds `maxDuration` must be moved to `failed` during the next
  detection pass, not left as `running`.

### pending|running → cancelled
- On explicit user cancel action (cancel-scan button).
- On system-level timeout detection pass (see below).

---

## Timeout detection

A run in `running` state for longer than `SCAN_TIMEOUT_SECONDS` (default: 90s)
is presumed to have timed out (e.g. Vercel function killed without updating
state). On next UI load or a scheduled check, it must be transitioned to
`failed` with reason `"scan_timeout"`.

A run in `pending` state for longer than `SCAN_PENDING_TIMEOUT_SECONDS`
(default: 300s, 5 minutes) is stale and should be moved to `cancelled` or
`failed` with reason `"scan_pending_timeout"`.

---

## Invariants

1. **One active scan per project.** If a `pending` or `running` scan exists for
   a project, launching a new scan must be blocked with a clear UI message.
2. **Terminal states are terminal.** A `done`, `failed`, or `cancelled` run must
   never be updated back to `running` or `pending`.
3. **No silent hangs.** If the execution process dies (Vercel timeout, OOM,
   crash), the DB row must eventually be corrected by the timeout detection
   pass.
4. **Cancel must work from the UI.** The user must be able to cancel a
   `pending` or `running` scan — especially when blocked from launching a new
   one by an orphaned stuck scan.

---

## Known history

The sync execution + `maxDuration=60` approach was chosen over async/background
workers to avoid infra complexity at private-beta scale. See
`docs/adr/0003-sync-scan-execution-and-maxduration.md`. If that tradeoff is
revisited, this document must be updated alongside the ADR.
