# ADR 0027 — Extraction must finish or say why (EXTRACTION-RELIABILITY-1)

Date: 2026-08-04
Status: Accepted
Supersedes: nothing. Amends the extraction half of
`docs/adr/0014-batched-self-chaining-scan-execution.md`.

---

## Context

A scan is only worth what its *extraction* produces. Generation gets a raw
answer out of an engine; `extracted_json` is what every score, card and
recommendation is actually computed from (`lib/scoring/run-scoring.ts`). A row
with a real answer and no extraction is invisible to the whole product.

On 2026-08-04 the founder reported that roughly a third of responses were not
being processed. Measured against production (`scan_prompt_results`, all
projects of the founder's account, 30-day window), the report was right and had
**two independent causes**, both silent.

### Cause 1 — a row cap that stopped matching reality

`runStructuredExtractionForRun` took `.slice(0, MAX_EXTRACTION_RESULTS)` of the
eligible rows, with `MAX_EXTRACTION_RESULTS = MAX_REAL_SCAN_PROMPTS * 2 = 20`.
That constant was sized when a run *was* a single batch. SCAN-CHAIN-1
(ADR 0014) made a campaign span many batches — up to the plan's prompt cap ×
active engines — but extraction stayed a single pass at finalize, and the cap
was never revisited. Everything past the 20th eligible row was dropped with no
error, no log and no mark on the row.

The production numbers are unambiguous. On every 30-row run, across every
project, `procesadas + con_error` summed to exactly 20:

| Prompts × engines | Rows/run | Extracted | Lost |
|---|---|---|---|
| 10 × 1 (Free) | 10 | 10 | 0 |
| 10 × 3 | 30 | 20 | 10 (33%) |
| 25 × 3 (Starter) | 75 | 20 | 55 (73%) |
| 100 × 3 (Pro) | 300 | 20 | 280 (93%) |

genscore.es pinned it exactly: 3 runs × 10 prompts × 3 engines = 90 rows, of
which 30 were never attempted — 33.3%, the founder's "un tercio". The control
case holds too: alberdiderma.es (~16 rows/run) and mozilla.org (~10 rows/run)
never exceed the cap and lost nothing.

Note what this means commercially: the product could not process what the
Starter and Pro plans promise. The cap, not the plan, was the real limit.

### Cause 2 — extraction had no retry, on any provider

The *generation* call of all three providers had a timeout and a 429 retry.
The *extraction* call of all three had **neither** — a bare `fetch` that
treated the first non-OK response as terminal. That asymmetry is why every
observed provider incident landed on extraction and never on generation.

OpenAI extraction returned HTTP 429 on every call from 2026-08-01 01:20 UTC:
78/78 rows on mozilla.org, 33/33 on mahou.es, 27/27 on movistar.es, zero
successes in four days. Deterministic, not intermittent — an exhausted
account, which OpenAI returns as 429 exactly like a rate limit. Generation kept
working throughout (the rows have `status = 'completed'` and a populated
`raw_response_text`), so the product looked healthy while a third of its data
died on the second call.

This was not new and not OpenAI-specific: Claude failed identically on
2026-06-20/24 (`Claude API quota or rate limit reached`, movistar + ikea), and
nobody found out then either. Extraction is also the *heaviest* request in the
pipeline (full schema instruction + the entire raw response), and the old code
dispatched the whole eligible set at once via `Promise.allSettled` — a good way
to manufacture the very 429s that then killed every row.

### Cause 3 — the failures were unreadable

`extraction_error` stored whatever `error.message` happened to be. "The account
has no credit" and "the model ignored the schema" were indistinguishable
without reading each string by hand, so no alert could ever be built on it.

---

## Decision

**1. Replace the row cap with a concurrency limit and a time budget.**
`EXTRACTION_CONCURRENCY = 4` bounds in-flight calls; `EXTRACTION_PASS_BUDGET_MS
= 25_000` bounds a pass's wall clock. No row is ever discarded for being late
in the list — the limit is on *rate*, not on *how much of the run counts*.

**2. Extract per batch, not once at finalize.** Each batch extracts the rows it
just generated, inside the same invocation, plus a final sweep at finalize.
Spreading the work across the invocations that produce it is what makes an
uncapped extraction fit the ~60s `maxDuration` (ADR 0003) at all.

**3. A run may not be marked `completed` while any answer is unextracted.**
`countUnprocessedExtractionRows` counts rows that are `completed`, hold a
`raw_response_text`, carry no `extraction_error` and were never extracted. If
that count is non-zero at finalize, the finalize job is released back to
`pending` and a continuation is scheduled, so a fresh invocation with a fresh
budget finishes the job. Progress is strictly monotonic — every pass either
extracts a row or records an error on it, and both remove it from the
unprocessed set — so this repeats a bounded number of times. A total stall is
still caught by the existing `reconcileStuckScanRuns` timeout + auto-retry.

**4. Bounded retries with backoff on all three extraction paths.**
`fetchExtractionWithRetry` (`lib/llm/extraction-fetch.ts`) gives extraction the
timeout it never had and 3 attempts with exponential backoff and **full
jitter**, honoring `Retry-After` (clamped). 429 and 5xx are retryable; 400/401/
403 are not, because they mean the key or the model id is wrong and a retry
only burns budget the remaining rows need.

**5. Categorized, sanitized errors.** `ExtractionError` carries one of
`quota | timeout | http | empty | invalid_json | schema | config | unknown`,
persisted as a `category: message` prefix. No migration: it is queryable with
`extraction_error LIKE 'quota:%'`. Only messages this codebase authored are
ever persisted — anything else is flattened to `unknown: Extraction failed.`,
which makes the "no raw provider output in the database" rule structural rather
than a review question.

---

## Consequences

- A 30-row run now yields 30 processed rows, not 13. Scores are computed on the
  whole run instead of on an arbitrary 43% of it.
- Scores computed before this change are not comparable to scores after it: the
  sample they were computed from was silently truncated. This is not a
  backfill — old runs keep their partial `extracted_json`. Re-running a scan is
  the only way to get a complete measurement of a past period.
- A run can now sit in `running` slightly longer, deferring finalize across
  invocations, where before it would have completed early and wrong. That is
  the intended trade.
- A row that fails extraction after its retries is **not** re-attempted later in
  the same run. It carries a truthful categorized error instead. Retrying it
  every pass would let one systematic failure (an exhausted account) consume the
  whole budget and starve rows nothing has looked at yet.

## What this phase deliberately does NOT do

- **No alerting.** Nothing yet emails the founder when a provider runs out of
  credit — the incident that motivated this ADR would still go unnoticed for
  four days. That is Fase B, and it depends on the categories introduced here.
  Until it ships, the detector is a manual SQL query on `extraction_error`.
- **No UI.** No screen reports extraction coverage; `extraction_error` is
  selected in two pages and rendered in none. Fase C.
- **No change to generation.** Its existing timeout + single 429 retry is
  untouched, to keep this change's blast radius on the path that was broken.
- **No backfill** of rows lost to the cap, and none of the pre-
  `verified-mention-v1` rows (MENTION-VERIFY-2, ~80% of vodafone.es).
