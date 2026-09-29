import { describe, expect, it } from "vitest";
import { decideTrialEmail, trialDaysLeft, type SentState, type TrialAccountState } from "./schedule";

/**
 * LIFECYCLE-TRIAL-1 (log §233). The approved rules, one by one. The silences
 * matter as much as the sends: an email to a paying customer, to someone who
 * opted out, or twice in a day is the failure a founder hears about first.
 */

const HOUR = 60 * 60 * 1000;
// Wednesday 2026-09-30 07:45 UTC — not a Monday.
const WEDNESDAY = new Date("2026-09-30T07:45:00Z");
// Monday 2026-10-05 07:45 UTC.
const MONDAY = new Date("2026-10-05T07:45:00Z");

function account(ageHours: number, now: Date, overrides: Partial<TrialAccountState> = {}): TrialAccountState {
  const createdAt = new Date(now.getTime() - ageHours * HOUR);
  return {
    createdAt,
    trialEndsAt: new Date(createdAt.getTime() + 7 * 24 * HOUR),
    hasSubscription: false,
    isExcluded: false,
    lifecycleOptIn: true,
    hasProject: false,
    hasCompletedScan: false,
    ...overrides
  };
}

const NOTHING_SENT: SentState = { kinds: new Set(), lastLifecycleSentAt: null };
const sentKinds = (...kinds: string[]): SentState => ({ kinds: new Set(kinds), lastLifecycleSentAt: null });

describe("D1 · activation", () => {
  it("goes out on day 1 to an account with no domain yet", () => {
    expect(decideTrialEmail(account(26, WEDNESDAY), NOTHING_SENT, WEDNESDAY)).toEqual({
      kind: "trial_d1",
      variant: "no_domain"
    });
  });

  it("uses the 'launch your scan' variant when the domain exists but no scan finished", () => {
    expect(decideTrialEmail(account(26, WEDNESDAY, { hasProject: true }), NOTHING_SENT, WEDNESDAY)).toEqual({
      kind: "trial_d1",
      variant: "no_scan"
    });
  });

  it("never goes out to someone who already has a completed scan (the usual case)", () => {
    const scanned = account(26, WEDNESDAY, { hasProject: true, hasCompletedScan: true });
    expect(decideTrialEmail(scanned, NOTHING_SENT, WEDNESDAY)).toBeNull();
  });

  it("does not fire in the first hours after sign-up, nor twice", () => {
    expect(decideTrialEmail(account(5, WEDNESDAY), NOTHING_SENT, WEDNESDAY)).toBeNull();
    expect(decideTrialEmail(account(26, WEDNESDAY), sentKinds("trial_d1"), WEDNESDAY)).toBeNull();
  });
});

describe("D3 · first action", () => {
  it("goes out on day 3 with the real-recommendation variant when there is a scan", () => {
    const scanned = account(80, WEDNESDAY, { hasProject: true, hasCompletedScan: true });
    expect(decideTrialEmail(scanned, NOTHING_SENT, WEDNESDAY)).toEqual({ kind: "trial_d3", variant: "with_scan" });
  });

  it("falls back to the no-scan variant otherwise", () => {
    expect(decideTrialEmail(account(80, WEDNESDAY), sentKinds("trial_d1"), WEDNESDAY)).toEqual({
      kind: "trial_d3",
      variant: "no_scan"
    });
  });
});

describe("D5 · two days left", () => {
  it("goes out when roughly two days of trial remain", () => {
    // 7 days = 168 h; 120 h in leaves 48 h.
    expect(decideTrialEmail(account(120, WEDNESDAY), sentKinds("trial_d1", "trial_d3"), WEDNESDAY)).toEqual({
      kind: "trial_d5"
    });
  });

  it("ignores the 48 h spacing and Mondays: its date will not wait", () => {
    const recent: SentState = { kinds: new Set(["trial_d3"]), lastLifecycleSentAt: new Date(MONDAY.getTime() - 20 * HOUR) };
    expect(decideTrialEmail(account(120, MONDAY), recent, MONDAY)).toEqual({ kind: "trial_d5" });
  });

  it("is sent once, and not in the last day", () => {
    expect(decideTrialEmail(account(120, WEDNESDAY), sentKinds("trial_d5"), WEDNESDAY)).toBeNull();
    expect(decideTrialEmail(account(150, WEDNESDAY), sentKinds("trial_d3"), WEDNESDAY)).toBeNull();
  });
});

describe("global silences", () => {
  it.each([
    ["a paying account", { hasSubscription: true }],
    ["a comped or internal account", { isExcluded: true }],
    ["someone who opted out of consejos y ofertas", { lifecycleOptIn: false }],
    ["an account with no trial", { trialEndsAt: null }]
  ] as const)("sends nothing to %s", (_label, overrides) => {
    expect(decideTrialEmail(account(26, WEDNESDAY, overrides), NOTHING_SENT, WEDNESDAY)).toBeNull();
    expect(decideTrialEmail(account(120, WEDNESDAY, overrides), NOTHING_SENT, WEDNESDAY)).toBeNull();
  });

  it("sends nothing once the trial is over — that is Fase D", () => {
    expect(decideTrialEmail(account(200, WEDNESDAY), NOTHING_SENT, WEDNESDAY)).toBeNull();
  });

  it("keeps 48 h between two lifecycle emails", () => {
    const recent: SentState = { kinds: new Set(["trial_d1"]), lastLifecycleSentAt: new Date(WEDNESDAY.getTime() - 30 * HOUR) };
    expect(decideTrialEmail(account(80, WEDNESDAY, { hasCompletedScan: true }), recent, WEDNESDAY)).toBeNull();
  });

  it("leaves Mondays to the weekly digest for the non-urgent emails", () => {
    expect(decideTrialEmail(account(26, MONDAY), NOTHING_SENT, MONDAY)).toBeNull();
    expect(decideTrialEmail(account(80, MONDAY, { hasCompletedScan: true }), NOTHING_SENT, MONDAY)).toBeNull();
  });
});

describe("trialDaysLeft", () => {
  it("rounds up to whole days and never goes negative", () => {
    expect(trialDaysLeft(new Date(WEDNESDAY.getTime() + 49 * HOUR), WEDNESDAY)).toBe(3);
    expect(trialDaysLeft(new Date(WEDNESDAY.getTime() + 48 * HOUR), WEDNESDAY)).toBe(2);
    expect(trialDaysLeft(new Date(WEDNESDAY.getTime() - HOUR), WEDNESDAY)).toBe(0);
  });
});
