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
- **Every provider call retries, not just the ones in the scan.** A bounded
  retry with backoff belongs to the *call*, not to the pipeline that happens to
  host it. For months only `generateGeminiVisibilityAnswer` retried a 429; the
  wizard's suggestions, the audit's grounded call and the recommendation
  rewrite threw on the first non-OK response. On 2026-08-09 that meant one
  rate-limited minute emptied the onboarding wizard while the scan running in
  the same minute rode it out — same provider, same error, different outcome
  purely because one path backed off (log §56; the same asymmetry as
  `docs/adr/0029` between generation and extraction). New call site → it goes
  through a retrying helper.
- **A `catch` that discards the cause is a bug, not a style.** Returning `null`
  or `[]` on failure is often the right contract; throwing the reason away with
  it is never. Categorize it and report it before you degrade
  (`lib/llm/llm-incident.ts`). Two silent `catch {}` in `lib/llm/gemini.ts` are
  why a real incident produced ~70 errors in Google's console and zero traces
  in ours (log §56).
- **An LLM failure the operator can fix must reach the operator, wherever it
  happened.** `lib/scan/scan-health-alert.ts` only covers paths with a `run`
  and a `job` — everything else goes through `reportLlmIncident`. Alert on
  `quota` and `config`; stay silent about model noise, same threshold and same
  reasoning as the scan alert (`docs/adr/0029`, Fase B).
- **Never tell the user a cause the code cannot know.** A failed suggestion
  looks identical from the browser whether the provider was down or the domain
  is one the model knows nothing about. User-facing copy says what is certain
  and what to do next; the diagnosis goes to the operator (log §56).
- **Lo que comparten los tres motores no vive dentro de uno de ellos.** La
  forma de respuesta de un prompt (`GeminiVisibilityResponse`), la de la
  extracción, `BusinessProfile` y `otherBrandsRelevanceHint` los usan Gemini,
  OpenAI y Claude por igual — es lo que permite que `lib/scan/executor.ts` los
  trate igual. Vivían dentro de `lib/llm/gemini.ts`, así que el cliente de un
  proveedor era dependencia de sus dos competidores y cualquier mudanza dentro
  de él arrastraba a los otros dos. Van en `lib/llm/contracts.ts`, que no lee
  entorno ni llama a nadie (log §79). Motor nuevo o contrato nuevo → ahí. El
  nombre `Gemini…` de dos de esos tipos es histórico y miente a propósito:
  renombrarlo toca ~15 ficheros y es una decisión aparte, no un efecto colateral.
- **`lib/llm/gemini.ts` es el motor Gemini del escaneo, no el sitio donde se
  escriben las llamadas nuevas.** Contiene lo mismo que `openai.ts` y
  `claude.ts` —generación por prompt y extracción estructurada— y nada más. Una
  llamada de producto va al módulo de su zona (`lib/web-audit/`,
  `lib/competitors/`, `lib/projects/`, `lib/recommendations/`) y usa
  `lib/llm/gemini-client.ts` como transporte. El motivo no es estético: mientras
  las nueve funcionalidades vivieron dentro de `gemini.ts`, la regla de ruta que
  se inyectaba al tocarlas era ésta y **la de su zona no llegaba nunca**
  (log §80).
- **El barril de reexports de `lib/llm/gemini.ts` no es deuda: es el punto de
  inyección de los tests.** Seis ficheros hacen `vi.mock("@/lib/llm/gemini", …)`,
  así que esa ruta de import es por donde el suite sustituye al proveedor.
  Apuntar los sitios de llamada al módulo nuevo deja esos mocks sin efecto.
  Quitarlo exige cambiar antes la estrategia de mocking, y es una decisión
  propia, no una limpieza (log §80).
- **Scans must complete or fail safely.** A run must never hang silently; honor
  the lifecycle state machine in `docs/scan-lifecycle.md` and the timeout
  decision in `docs/adr/0003-sync-scan-execution-and-maxduration.md`.
- Persist raw responses when expected; keep status transitions correct.
