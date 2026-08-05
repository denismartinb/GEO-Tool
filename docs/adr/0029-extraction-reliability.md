# ADR 0029 — Extraction must finish or say why (EXTRACTION-RELIABILITY-1)

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

## Addendum (2026-08-04) — the first cut broke scans in preview

The version of this ADR's decision that first shipped to preview **failed a
real scan**, and the way it failed is worth keeping: it was a budget error
that turned a slow campaign into a dead one.

IKEA run `9608d861` (26 prompts × 3 engines = 78 rows) generated all 26
prompts cleanly (`successful_prompts = 26, failed_prompts = 0`) and then died
with `error_summary = scan_timeout` after 190.9s. The same project, the same
26 prompts, took **33.5s and completed** on the previous run under the old
code.

**Cause 1 — a per-pass budget in a shared invocation.** Decision 1 gave each
extraction pass its own fixed 25s. But the invocation that processes the
*last* batch runs three things back to back: generation (~20s), that batch's
extraction pass (25s), then the finalize sweep (another 25s). That is ~70s of
work inside a 60s `maxDuration`. Vercel killed it mid-sweep.

**Cause 2 — and a killed finalize was unrecoverable.** The killed invocation
had already claimed the `scan_finalize` job as `running` and never reached the
code that releases it. Nothing else recovers a `jobs` row:
`reconcileStuckScanRuns` only ever touches `scan_runs`. So every subsequent
invocation failed the `status = 'pending'` claim, returned immediately without
doing any work, and `updated_at` stopped moving — until the reconciliation
pass declared the run stuck. Before extraction moved inside finalize this was
unreachable, because finalize was near-instant and effectively could not be
killed.

The two compounded: cause 1 made the kill likely, cause 2 made it permanent.
Recovery cost a full re-scan of 78 rows.

**Amended decisions:**

- `SCAN_INVOCATION_WORK_BUDGET_MS` (45s) replaces the per-pass budget. The
  executor computes **one absolute deadline at entry** and threads it into
  every extraction pass in that invocation. Generation spends from it first;
  extraction gets what is left and not a millisecond more. A pass with no
  budget left defers its rows instead of overrunning.
- `FINALIZE_LOCK_LEASE_MS` (90s): a `scan_finalize` job stuck in `running`
  with a `locked_at` older than the lease can be taken over. The takeover is
  the same atomic `UPDATE ... WHERE ... RETURNING` claim the prompt batches
  use, so it stays exclusive. 90s is far longer than any live invocation can
  now run (45s of work), so a lease only expires on an invocation that is
  genuinely gone.
- Progress counters are refreshed **after** the batch extraction pass as well
  as before it, so every invocation bumps `scan_runs.updated_at` on its way
  out. A campaign doing real work must never look stalled to the
  reconciliation pass.

The general lesson, now a rule in `.claude/rules/scan.md`: **work added inside
an invocation must be budgeted against what that invocation already spends,
not given its own allowance** — and any step long enough to be killed needs a
recoverable claim.

## Fase B (2026-08-04) — the operator finds out

Fase A made a failed extraction leave a categorized trace. Fase B is what
makes anyone read it. Without it the trace lives only in the database and the
sole detector is a manual SQL query, which is precisely why OpenAI's 429s ran
for four days and Claude's identical failure in June was never noticed at all.

**Who it goes to: the operator, never the customer.** An exhausted API account
or a dead engine is backend trouble the customer cannot act on, and telling
them their data is incomplete without being able to fix it is noise about
someone else's problem. Same reasoning, same channel (`OPS_ALERT_EMAIL`) and
same plain debugging-oriented format as `sendWebAuditFailedAlertEmail`
(AUDIT-AFTER-SCAN-1), which this deliberately mirrors rather than reinvents.

**What alerts, and what deliberately does not** (founder's decision at Task
Intake, 2026-08-04). `analyzeRunHealth` is a pure function so this judgement
is testable, not buried in plumbing:

