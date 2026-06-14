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
