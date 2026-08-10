import {
  PROMPT_JOB_STAGGER_MIN_REMAINING_MS,
  PROMPT_JOB_STAGGER_MS,
  PROMPT_JOB_STAGGER_TOTAL_MAX_MS
} from "@/lib/scan/constants";

/**
 * LLM-RESILIENCE-1 — how long each prompt job in a batch waits before it
 * starts.
 *
 * The batch used to dispatch every claimed job at the same instant
 * (`Promise.allSettled` over the whole array), and each job fires one call per
 * engine. With `MAX_REAL_SCAN_PROMPTS = 10` that is ten simultaneous Gemini
 * requests from a standing start, and `BATCH_CONCURRENCY = 2` in the cron
 * sweep doubles it. The web audit already paces its own Gemini calls; the scan
 * did not, and `EXTRACTION_CONCURRENCY` exists because the identical "dispatch
 * everything at once" shape on the extraction side was, in the words of its
 * own comment, "a good way to manufacture the very 429s that then killed every
 * row".
 *
 * Kept pure so the arithmetic is testable without a clock or a network. The
 * calls still overlap — only their *starts* are spread, so the batch's wall
 * clock grows by the last delay, never by the sum.
 *
 * Two bounds keep this honest against `.claude/rules/scan.md`'s "budget new
 * work against the invocation, not against itself":
 *
 * 1. The total spread is capped (`PROMPT_JOB_STAGGER_TOTAL_MAX_MS`). A batch
 *    of 10 spreads over 2s, not over 10 × 250ms — the per-job gap shrinks to
 *    fit rather than the ceiling being advisory.
 * 2. Below `PROMPT_JOB_STAGGER_MIN_REMAINING_MS` of remaining budget the
 *    spread is dropped entirely. Pacing is a nicety; finishing the batch
 *    inside `maxDuration` is not, and a run that overruns is the failure mode
 *    `docs/adr/0029`'s Addendum was written about.
 */
export function computeStaggerDelaysMs(input: {
  count: number;
  /** Milliseconds left in this invocation's work budget when the batch starts. */
  remainingBudgetMs: number;
}): number[] {
  if (input.count <= 0) return [];
  if (input.count === 1) return [0];

  // No budget to spare: everyone starts at once, exactly as before this phase.
  if (input.remainingBudgetMs < PROMPT_JOB_STAGGER_MIN_REMAINING_MS) {
    return new Array<number>(input.count).fill(0);
  }

  const gaps = input.count - 1;
  const spacing = Math.min(PROMPT_JOB_STAGGER_MS, Math.floor(PROMPT_JOB_STAGGER_TOTAL_MAX_MS / gaps));

  return Array.from({ length: input.count }, (_, index) => index * spacing);
}
