import { describe, expect, it } from "vitest";
import { canStartAnotherScanInvocation, canStartAnotherSweepBatch } from "@/lib/scan/drive-budget";
import {
  AUTO_EXECUTE_SAFE_CEILING_MS,
  SCAN_INVOCATION_WORST_CASE_MS,
  SWEEP_SAFE_CEILING_MS
} from "@/lib/scan/constants";

/**
 * SCAN-DRIVE-1 (docs/adr/0037). The foreground driver used to decide whether
 * to keep looping with `do { ... } while (elapsed < 40s)` — an "after" check
 * about the past, when the question is "is there room for what comes next".
 */
describe("canStartAnotherScanInvocation", () => {
  it("allows the first batch of a request", () => {
    expect(canStartAnotherScanInvocation({ elapsedMs: 0 })).toBe(true);
  });

  it("refuses to start a batch that cannot finish inside maxDuration", () => {
    // The exact shape of the bug: 39s elapsed passed the old 40s check, then
    // spent up to another 45s — ~24s past the 60s ceiling, and Vercel kills
    // the function mid-batch.
    expect(canStartAnotherScanInvocation({ elapsedMs: 39_000 })).toBe(false);
  });

  it("keeps looping while a whole worst-case invocation still fits", () => {
    const lastSafeStart = AUTO_EXECUTE_SAFE_CEILING_MS - SCAN_INVOCATION_WORST_CASE_MS;

    expect(canStartAnotherScanInvocation({ elapsedMs: lastSafeStart })).toBe(true);
    expect(canStartAnotherScanInvocation({ elapsedMs: lastSafeStart + 1 })).toBe(false);
  });

  it("never lets a started batch's worst case exceed the safe ceiling", () => {
    for (let elapsed = 0; elapsed <= 60_000; elapsed += 500) {
      if (canStartAnotherScanInvocation({ elapsedMs: elapsed })) {
        expect(elapsed + SCAN_INVOCATION_WORST_CASE_MS).toBeLessThanOrEqual(AUTO_EXECUTE_SAFE_CEILING_MS);
      }
    }
  });
});

/**
 * RECURRING-CADENCE-1 (log §192). The recurring-scan sweep had the same
 * "after" bug one level up: `if (elapsed > 45_000) break`, which let a batch
 * start at 44.9s and spend another SCAN_INVOCATION_WORST_CASE_MS.
 */
describe("canStartAnotherSweepBatch", () => {
  it("allows the first batch of a sweep invocation", () => {
    expect(canStartAnotherSweepBatch({ elapsedMs: 0 })).toBe(true);
  });

  it("refuses the batch the old soft budget would have allowed", () => {
    // 44s passed `elapsed > 45_000`, then spent up to 50s more: ~94s of work
    // in a 60s function, killed before the response — and therefore before
    // either `after()` continuation was ever dispatched.
    expect(canStartAnotherSweepBatch({ elapsedMs: 44_000 })).toBe(false);
  });

  it("never lets a started batch's worst case exceed the sweep ceiling", () => {
    for (let elapsed = 0; elapsed <= 60_000; elapsed += 500) {
      if (canStartAnotherSweepBatch({ elapsedMs: elapsed })) {
        expect(elapsed + SCAN_INVOCATION_WORST_CASE_MS).toBeLessThanOrEqual(SWEEP_SAFE_CEILING_MS);
      }
    }
  });
});
