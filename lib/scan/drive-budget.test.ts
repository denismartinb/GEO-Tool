import { describe, expect, it } from "vitest";
import { canStartAnotherScanInvocation } from "@/lib/scan/drive-budget";
import {
  AUTO_EXECUTE_SAFE_CEILING_MS,
  SCAN_INVOCATION_WORST_CASE_MS
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
