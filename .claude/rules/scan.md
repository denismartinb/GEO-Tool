# Scan Pipeline Rules

These invariants apply automatically when touching the scan pipeline
(`lib/scan/**`). Owned by the `reliability` and `gemini-pipeline` agents.
Every rule here is traceable to a document — a rule nobody can justify is
worse than no rule, because a future session will obey it anyway.

- **Never cap the work by row count.** Bound a pass by concurrency and by
  wall-clock budget, never by "process the first N rows". A row limit silently
  turns unfinished work into invisible work: `MAX_EXTRACTION_RESULTS = 20`
  discarded a third of every 30-row run for months with no error and no log
  (`docs/adr/0027`). Anything a pass cannot reach must remain eligible for the
  next one.
- **No mute rows.** A run may not reach `completed` while it holds an engine
  answer nothing has tried to extract. Either extracted data or a categorized
  `extraction_error` — never a silent gap (`docs/scan-lifecycle.md`,
  Invariants §4; `docs/adr/0027`).
- **Every outbound provider call needs a timeout and a bounded retry.** If you
  add a call, it goes through a retrying helper. The extraction path lacked
  both while generation had both, which is why every provider outage killed
  extraction alone and left the product looking healthy
  (`docs/adr/0027`, "Cause 2").
- **Persist categorized, self-authored error messages.** `category: message`,
  where the message is a constant this codebase wrote. Never persist a raw
  provider or transport message (`.claude/rules/gemini.md`, "Sanitize all
  errors"; `lib/llm/extraction-errors.ts`).
- **Terminal states stay terminal, and progress must bump `updated_at`.** Any
  path that defers work instead of finishing it must write to `scan_runs` so
  `reconcileStuckScanRuns` can tell a deferring run from a stalled one
  (`docs/scan-lifecycle.md`, "Timeout detection").
- **A constant sized for one execution model must be re-checked when the model
  changes.** SCAN-CHAIN-1 (`docs/adr/0014`) turned a run into many batches and
  the extraction cap was never revisited — that gap is the whole of ADR 0027.
