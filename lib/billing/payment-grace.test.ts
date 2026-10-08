import { describe, expect, it } from "vitest";
import {
  PAYMENT_GRACE_DAYS,
  READ_ONLY_BLOCKS,
  evaluatePaymentAccess,
  isBlockedForAccess,
  nextFirstFailedAt
} from "./payment-grace";

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.parse("2026-10-10T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

describe("evaluatePaymentAccess", () => {
  it("is full access when no payment has failed", () => {
    expect(evaluatePaymentAccess(null, T0)).toEqual({ mode: "full", graceEndsAt: null, daysLeft: null });
  });

  it("is grace for 3 days from the first failure, counting whole days left", () => {
    expect(PAYMENT_GRACE_DAYS).toBe(3);
    expect(evaluatePaymentAccess(iso(T0), T0)).toMatchObject({ mode: "grace", daysLeft: 3, graceEndsAt: iso(T0 + 3 * DAY) });
    expect(evaluatePaymentAccess(iso(T0), T0 + 1 * DAY)).toMatchObject({ mode: "grace", daysLeft: 2 });
    expect(evaluatePaymentAccess(iso(T0), T0 + 3 * DAY - 1)).toMatchObject({ mode: "grace", daysLeft: 1 });
  });

  it("is read-only at exactly 3 days, not 3 days and a bit", () => {
    expect(evaluatePaymentAccess(iso(T0), T0 + 3 * DAY)).toEqual({
      mode: "read_only",
      graceEndsAt: iso(T0 + 3 * DAY),
      daysLeft: 0
    });
  });

  it("stays read-only (not downgraded, not deleted) for as long as it goes unpaid", () => {
    expect(evaluatePaymentAccess(iso(T0), T0 + 90 * DAY).mode).toBe("read_only");
  });

  it("an unreadable stored date keeps access rather than locking a customer on a bad value", () => {
    expect(evaluatePaymentAccess("not a date", T0).mode).toBe("full");
  });
});

describe("nextFirstFailedAt — idempotent, ordered", () => {
  it("records the first failure", () => {
    expect(nextFirstFailedAt(null, { type: "failed", createdMs: T0 })).toBe(iso(T0));
  });

  it("KEEPS the initial date across Stripe's retries: a later failure never restarts the clock", () => {
    let stored: string | null = null;
    for (const retry of [0, 1, 3, 5].map((d) => T0 + d * DAY)) {
      stored = nextFirstFailedAt(stored, { type: "failed", createdMs: retry });
    }
    expect(stored).toBe(iso(T0));
    expect(evaluatePaymentAccess(stored, T0 + 3 * DAY).mode).toBe("read_only");
  });

  it("is idempotent: redelivering the same failure changes nothing", () => {
    const once = nextFirstFailedAt(null, { type: "failed", createdMs: T0 });
    expect(nextFirstFailedAt(once, { type: "failed", createdMs: T0 })).toBe(once);
  });

  it("an out-of-order OLDER failure moves the date back to the real first failure", () => {
    const stored = nextFirstFailedAt(null, { type: "failed", createdMs: T0 + 2 * DAY });
    expect(nextFirstFailedAt(stored, { type: "failed", createdMs: T0 })).toBe(iso(T0));
  });

  it("a payment clears the failure and returns the account to full access", () => {
    const stored = iso(T0);
    const cleared = nextFirstFailedAt(stored, { type: "paid", createdMs: T0 + 4 * DAY });
    expect(cleared).toBeNull();
    expect(evaluatePaymentAccess(cleared, T0 + 4 * DAY).mode).toBe("full");
  });

  it("a payment delivered late but OLDER than the failure must not wipe the failure", () => {
    const stored = iso(T0);
    expect(nextFirstFailedAt(stored, { type: "paid", createdMs: T0 - DAY })).toBe(stored);
  });

  it("a payment with nothing stored stays null", () => {
    expect(nextFirstFailedAt(null, { type: "paid", createdMs: T0 })).toBeNull();
  });

  it("a fresh failure after a payment starts a NEW 3-day window", () => {
    let stored = nextFirstFailedAt(null, { type: "failed", createdMs: T0 });
    stored = nextFirstFailedAt(stored, { type: "paid", createdMs: T0 + 2 * DAY });
    stored = nextFirstFailedAt(stored, { type: "failed", createdMs: T0 + 30 * DAY });
    expect(stored).toBe(iso(T0 + 30 * DAY));
  });
});

describe("read-only", () => {
  it("blocks everything that spends or changes the setup, and only in read_only", () => {
    for (const action of READ_ONLY_BLOCKS) {
      expect(isBlockedForAccess("read_only", action), action).toBe(true);
      expect(isBlockedForAccess("grace", action), action).toBe(false);
      expect(isBlockedForAccess("full", action), action).toBe(false);
    }
  });

  it("spending is covered: manual and scheduled scans, prompts, audits, rewrites", () => {
    expect(READ_ONLY_BLOCKS).toEqual(
      expect.arrayContaining(["launch_scan", "scheduled_scan", "add_prompts", "run_audit", "generate_recommendation_rewrite"])
    );
  });
});
