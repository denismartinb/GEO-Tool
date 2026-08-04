# Scan Pipeline Rules

These invariants apply automatically when touching the scan pipeline
(`lib/scan/**`). Owned by the `reliability` and `gemini-pipeline` agents.
Every rule here is traceable to a document — a rule nobody can justify is
worse than no rule, because a future session will obey it anyway.

- **Never cap the work by row count.** Bound a pass by concurrency and by
  wall-clock budget, never by "process the first N rows". A row limit silently
  turns unfinished work into invisible work: `MAX_EXTRACTION_RESULTS = 20`
  discarded a third of every 30-row run for months with no error and no log
  (`docs/adr/0029`). Anything a pass cannot reach must remain eligible for the
  next one.
- **No mute rows.** A run may not reach `completed` while it holds an engine
  answer nothing has tried to extract. Either extracted data or a categorized
  `extraction_error` — never a silent gap (`docs/scan-lifecycle.md`,
  Invariants §4; `docs/adr/0029`).
- **Every outbound provider call needs a timeout and a bounded retry.** If you
  add a call, it goes through a retrying helper. The extraction path lacked
  both while generation had both, which is why every provider outage killed
  extraction alone and left the product looking healthy
  (`docs/adr/0029`, "Cause 2").
- **Persist categorized, self-authored error messages.** `category: message`,
  where the message is a constant this codebase wrote. Never persist a raw
  provider or transport message (`.claude/rules/gemini.md`, "Sanitize all
  errors"; `lib/llm/extraction-errors.ts`).
- **Budget new work against the invocation, not against itself.** A step added
  inside `executePendingScan` shares the ~60s `maxDuration` with everything
  else already there. Compute one absolute deadline at entry and thread it
  down; never give a new step its own fixed allowance. Giving extraction a
  per-pass 25s put the final batch's invocation at ~70s of work in a 60s
  function and killed a real scan (`docs/adr/0029`, Addendum).
- **Any claim held across a step long enough to be killed needs a lease.**
  `reconcileStuckScanRuns` only ever touches `scan_runs`, never `jobs`, so a
  job left `running` by a dead invocation is stranded forever unless something
  can take it over. Use the atomic `UPDATE ... WHERE locked_at < now - lease
  RETURNING` pattern (`docs/adr/0029`, Addendum).
- **A failure the operator can fix must reach the operator.** Persisting a
  categorized error is half the job; if nothing reads it, the incident is still
  invisible — OpenAI's 429s ran four days and Claude's ran unnoticed entirely
  (`docs/adr/0029`, Fase B). Alert on what is actionable (`quota`, `config`, a
  dead engine, a run out of retries), stay silent about model noise, and dedupe
  across projects: an alert that fires twenty times is one that gets ignored.
- **Operator alerts never go to the customer.** Backend trouble a customer
  cannot act on is noise about someone else's problem — use `OPS_ALERT_EMAIL`,
  never their address (`lib/email/transactional.ts`, precedent
  AUDIT-AFTER-SCAN-1).
- **Terminal states stay terminal, and progress must bump `updated_at`.** Any
  path that defers work instead of finishing it must write to `scan_runs` so
  `reconcileStuckScanRuns` can tell a deferring run from a stalled one
  (`docs/scan-lifecycle.md`, "Timeout detection").
- **A constant sized for one execution model must be re-checked when the model
  changes.** SCAN-CHAIN-1 (`docs/adr/0014`) turned a run into many batches and
  the extraction cap was never revisited — that gap is the whole of ADR 0029.
