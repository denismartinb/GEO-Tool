import { describe, expect, it } from "vitest";
import { nextAuditJobState, retryWindowMinutes, WEB_AUDIT_MAX_ATTEMPTS } from "./audit-job";

const NOW = new Date("2026-08-04T10:00:00.000Z");

function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60_000);
}

describe("nextAuditJobState", () => {
  it("completes when the attempt produced no error", () => {
    expect(
      nextAuditJobState({ previousAttemptCount: 0, maxAttempts: 5, error: null, now: NOW })
    ).toEqual({ status: "completed" });
  });

  it("completes even on a late attempt — a success is a success", () => {
    expect(
      nextAuditJobState({ previousAttemptCount: 4, maxAttempts: 5, error: null, now: NOW })
    ).toEqual({ status: "completed" });
  });

  it("schedules the documented backoff after each failure", () => {
    const expected = [1, 5, 25, 120];
    expected.forEach((minutes, i) => {
      const out = nextAuditJobState({
        previousAttemptCount: i,
        maxAttempts: 5,
        error: "boom",
        now: NOW
      });
      if (out.status !== "retrying") throw new Error(`attempt ${i + 1} should retry`);
      expect(minutesBetween(NOW, out.nextAttemptAt), `backoff after attempt ${i + 1}`).toBe(minutes);
      expect(out.attemptCount).toBe(i + 1);
    });
  });

  it("gives up exactly at max_attempts, not before", () => {
    const fourth = nextAuditJobState({
      previousAttemptCount: 3,
      maxAttempts: 5,
      error: "boom",
      now: NOW
    });
    expect(fourth.status).toBe("retrying");

    const fifth = nextAuditJobState({
      previousAttemptCount: 4,
      maxAttempts: 5,
      error: "boom",
      now: NOW
    });
    expect(fifth).toEqual({ status: "failed", attemptCount: 5, lastError: "boom" });
  });

  it("carries the real error through to the failed state, for the alert email", () => {
    const out = nextAuditJobState({
      previousAttemptCount: 4,
      maxAttempts: 5,
      error: "upstream 503 from the coverage provider",
      now: NOW
    });
    if (out.status !== "failed") throw new Error("expected failure");
    expect(out.lastError).toBe("upstream 503 from the coverage provider");
  });

  it("never produces an Invalid Date when max_attempts exceeds the backoff table", () => {
    // The column allows up to 10; the table has 5 entries. Clamping keeps the
    // schedule finite instead of scheduling to NaN.
    const out = nextAuditJobState({
      previousAttemptCount: 8,
      maxAttempts: 10,
      error: "boom",
      now: NOW
    });
    if (out.status !== "retrying") throw new Error("expected retry");
    expect(Number.isNaN(out.nextAttemptAt.getTime())).toBe(false);
    expect(out.nextAttemptAt.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("honours a max_attempts of 1 by failing on the first error", () => {
    const out = nextAuditJobState({ previousAttemptCount: 0, maxAttempts: 1, error: "boom", now: NOW });
    expect(out.status).toBe("failed");
  });
});

describe("retryWindowMinutes", () => {
  it("covers most of a working day at the shipped default", () => {
    // N attempts consume N-1 backoffs, so the shipped 6 uses all five:
    // 1 + 5 + 25 + 120 + 600 = 751min ≈ 12.5h. This assertion is the reason
    // the default is 6 and not 5 — at 5 the window silently collapsed to
    // ~2.5h, which would not survive a provider outage lasting a workday.
    expect(retryWindowMinutes(WEB_AUDIT_MAX_ATTEMPTS)).toBe(751);
    expect(WEB_AUDIT_MAX_ATTEMPTS).toBeLessThanOrEqual(10); // jobs_max_attempts_chk
  });

  it("is zero when only one attempt is allowed", () => {
    expect(retryWindowMinutes(1)).toBe(0);
  });
});
