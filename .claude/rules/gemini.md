---
description: Gemini provider and scan-pipeline invariants.
paths:
  - "lib/llm/**"
---

# Gemini Pipeline Rules

These invariants apply automatically when touching Gemini/LLM code. Owned by the
`gemini-pipeline` and `reliability` agents.

- **Model id is pinned.** Do not silently change the Gemini model id. A model
  change is an ADR-worthy decision — see
  `docs/adr/0002-gemini-model-pinning.md`. Validate the id is still served
  before any smoke (the `gemini-2.0-flash` 404 came from a pinning gap).
- **No new providers** (OpenAI, Perplexity) without explicit approval.
- **No crawler** without explicit approval.
- **Never fake Gemini results**, and never hide a provider failure behind a
  success UI.
- **Sanitize all errors** — no raw secrets or provider stack traces in logs or
  UI.
- **Scans must complete or fail safely.** A run must never hang silently; honor
  the lifecycle state machine in `docs/scan-lifecycle.md` and the timeout
  decision in `docs/adr/0003-sync-scan-execution-and-maxduration.md`.
- Persist raw responses when expected; keep status transitions correct.
