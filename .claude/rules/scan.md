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
- **Never dispatch a whole batch on the same tick.** Bounding concurrency is
  not the same as spreading the starts: a batch that claims N prompt jobs and
  fires them simultaneously puts N calls per engine on a provider from a
  standing start, which is a good way to manufacture the 429 that then kills
  the batch. `EXTRACTION_CONCURRENCY` exists for exactly this shape one stage
  later; generation went without it until LLM-RESILIENCE-1
  (`lib/scan/pacing.ts`, log §56). The stagger is bounded in both directions —
  a hard ceiling on the total spread, and dropped entirely when the invocation
  is short on budget, because finishing inside `maxDuration` outranks pacing.
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
  function and killed a real scan (`docs/adr/0029`, Addendum). The same
  arithmetic applies to any loop that *calls* `executePendingScan`: ask
  before an iteration whether its whole worst case fits, never after one
  whether time has already run out — a `do { … } while (elapsed < budget)` lets
  an iteration start at 39s and run another 45 (`docs/adr/0037`,
  `lib/scan/drive-budget.ts`).
- **Any claim held across a step long enough to be killed needs a lease.**
  `reconcileStuckScanRuns` only ever touches `scan_runs`, never `jobs`, so a
  job left `running` by a dead invocation is stranded forever unless something
  can take it over. Use the atomic `UPDATE ... WHERE locked_at < now - lease
  RETURNING` pattern (`docs/adr/0029`, Addendum). This covers **every** job
  kind, not just the one that prompted it: the same rule was written for
  `scan_finalize` and left unapplied to `scan_prompt` for months, even though a
  prompt batch spends longer in provider calls than finalize ever does
  (`docs/adr/0037`). A lease must also be **bounded** — a stale job with no
  attempts left is failed, not reclaimed again, or one poison job consumes
  every pass forever.
- **Never let a browser be the only thing driving a scan.** Work that continues
  after a response is sent must be dispatched server-side; a client-side loop
  is an accelerator, never the engine. A phone that locks its screen suspends
  the tab's JavaScript, and the campaign then stops with its remaining jobs
  `pending` and nothing able to claim them — 31 prompts, two failed runs, 50
  real answers discarded (`docs/adr/0037`). Two drivers racing is safe here
  *because* batch claims are atomic; suppressing one to avoid "redundant" work
  is what removed the only driver that survives a locked phone.
- **A retry must start what it creates.** Creating a replacement `scan_runs`
  row is not a retry: nothing on the server executes a `pending` run on its own.
  Whatever creates one dispatches it too (`docs/adr/0037`).
- **A dispatch is delivered only if the response says so.** `fetch` resolves on
  401/404/500 and rejects only on transport failure, so an unchecked
  `await fetch(...)` reports a blocked self-call as a successful hand-off — and
  a safety net that cannot be seen failing is not a safety net. Check
  `response.ok` and log the status and the URL (`docs/adr/0037`).
- **A failure the operator can fix must reach the operator.** Persisting a
  categorized error is half the job; if nothing reads it, the incident is still
  invisible — OpenAI's 429s ran four days and Claude's ran unnoticed entirely
  (`docs/adr/0029`, Fase B). Alert on what is actionable (`quota`, `config`, a
  dead engine, a run out of retries), stay silent about model noise, and dedupe
  across projects: an alert that fires twenty times is one that gets ignored.
- **An alert's own failure must be diagnosable where you already work.** A
  `console.error` in a short-lived runtime log is not a diagnosis — persist the
  reason (`docs/adr/0029`, "What the first real delivery cost to learn"). And a
  probe that checks one segment of a delivery path must not report on the whole
  path: destination configured is not transport configured.
- **Operator alerts never go to the customer.** Backend trouble a customer
  cannot act on is noise about someone else's problem — use `OPS_ALERT_EMAIL`,
  never their address (`lib/email/transactional.ts`, precedent
  AUDIT-AFTER-SCAN-1).
- **Progress shown to a user must cover every stage that keeps them waiting.**
  A bar that measures one stage of two reads as "stuck" the moment the other
  one starts, and adding work behind an existing progress figure silently
  makes that figure a lie (`docs/adr/0029`, Fase C). Counters must be measured
  from real rows; a split between stages may be a presentation convention, but
  no number under it may be invented.
- **El trabajo de UN prompt vive en `lib/scan/prompt-job.ts`, no en el
  ejecutor.** `executor.ts` opera la campaña —reclamar lotes, presupuesto de la
  invocación, finalizar, puntuar, notificar— y `prompt-job.ts` opera un job:
  transiciones de estado, una llamada por motor con reintentos compartidos,
  inserción de resultados y registro. Estaban en el mismo fichero de 1.523
  líneas, y lo segundo es justo lo que se abre para depurar por qué falló un
  prompt concreto (log §81). Trabajo nuevo por prompt va ahí; trabajo nuevo por
  campaña, en el ejecutor — y en ambos casos se presupuesta contra la
  invocación, no contra sí mismo.
- **Terminal states stay terminal, and progress must bump `updated_at`.** Any
  path that defers work instead of finishing it must write to `scan_runs` so
  `reconcileStuckScanRuns` can tell a deferring run from a stalled one
  (`docs/scan-lifecycle.md`, "Timeout detection").
- **A constant sized for one execution model must be re-checked when the model
  changes.** SCAN-CHAIN-1 (`docs/adr/0014`) turned a run into many batches and
  the extraction cap was never revisited — that gap is the whole of ADR 0029.
- **A column read on the scan-creation critical path needs its own query, and
  its own fail-safe direction.** `createPendingScanRunCore`'s project select is
  on the path of every scan the product creates; a column PostgREST doesn't
  know about (a migration not yet applied) fails that select ENTIRELY, not
  just the one field. `sampling_enabled` (SAMPLING-DEBUG-TOGGLE-1, migration
  0032) is read in its own separate query for exactly this reason, and reads
  toward the current shipped behaviour (sampling ON) on any failure — the
  opposite fail direction from the web-audit halves (migration 0031), which
  read toward OFF because failing there only skips one audit, never a scan
  (`docs/brand/design-decisions-log.md` §53). The per-engine switches
  (ENGINE-DEBUG-TOGGLE-1, migration 0033) read the same way, in `executor.ts`
  as well as `run-creation.ts`, for the same reason — but unlike sampling,
  the empty result is also a correctness bug, not just an imprecise score:
  zero engines is zero LLM calls and a `total_prompts` stuck at 0, the exact
  fake-scan shape "no mute rows" already forbids. Both call sites reject
  outright (`no_engines_enabled`) rather than create or run that scan
  (`docs/brand/design-decisions-log.md` §54).
