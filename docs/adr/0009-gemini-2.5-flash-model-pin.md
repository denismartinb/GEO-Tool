# ADR 0009 — Re-pin Gemini Model to gemini-2.5-flash

**Date:** 2026-06-14
**Status:** Accepted
**Deciders:** Founder + Director

---

## Context

Newly launched scans started failing with `scan_failed_no_results`
("Fallido · 0/6") on every project, including a brand-new project's very
first scan — pointing to a systemic, model-level failure rather than a
project-specific one.

Google shut down `gemini-2.0-flash`, **`gemini-2.0-flash-001`** (the id
pinned by ADR 0002), `gemini-2.0-flash-lite` and `gemini-2.0-flash-lite-001`
on **2026-06-01**. From that date, every `generateGeminiVisibilityAnswer`
call (and the structured-extraction call) returns an error for the pinned
model id. Because all 6 prompts in a run fail identically, `promptSuccess`
is `0` and the run is marked `scan_failed_no_results` regardless of the
project.

---

## Decision

Re-pin the default Gemini model id (`DEFAULT_GEMINI_MODEL` in
`lib/llm/gemini.ts`) from `gemini-2.0-flash-001` to **`gemini-2.5-flash`**,
per Google's recommended migration path for the retired 2.0 Flash models.

If a `GEMINI_MODEL` environment variable override is set in Vercel, it must
also be updated to a served model id (this requires founder action in the
Vercel dashboard — not changeable from the codebase).

---

## Consequences

- Scans resume succeeding once the new pinned id is deployed and any Vercel
  `GEMINI_MODEL` override is updated to match.
- `gemini-2.5-flash` itself has an announced cutover date of **2026-10-16**.
  Before that date, this ADR must be revisited and the pin updated again —
  add this to `docs/director-strategy.md` as a tracked item.
- Per ADR 0002 rule 3, the `platform-deploy` agent must validate the pinned
  model id is still served before any smoke test going forward.

---

## Addendum (2026-06-14) — disable "thinking" for latency

`GEMINI_MODEL=gemini-2.5-flash` was already set as a Vercel env override
since 2026-06-11 (independent of this ADR's default-constant change), yet
scans continued to intermittently fail with `scan_failed_no_results` after
that date. Root cause: `gemini-2.5-flash` has "thinking" enabled by default,
which combined with `google_search` grounding regularly pushes per-call
latency past `GEMINI_CALL_TIMEOUT_MS` (20s), producing `GeminiTimeoutError`
on most/all of the 6 prompts in a run.

Fix: all three Gemini calls (`generateGeminiVisibilityAnswer`,
`extractGeminiStructuredData`, `generateGeminiJson`) now set
`generationConfig.thinkingConfig.thinkingBudget = 0` to restore latency
comparable to the previously pinned `gemini-2.0-flash-001`.

---

## Addendum (2026-06-17) — `MAX_REAL_SCAN_PROMPTS` raised to 10 under multi-engine load, as a monitored experiment

Multi-engine execution (migration `0009_scan_result_multi_provider.sql`, PR
#114) fans each prompt out to one concurrent call per active engine
(currently up to 2: Gemini, Claude). When PR #114 merged,
`MAX_REAL_SCAN_PROMPTS` was deliberately kept at `6` (not the `10` restored
by #113 per this ADR's first addendum) specifically because 6 × 2 = 12
concurrent calls was the last validated-safe ceiling, while 10 × 2 = 20
would re-risk the `GeminiTimeoutError`-under-load failure mode described
above.

The founder explicitly chose to raise it back to `10` anyway and measure
real-world timeout/failure rates in production via `job_logs`, rather than
stage through an intermediate value first. Vercel is on the **Hobby** plan,
so `maxDuration` cannot be raised past 60s as a mitigation if timeouts
reappear — the only code-level lever in that case is lowering
`MAX_REAL_SCAN_PROMPTS` again (8 was the conservative fallback considered
but not yet tried).
