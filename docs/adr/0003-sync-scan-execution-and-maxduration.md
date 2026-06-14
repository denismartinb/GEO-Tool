# ADR 0003 — Sync Scan Execution and maxDuration

**Date:** 2026-06-05  
**Status:** Accepted  
**Deciders:** Founder + Director

---

## Context

GEO Studio scans run Gemini for each prompt in a project (can be 10+ calls).
A single Gemini call takes 5–15s; a full scan takes 30–90s.

Vercel's Hobby plan has a **10-second default function timeout**. Without
intervention, scans time out silently: the function is killed, the scan row
stays in `running` forever, and the user sees a stuck state with no error.

Two approaches were considered:

**A. Async/background worker**: scan is queued, a background process picks it
up, and the UI polls for status. Correct for production scale.

**B. Sync execution with `maxDuration`**: scan runs synchronously in the route
handler with `export const maxDuration = 60`, extending the Vercel timeout
to 60s (max on Hobby plan).

---

## Decision

**Option B** (sync execution + `maxDuration=60`) was chosen for private beta.

Rationale:
- No additional infra (no queue, no worker, no cron).
- Acceptable at private-beta user volume.
- Immediately unblocks the core flow without a separate backend phase.

Implementation:
- `export const maxDuration = 60` is present in
  `app/dashboard/projects/[projectId]/page.tsx`.
- `ENABLE_SYNC_SCAN_EXECUTION=true` must be set in the Vercel environment.

---

## Consequences

- **Positive:** no infra complexity; scans complete within the extended timeout.
- **Negative:** scans >60s will still time out; the row will be stuck in
  `running`. A timeout-detection pass (owned by `reliability`) must move such
  rows to `failed` during subsequent UI loads.
- **Future trigger to revisit:** user count grows, concurrent scans, or average
  scan duration exceeds 50s consistently → reopen as a new ADR for async
  background execution (which is **forbidden without explicit phase approval**).

---

## Addendum (2026-06-14) — parallelize per-prompt Gemini calls (SCAN-ROBUST-2)

`gemini-2.5-flash` (ADR 0009) has higher per-call latency (~7.5s) than the
previously pinned `gemini-2.0-flash-001` (~1-3s). Running the 6 `scan_prompt`
jobs sequentially in `lib/scan/executor.ts` took ~45s, leaving little margin
within the 60s `maxDuration` once the structured-extraction step ran
afterward — the function was killed mid-run, leaving `scan_runs` stuck in
`running` with all 6 prompt results already persisted, and later marked
terminal "Fallido · 0/6" by `reconcileStuckScanRuns`'s retry-exhausted path
despite every prompt having actually succeeded.

`executePendingScan` now dispatches all `scan_prompt` jobs concurrently via
`Promise.allSettled` (`processPromptJob`), bringing the prompt-generation
phase down to roughly one Gemini call's latency (~7.5-10s) instead of the sum
of all 6. `GeminiConfigError` (missing API key / invalid model) is reported
back per-job as `config_error` instead of thrown immediately, so the run is
still aborted as fatal once all concurrent calls have settled. Structured
extraction (`runStructuredExtractionForRun`) remains sequential for now; if
this alone does not bring total run time safely under 60s, parallelizing
extraction is a candidate follow-up (separate Task Intake).
