# WEB-AUDIT-CHAIN — Batched, self-driving coverage audits

**Status:** Implemented 2026-07-09, on top of WEB-AUDIT-1 + WEB-AUDIT-DQ.
**Origin:** founder feedback that Ryanair (49 active prompts) only ever
audited 6 of them — `MAX_COVERAGE_TOPICS` was a hard per-request cap tied to
the page's `maxDuration=60`, and topic selection was deterministic (citation-
gap-backing prompts first, then creation order), so the other 43 prompts were
never audited no matter how many times "Auditar ahora" was clicked. The
founder proposed reusing the same batched, self-chaining mechanism scans
already use (SCAN-CHAIN-1 / ADR-0014) instead of just raising the fixed cap.

## Design

Mirrors ADR-0014 deliberately, including its lesson: the background
`after()`-driven self-chain (`/api/scan/continue`) proved unreliable behind
Vercel preview-deployment protection, so scans now drive batches from a
**foreground** loop in the user's own authenticated browser session
(`AutoExecuteScan`). WEB-AUDIT-CHAIN only implements that proven foreground
path — no background self-chain, no new secret-gated route.

### Persistence model change

Coverage went from "insert one row when the whole audit finishes" to a
**campaign row that starts `running` and is UPDATEd in place across batches**,
flipping to `completed` on the last one:

- First batch of a new campaign: `INSERT` into `generated_solutions` with
  `status='running'`, `sanitized_content` holding the topics covered so far.
  Allowed by the existing `gensol_status_chk` (no migration needed — `running`
  was already a valid status).
- Every following batch for the same campaign: `UPDATE ... WHERE id = <row>`,
  never a new `INSERT`.
- Final batch: `status='completed'`.

### Rate limit: one campaign = one unit, not one call = one unit

`checkGenerationRateLimit` counts `generated_solutions` rows by `created_at`,
regardless of status. Because a campaign only ever inserts once and updates
thereafter, it naturally stays at exactly one counted row for its whole
lifetime — **as long as resuming never re-inserts and never re-checks the
limit**. The rate limit is therefore checked only when starting a brand-new
campaign; resuming an existing `running` row for the current scan skips the
check entirely (re-checking could spuriously block a campaign that is already
one of today's counted units once the project is at its daily ceiling).

### Remaining-prompts computation (no jobs table needed)

Unlike scans (which claim individual `scan_prompt` job rows), coverage has no
per-topic job table. "What's left to audit" is instead recomputed on every
call: `(active prompts) − (promptIds already present in the persisted
topics)`. This is deliberately **not** fixed at campaign creation — an edited
prompt set self-corrects mid-campaign for free, and a campaign abandoned
mid-flight (tab closed) has no "stuck" failure mode to reconcile: it just
sits at `running` until the next "Auditar ahora" click resumes it from
wherever it left off.

### Budget-guard behavior changed by chaining

The existing per-batch time guard (`BATCH_TIME_BUDGET_MS`, 45s) used to mark
any topic it didn't reach as `COULD_NOT_VERIFY_NOTE` — a reasonable terminal
state when there was no next batch. Now that there IS a next batch, marking a
never-attempted topic as inconclusive would permanently waste it (inconclusive
counts as "covered" for the remaining-prompts computation). The guard now
`break`s instead: an un-attempted prompt is left out of `topics` entirely and
picked up normally by the next chained batch.

### Client driver

`run-audit-button.tsx` loops `auditDomainCoverageAction` (mirrors
`AutoExecuteScan`), showing real progress (`Auditando… N/49 temas`) and
stopping when `status === "completed"`. Capped at `MAX_DRIVE_ITERATIONS = 60`
(generous headroom over the Agency plan's 300-prompt ceiling at ~6
topics/batch) purely to guarantee termination.

## What did NOT change

- Detection logic (the Gemini prompt from WEB-AUDIT-DQ) — untouched.
- Fail-closed own-domain verification, sanitization, Pro gate — untouched.
- `RULE_ID` was not bumped: the persisted `DomainCoverageMap` shape is
  identical whether partial or complete, so old completed rows remain valid
  cache hits.
- The Auditoría web page's history query still filters `status='completed'`,
  so an in-progress campaign is invisible there until it finishes — consistent
  with how scan progress is only reflected in Overview once a run completes.

## Tests

`lib/recommendations/domain-coverage.test.ts` — `describe("batched campaign
chaining (WEB-AUDIT-CHAIN)")`: resumes across two real calls against a
stateful mock (9 prompts, 6/batch → running after call 1, completed after
call 2, exactly one INSERT + one UPDATE); rate limit skipped on resume even
when the mock says "blocked"; a stale `running` row from an older scan is
never resumed (fresh campaign starts instead, checked against the limit
normally).
