import { describe, expect, it } from "vitest";
import { computeStaggerDelaysMs } from "@/lib/scan/pacing";
import {
  PROMPT_JOB_STAGGER_MIN_REMAINING_MS,
  PROMPT_JOB_STAGGER_MS,
  PROMPT_JOB_STAGGER_TOTAL_MAX_MS
} from "@/lib/scan/constants";

const COMFORTABLE = PROMPT_JOB_STAGGER_MIN_REMAINING_MS + 10_000;

describe("computeStaggerDelaysMs", () => {
  it("returns nothing for an empty batch", () => {
    expect(computeStaggerDelaysMs({ count: 0, remainingBudgetMs: COMFORTABLE })).toEqual([]);
  });

  it("does not delay a single job — there is no burst to spread", () => {
    expect(computeStaggerDelaysMs({ count: 1, remainingBudgetMs: COMFORTABLE })).toEqual([0]);
  });

  it("spaces a small batch by the nominal gap, starting the first job immediately", () => {
    const delays = computeStaggerDelaysMs({ count: 4, remainingBudgetMs: COMFORTABLE });
    expect(delays).toEqual([0, PROMPT_JOB_STAGGER_MS, PROMPT_JOB_STAGGER_MS * 2, PROMPT_JOB_STAGGER_MS * 3]);
  });

  it("shrinks the gap so a full batch still fits the total ceiling", () => {
    // The ceiling is the invariant: with MAX_REAL_SCAN_PROMPTS jobs the
    // nominal gap would overrun it, so the spacing gives way, not the cap.
    const delays = computeStaggerDelaysMs({ count: 10, remainingBudgetMs: COMFORTABLE });
    expect(delays.at(-1)).toBeLessThanOrEqual(PROMPT_JOB_STAGGER_TOTAL_MAX_MS);
    expect(delays[0]).toBe(0);
    expect(delays).toHaveLength(10);
  });

  it("never exceeds the total ceiling at any batch size", () => {
    for (let count = 2; count <= 64; count += 1) {
      const delays = computeStaggerDelaysMs({ count, remainingBudgetMs: COMFORTABLE });
      expect(delays.at(-1)).toBeLessThanOrEqual(PROMPT_JOB_STAGGER_TOTAL_MAX_MS);
    }
  });

  it("keeps the delays monotonically non-decreasing", () => {
    const delays = computeStaggerDelaysMs({ count: 7, remainingBudgetMs: COMFORTABLE });
    for (let i = 1; i < delays.length; i += 1) {
      expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1]);
    }
  });

  it("drops the stagger entirely when the invocation is nearly out of budget", () => {
    // `.claude/rules/scan.md`: budget new work against the invocation. Pacing
    // is the first thing to give up when the deadline is close.
    const delays = computeStaggerDelaysMs({
      count: 10,
      remainingBudgetMs: PROMPT_JOB_STAGGER_MIN_REMAINING_MS - 1
    });
    expect(delays).toEqual(new Array(10).fill(0));
  });

  it("treats an already-overrun budget as no budget rather than going negative", () => {
    const delays = computeStaggerDelaysMs({ count: 5, remainingBudgetMs: -5_000 });
    expect(delays).toEqual([0, 0, 0, 0, 0]);
  });
});