| Condition | Alerts | Why |
|---|---|---|
| `quota:` on any row | Yes, no threshold | Never heals on its own; only the operator can clear it |
| `config:` on any row | Yes, no threshold | Wrong key or model id — the ADR 0002 class of failure |
| An engine answered but extracted **nothing** | Yes | A prompt job succeeds if *any* engine answers, so a dead engine still leaves the run "Completado" |
| An expected engine produced **no rows at all** (`engine_no_response`) | Yes | It failed at *generation* — a dead API or a rejected model id. Needs the run's expected engine set, because such an engine is simply absent from the data |
| Run `failed` with auto-retry spent | Yes | It will not try again by itself |
| Isolated `schema` / `invalid_json` / `empty` / `timeout` | **No** | Model noise: self-corrects next scan, nothing to go fix. Still counts toward `engine_down` when it takes out a whole engine — the point at which it stops being noise |

**Dedupe is cross-project, and that is the load-bearing part.** The daily cron
sweeps every project, so one exhausted account is a single incident that would
otherwise send one email per project per day. An alert that arrives twenty
times is one the operator learns to ignore, which is worse than no alert.
`SCAN_HEALTH_ALERT_DEDUPE_HOURS` (24h) is keyed on (engine, reason) across
**all** projects.

The dedupe store is `job_logs`, not `notifications`: this is an operator
alert, and writing it to `notifications` would surface it in the customer's
own in-app feed. It also needs no migration. The cost, stated rather than
hidden: the lookup is an unindexed scan over a time-bounded slice of
`job_logs`. Fine at private-beta volume, worth revisiting if that table grows.

Two deliberate asymmetries, both favouring a duplicate email over a swallowed
incident: the dedupe lookup **fails open** if it errors, and the dedupe marker
is written only *after* a successful send.

### What the first real delivery cost to learn (2026-08-05)

The first end-to-end verification of this phase took four attempts, and every
failure was the same mistake at a different depth — worth recording, because
the mistake is the one this ADR is about:

1. `isOpsAlertConfigured` checked the destination (`OPS_ALERT_EMAIL`) but not
   the transport (`RESEND_API_KEY`), so `sendEmail` no-opped afterwards on
   `if (!resend) return`. Two silent gates in series.
2. When an alert could not be delivered, the reason existed only as a
   `console.error` in Vercel's runtime logs — short-lived and, in practice,
   unreachable for the operator. "Nothing to report" and "something to report
   that could not be sent" were indistinguishable. The reason is now persisted
   to `job_logs` (`scan_health_alert_undeliverable`), diagnosable with the same
   SQL as everything else here.
3. `analyzeRunHealth` keyed on the rows that existed, so an engine that failed
   at *generation* — producing no rows at all — was absent from the data and
   silently skipped by the check written to catch exactly that. Fixed by
   passing the run's expected engine set.
4. The first alert that did arrive carried the wrong body: `engine_down` said
   "that engine answered the prompts" about an engine that had answered
   nothing. Split into `engine_down` (answered, extraction failed) and
   `engine_no_response` (never answered), because they send the operator to
   different places to look.

The through-line: **a check you cannot consult from where you already work is
not a check**, and a probe that verifies one segment of a path must not claim
to have verified the path.

## What this phase deliberately does NOT do

- **No customer-facing signal.** The operator is told; the customer is not.
  A user whose scan lost an engine sees no banner and gets no email. That is
  the honest boundary of an operational alert, and closing it needs its own
  phase.
- **No UI.** No screen reports extraction coverage; `extraction_error` is
  selected in two pages and rendered in none. Fase C.
- **No change to generation.** Its existing timeout + single 429 retry is
  untouched, to keep this change's blast radius on the path that was broken.
- **No backfill** of rows lost to the cap, and none of the pre-
  `verified-mention-v1` rows (MENTION-VERIFY-2, ~80% of vodafone.es).
