import "server-only";

import {
  ExtractionError,
  categorizeHttpStatus,
  isRetryableExtractionCategory,
  type ExtractionErrorCategory
} from "@/lib/llm/extraction-errors";

/**
 * The one HTTP path every provider's structured-extraction call goes through
 * (EXTRACTION-RELIABILITY-1, docs/adr/0027).
 *
 * Before this phase, the *generation* call of all three providers had a
 * timeout and a single 429 retry, while the *extraction* call of all three
 * had neither — a bare `fetch` that died on the first non-OK response. That
 * asymmetry is why every observed provider outage landed on extraction and
 * never on generation: generation rode out the 429, extraction did not.
 *
 * Extraction is also the heaviest request in the pipeline (the full schema
 * instruction plus the entire raw response text) and, before this phase, the
 * whole eligible set was dispatched at once — so it is precisely the call
 * that most needs backoff, not the one that can do without it.
 */

export type ExtractionFetchOptions = {
  /** Hard per-attempt timeout. */
  timeoutMs: number;
  /** Total attempts including the first (so 3 = two retries). */
  maxAttempts: number;
  /** First backoff delay; doubles per attempt, plus jitter. */
  baseDelayMs: number;
  /** Ceiling for a single backoff delay, including a server-sent `Retry-After`. */
  maxDelayMs: number;
  /**
   * Absolute epoch-ms budget for the whole extraction pass. No new attempt
   * (and no backoff sleep that would overrun it) is started past this point —
   * the caller gets a `timeout` ExtractionError instead of blowing the
   * Vercel maxDuration for the whole invocation.
   */
  deadlineAt?: number;
  /** Maps a non-OK status to one of the provider's own sanitized messages. */
  describeStatus: (status: number) => string;
  /** Message for the timeout/abort case. */
  timeoutMessage: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Honors a server-sent `Retry-After` (delta-seconds form only — the HTTP-date
 * form is not used by any of the three providers), clamped to `maxDelayMs` so
 * a provider asking us to wait a minute cannot stall the invocation. Falls
 * back to exponential backoff with full jitter, which is what keeps a batch
 * of concurrent extraction calls from retrying in lockstep and re-creating
 * the burst that rate-limited them in the first place.
 */
export function computeRetryDelayMs(input: {
  attempt: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryAfterHeader: string | null;
  random?: () => number;
}): number {
  const retryAfterSeconds = Number(input.retryAfterHeader);
  if (input.retryAfterHeader !== null && Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return Math.min(retryAfterSeconds * 1000, input.maxDelayMs);
  }

  const random = input.random ?? Math.random;
  const exponential = Math.min(input.baseDelayMs * 2 ** (input.attempt - 1), input.maxDelayMs);
  // Full jitter: a uniform draw over [0, exponential], per the standard
  // AWS backoff guidance — decorrelates concurrent retries better than
  // "exponential + small jitter".
  return Math.round(random() * exponential);
}

async function fetchOnce(url: string, init: RequestInit, timeoutMs: number, timeoutMessage: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new ExtractionError("timeout", timeoutMessage);
    // A network-level failure carries no message we are willing to persist
    // (it can embed the URL) — categorize it as retryable transport and let
    // formatExtractionError flatten it if it ends up terminal.
    throw new ExtractionError("http", "Extraction request failed before reaching the provider.");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Performs the extraction request with bounded retries. Returns an OK
 * `Response`; throws a categorized `ExtractionError` when every attempt has
 * been used or the failure is not worth retrying.
 */
export async function fetchExtractionWithRetry(
  url: string,
  init: RequestInit,
  options: ExtractionFetchOptions
): Promise<Response> {
  let lastError: ExtractionError = new ExtractionError("unknown", "Extraction failed.");

  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    if (options.deadlineAt !== undefined && Date.now() >= options.deadlineAt) {
      throw new ExtractionError("timeout", options.timeoutMessage);
    }

    let response: Response | null = null;
    try {
      response = await fetchOnce(url, init, options.timeoutMs, options.timeoutMessage);
    } catch (error) {
      lastError = error instanceof ExtractionError ? error : new ExtractionError("unknown", "Extraction failed.");
      if (!isRetryableExtractionCategory(lastError.category) || attempt === options.maxAttempts) throw lastError;
    }

    if (response) {
      if (response.ok) return response;

      const category: ExtractionErrorCategory = categorizeHttpStatus(response.status);
      lastError = new ExtractionError(category, options.describeStatus(response.status));
      if (!isRetryableExtractionCategory(category) || attempt === options.maxAttempts) throw lastError;

      const delayMs = computeRetryDelayMs({
        attempt,
        baseDelayMs: options.baseDelayMs,
        maxDelayMs: options.maxDelayMs,
        retryAfterHeader: response.headers.get("retry-after")
      });
      // Never sleep past the pass budget: waiting out a backoff we cannot
      // afford would starve the rows still queued behind this one.
      if (options.deadlineAt !== undefined && Date.now() + delayMs >= options.deadlineAt) throw lastError;
      await sleep(delayMs);
      continue;
    }

    const delayMs = computeRetryDelayMs({
      attempt,
      baseDelayMs: options.baseDelayMs,
      maxDelayMs: options.maxDelayMs,
      retryAfterHeader: null
    });
    if (options.deadlineAt !== undefined && Date.now() + delayMs >= options.deadlineAt) throw lastError;
    await sleep(delayMs);
  }

  throw lastError;
}
