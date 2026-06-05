# ADR 0002 — Gemini Model Pinning

**Date:** 2026-06-05  
**Status:** Accepted  
**Deciders:** Founder + Director

---

## Context

During the first smoke test of PR #18, all Gemini calls returned HTTP 404 with:

> "This model models/gemini-2.0-flash is no longer available. Please update
> your code to use a different model."

The code had been using `gemini-2.0-flash` as the default model id. Google
deprecated this alias and it stopped being served. The failure was silent at
deploy time and only discovered during a manual smoke.

---

## Decision

The Gemini model id is **pinned** to a specific served id, not a floating alias.

Current pinned value: **`gemini-2.0-flash-001`**

Rules:
1. The default model constant in `lib/llm/gemini.ts` must always be a fully
   qualified, versioned model id — never a floating alias like
   `gemini-2.0-flash`.
2. A model change is an ADR update. It must not be made silently in a regular
   feature commit.
3. Before any smoke test, the `platform-deploy` agent must validate that the
   pinned model id is still served by the API.
4. The `GEMINI_MODEL` environment variable can override the default; its value
   must also be a fully qualified id.

---

## Consequences

- Model deprecations will no longer cause silent 404s at smoke time.
- Upgrading to a new model requires a deliberate commit + ADR update.
- The pinned id must be validated against the Gemini API before any smoke
  (Gemini occasionally retires versioned ids too).
