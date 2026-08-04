# ADR 0027 — Chained Structured Extraction (SCAN-CHAIN-2)

**Date:** 2026-08-04
**Status:** Accepted
**Deciders:** Founder + `reliability`

---

## Context

`runStructuredExtractionForRun` (`lib/scan/extraction.ts`) is the step that
turns each `scan_prompt_results` row's raw LLM answer into structured
`extracted_json` (mention, position, sentiment, citations) — one extraction
LLM call per row, all run concurrently via `Promise.allSettled`. It is called
exactly once, from the tail of `executePendingScan`'s `scan_finalize` step
(`lib/scan/executor.ts`), immediately before `computeRunScoresFromResults`
scores the run.

Before this ADR, that single call hard-capped itself at
`MAX_EXTRACTION_RESULTS = MAX_REAL_SCAN_PROMPTS * 2 = 20`
(`lib/scan/constants.ts`) and never came back for the rest:

```ts
const rowsToProcess = eligibleRows.slice(0, MAX_EXTRACTION_RESULTS);
```

`* 2` was sized for **two** active engines. `LLM_SCAN_PROVIDERS` runs up to
**three** today (gemini, claude, openai — see `getLLMScanProviders`,
`lib/scan/executor.ts`), and paid plans sell up to 100 (Pro) or 300 (Agency)
prompts (`app/pricing/plans-data.ts`). One `scan_prompt_results` row exists
per prompt per active engine, so a single Pro/Agency run can produce
300-900 rows, of which only the oldest 20 ever got extracted.

**Why this was a P0, not a P1:** the four GEO-score components are not
extraction-dependent alike.

