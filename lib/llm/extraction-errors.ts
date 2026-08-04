/**
 * Typed, categorized failures for the structured-extraction path
 * (EXTRACTION-RELIABILITY-1, docs/adr/0027).
 *
 * Before this phase every extraction failure was persisted as whatever
 * `error.message` happened to be, which made two very different situations
 * indistinguishable in the database: "the provider account has no credit
 * left" and "the model returned JSON we could not parse". That cost a real
 * incident: OpenAI extraction returned HTTP 429 on every call from
 * 2026-08-01, and because nothing categorized it, nobody found out for four
 * days (and Claude had failed the same way in June without being noticed
 * either). The category is what lets the alerting phase (Fase B) tell
 * "top up the account" apart from "fix the prompt".
 *
 * The category is persisted as a `category: message` prefix on
 * `scan_prompt_results.extraction_error` — deliberately a string prefix and
 * not a new column, so this needs no schema migration. It is queryable with
 * `extraction_error LIKE 'quota:%'`.
 */

export type ExtractionErrorCategory =
  /** Provider returned HTTP 429 — rate limited, or (indistinguishably, at the HTTP level) out of credit. */
  | "quota"
  /** The call exceeded its per-call timeout, or the extraction pass ran out of budget before it could start. */
  | "timeout"
  /** Any other non-OK HTTP status from the provider. */
  | "http"
  /** Provider replied 200 with no usable text. */
  | "empty"
  /** Provider replied with text that is not parseable JSON. */
  | "invalid_json"
  /** Provider replied with valid JSON that does not match `extractionOutputSchema`. */
  | "schema"
  /** Missing/invalid provider configuration (API key, model id). */
  | "config"
  /** Anything unclassified — network errors, bugs. Never carries a provider message (see `formatExtractionError`). */
  | "unknown";

export class ExtractionError extends Error {
  readonly category: ExtractionErrorCategory;

  constructor(category: ExtractionErrorCategory, message: string) {
    super(message);
    this.name = "ExtractionError";
    this.category = category;
  }
}

/**
 * Categories worth another attempt against the same provider. `quota` is in
 * here deliberately: a 429 from a burst of concurrent extraction calls is
 * genuinely transient and a backed-off retry fixes it. A 429 from an
 * exhausted account is not, but retrying it a bounded number of times costs
 * only the backoff delay and cannot make it worse — and the attempts are
 * capped, so it can never loop.
 *
 * `config`, `schema`, `invalid_json` and `empty` are NOT retryable: the same
 * request would produce the same result, so a retry only burns budget that
 * the remaining rows need.
 */
export function isRetryableExtractionCategory(category: ExtractionErrorCategory): boolean {
  return category === "quota" || category === "timeout" || category === "http";
}

/**
 * Maps a provider HTTP status onto a category. 401/400 are treated as
 * `config` rather than `http` because they are never fixed by retrying —
 * they mean the key or the model id is wrong (the same class of failure as
 * the pinned-model 404 in docs/adr/0002).
 */
export function categorizeHttpStatus(status: number): ExtractionErrorCategory {
  if (status === 429) return "quota";
  if (status === 401 || status === 403 || status === 400) return "config";
  return "http";
}

/**
 * The string persisted to `scan_prompt_results.extraction_error`.
 *
 * Only messages this codebase itself authored are ever persisted: an
 * `ExtractionError` always carries one of our own constant strings (see the
 * `get*ApiError` helpers in the provider modules), while anything else is
 * flattened to a fixed `unknown:` message. That is what keeps the
 * "sanitize all errors — no raw secrets or provider stack traces" rule in
 * .claude/rules/gemini.md true by construction rather than by review: an
 * arbitrary thrown value can never reach the database through this function.
 */
export function formatExtractionError(error: unknown): string {
  if (error instanceof ExtractionError) return `${error.category}: ${error.message}`;
  return "unknown: Extraction failed.";
}

/** The category half of `formatExtractionError`, for callers that need to branch on it. */
export function categorizeExtractionError(error: unknown): ExtractionErrorCategory {
  return error instanceof ExtractionError ? error.category : "unknown";
}
