import "server-only";

/**
 * PRELAUNCH-HARDENING-1 Fase R6 (2/2) — los mandos de UNA llamada a un LLM.
 *
 * Vivían en `lib/scan/constants.ts`, un fichero de 466 líneas cuyo resto es
 * ciclo de vida del escaneo: leases, timeouts de reconciliación, resúmenes de
 * error. El efecto era que `lib/llm/gemini-client.ts` —el transporte de un
 * proveedor— dependía del módulo de escaneo. Dependencia al revés: la capa de
 * LLM no sabe que existe un escaneo, y el escaneo sí sabe que llama a LLMs.
 *
 * Lo que NO se ha movido y por qué: `EXTRACTION_CONCURRENCY` acota cuántas
 * filas procesa una pasada del escaneo, no cómo se comporta una llamada. Es del
 * escaneo y se queda donde estaba (log §82).
 */

/** Hard per-call timeout for a structured-extraction request. Matches the generation-side budget of all three providers. */
export const EXTRACTION_CALL_TIMEOUT_MS = 20_000;

/** Total attempts per extraction call, including the first (3 = two retries). */
export const EXTRACTION_MAX_ATTEMPTS = 3;

/** First backoff delay between extraction attempts; doubles per attempt, with full jitter. */
export const EXTRACTION_RETRY_BASE_DELAY_MS = 750;

/** Ceiling for any single extraction backoff, including a provider-sent `Retry-After`. */
export const EXTRACTION_RETRY_MAX_DELAY_MS = 8_000;

/**
 * LLM-RESILIENCE-1 — bounded retry for the Gemini calls OUTSIDE the scan's
 * generation path: the onboarding wizard's suggestions, the web audit's
 * grounded content call, and the recommendation rewrite.
 *
 * Those three had no retry at all. Only `generateGeminiVisibilityAnswer` ever
 * retried a 429 (one fixed 1.5s wait), so the first rate-limited response
 * anywhere else was terminal — which is why the 2026-08-09 spike emptied the
 * wizard's competitor list on the first click while the scan itself rode it
 * out. Same asymmetry `docs/adr/0029` found between generation and extraction,
 * one layer up.
 *
 * Deliberately shorter than the extraction budget: these calls sit in a
 * request a human is waiting on, not in a background pass. Two attempts with a
 * sub-second first backoff keeps the worst case near the existing 20s per-call
 * timeout rather than doubling the wizard's perceived latency.
 */
export const LLM_CALL_MAX_ATTEMPTS = 3;

/** First backoff between attempts of an interactive Gemini call; doubles, with full jitter. */
export const LLM_CALL_RETRY_BASE_DELAY_MS = 600;

/**
 * Ceiling for one interactive backoff, including a provider-sent `Retry-After`.
 * Low on purpose: a human is waiting, and a provider asking us to come back in
 * a minute is a failure to report, not a wait to sit through.
 */
export const LLM_CALL_RETRY_MAX_DELAY_MS = 3_000;

/**
 * How long one (surface, provider, category) LLM incident stays deduped in a
 * single server instance before it may alert again.
 *
 * Read the honest limitation in `lib/llm/llm-incident.ts`: this window is
 * per-process, not global, because the persistent store the scan-health alert
 * uses (`job_logs`) is unreachable from a path with no job row — `job_id` is
 * `not null` with a composite FK to `jobs`. Founder-approved trade-off
 * (option (i), Task Intake LLM-RESILIENCE-1, 2026-08-09): duplicates across
 * warm instances are acceptable; a schema migration for a dedupe table is not,
 * being a forbidden area without its own approval.
 */
export const LLM_INCIDENT_DEDUPE_MINUTES = 60;