- **Presence (40%)** is computed inline in `executor.ts` at generation time
  (`brand_mentioned` from the row's own raw response), independent of
  extraction — always correct.
- **Prominence (25%), citation/authority, and share-of-voice (20%+15%)** all
  read from `extracted_json` / `citation_found` / `mentioned_competitors_count`
  — populated ONLY by extraction.

Worse: an un-extracted row's `citation_found` was never touched, so it sat at
its DB-default `false` (`supabase/migrations/0001_v0_schema.sql`) and still
counted in the authority denominator. The product was not merely missing
data for 280-880 rows — it was actively telling paying customers they were
never cited by engines it had never actually looked at.

## Constraint that ruled out the naive fix

Extraction makes one LLM call per row, all concurrent
(`Promise.allSettled`). Simply removing the cap would mean up to 900
concurrent outbound LLM calls inside a single ~60s Vercel `maxDuration`
invocation (`docs/adr/0003`) — this would not extract more reliably, it would
make the finalize step itself time out and the whole campaign fail.

## Decision

Reuse the batching/self-chaining primitive already proven by SCAN-CHAIN-1
(`docs/adr/0014-batched-self-chaining-scan-execution.md`) for `scan_prompt`
jobs, applied to the extraction step of `scan_finalize` instead.

1. `MAX_EXTRACTION_RESULTS` is renamed `EXTRACTION_BATCH_SIZE` and re-sized to
   `MAX_REAL_SCAN_PROMPTS * 3` (worst case: 3 active engines) — a genuine
   per-BATCH size now, not a per-campaign cap.
2. `runStructuredExtractionForRun` processes at most `EXTRACTION_BATCH_SIZE`
   still-eligible rows and returns `{ processed, remaining }` instead of
   `void`. "Eligible" excludes rows whose `extraction_version` already
   matches the current `EXTRACTION_VERSION` (already done) **and** rows with
   a non-null `extraction_error` (see trap 1 below).
3. In `executePendingScan`'s finalize tail: if `remaining > 0` after a batch,
   the run is **not** scored. `scan_finalize` is set back to `pending`
   (never marked `completed`) and the campaign hands off to the next batch
   using the exact same mechanism SCAN-CHAIN-1 already uses between
   `scan_prompt` batches — a background self-fetch to `/api/scan/continue`
   when `scheduleContinuation` is true, or simply returning so the
   foreground driver (`autoExecutePendingScan`'s own loop) calls
   `executePendingScan` again. Only once `remaining === 0` does the run
   proceed to `computeRunScoresFromResults` and `completed`.

No schema migration. No new job status. No new endpoint. Idempotency comes
for free from the existing `extraction_version`/`extraction_error` gating
already used to skip rows on a genuinely re-run extraction pass.

### Trap 1 — a failed row must never re-chain forever

A row whose extraction attempt throws is persisted with `extraction_error`
set and `extraction_version` left at its OLD value (`extractAndPersistRow`,
`lib/scan/extraction.ts`) — deliberate, so the UI can distinguish "genuinely
processed, zero citations" from "extraction never ran/failed". Before this
ADR that was harmless: extraction only ran once per run, so a failed row was
simply never retried, matching every other row that never got a turn.

Once extraction can be called many times for the same run, this becomes
dangerous: the row's `extraction_version` never advances, so it would be
picked as "eligible" again on every single subsequent batch, forever — an
infinite re-chain that would (a) never let `remaining` reach 0, and (b) waste
an LLM call on the same row every batch. Fixed by explicitly excluding rows
with a non-null `extraction_error` from eligibility. This is a **within-run**
concern only — a fresh scan run gets fresh `scan_prompt_results` rows with
`extraction_error: null`, so a failure in one run never poisons a later one.

### Trap 2 — a continuation must not consume a retry attempt

`jobs.max_attempts` defaults to 3, and the existing atomic claim
(`pending -> running`) increments `attempt_count` on every claim. Naively
reclaiming `scan_finalize` once per extraction batch would burn through
`max_attempts` after 3 batches regardless of how many batches the campaign
actually needs (a 300-row run at `EXTRACTION_BATCH_SIZE` = 30 needs up to 10)
— the run would die mid-extraction with results already partially persisted
but never scored, a new and worse stuck state than the one this ADR fixes.

Re-queuing `scan_finalize` to continue an in-progress extraction is **not** a
retry following a failure — it is the same logical attempt at finalizing the
campaign, spread across more than one invocation. `executePendingScan`
captures the job's `attempt_count` immediately before the claim
(`finalizeAttemptCountBeforeClaim`) and, when re-queuing for continuation,
writes that exact value back — the net `attempt_count` change across any
number of continuation rounds is zero. `attempt_count` only durably advances
when `scan_finalize` actually concludes: scored and marked `completed`, or
bulk-failed by `executePendingScan`'s own catch block on a genuine error.
Covered by an executor test that runs 5 continuation rounds against a
`max_attempts: 3` fixture and asserts `attempt_count` never leaves `{0, 1}`.

### Trap 3 — two invocations must never extract/score the same run at once

Unchanged from SCAN-CHAIN-1: the atomic `UPDATE jobs SET status='running'
... WHERE status='pending' ... RETURNING` claim is what makes `scan_finalize`
single-owner. The continuation re-queue writes `status='pending'` back with
a `WHERE status='running'` guard — symmetric with the claim, defensive
rather than load-bearing (only this invocation could ever hold the job as
`running` at that point in its own synchronous execution) — so a racing
invocation can only ever pick up the job once this one has genuinely handed
it back.

### A quieter fourth risk: the stuck-run timeout must not misfire mid-extraction

`reconcileStuckScanRuns` treats a `running` run as stuck once
`scan_runs.updated_at` is older than `SCAN_RUNNING_TIMEOUT_SECONDS` (120s) —
deliberately anchored on `updated_at`, bumped by `refreshRunProgressCounters`
on every `scan_prompt` batch, so a long-but-genuinely-progressing campaign is
never mistaken for stuck (`docs/scan-lifecycle.md`). Extraction-continuation
batches previously touched nothing on `scan_runs` at all (only the `jobs`
row) — a large run needing many chained extraction batches would have left
`updated_at` frozen at whatever the last `scan_prompt` batch set it to, and
could have tripped the exact same 120s timeout this ADR's design otherwise
avoids. `executePendingScan` now calls `refreshRunProgressCounters` (a write
to `scan_runs`, harmless since the counters it recomputes are already final
by this point) on every extraction-continuation round too, for the
`updated_at` bump alone.

## Consequences

- **Positive:** every eligible row in a run gets extracted, regardless of
  campaign size — prominence/citation/authority scoring reflects the whole
  run, not the oldest 20 rows. Fixes the artificially-deflated authority
  score root-caused above.
- **Positive:** zero schema changes, zero new job states, zero new
  endpoints — reuses SCAN-CHAIN-1's proven self-chaining primitive as-is.
- **Negative:** a large campaign now takes several extraction batches
  (`EXTRACTION_BATCH_SIZE = MAX_REAL_SCAN_PROMPTS * 3 = 30`) to fully
  finalize — e.g. a 300-row Agency run needs up to 10 extraction batches on
  top of its ~30 `scan_prompt` batches. The run stays `running` throughout
  (no new user-facing state), consistent with SCAN-CHAIN-1's own tradeoff.
- **Future trigger to revisit:** if `EXTRACTION_BATCH_SIZE` ever needs
  independent tuning from `MAX_REAL_SCAN_PROMPTS` (e.g. per-provider
  extraction latency diverges enough to matter), split it into its own
  constant rather than a multiple of the prompt-batch size.

See `docs/scan-lifecycle.md` ("Batched, self-chaining execution") for how
this composes with SCAN-CHAIN-1's own chaining of `scan_prompt` batches.
