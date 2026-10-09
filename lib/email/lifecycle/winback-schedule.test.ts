import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  decideTrialEndEmail,
  decideWinbackEmail,
  LIFECYCLE_SPACED_KINDS,
  TRIAL_END_KINDS,
  TRIAL_KINDS,
  WINBACK_KINDS,
  type WinbackAccountState,
  type WinbackSentState
} from "./schedule";

/**
 * LIFECYCLE-WINBACK-1 (log §236). The post-trial rules, one by one — the
 * silences as much as the sends.
 */

const HOUR = 60 * 60 * 1000;
const WEDNESDAY = new Date("2026-10-14T07:45:00Z");
const MONDAY = new Date("2026-10-12T07:45:00Z");
const ago = (hours: number, now: Date = WEDNESDAY) => new Date(now.getTime() - hours * HOUR);

describe("fin de prueba", () => {
  const ended = (hoursAgo: number) => ({ trialEndsAt: ago(hoursAgo), hasSubscription: false, isExcluded: false });

  it("sends the normal version within 48 h of the end", () => {
    expect(decideTrialEndEmail(ended(5), new Set(), WEDNESDAY)).toEqual({ kind: "trial_ended" });
    expect(decideTrialEndEmail(ended(48), new Set(), WEDNESDAY)).toEqual({ kind: "trial_ended" });
  });

  it("sends the «tardía» version to a trial that ended unannounced more than 48 h ago", () => {
    expect(decideTrialEndEmail(ended(49), new Set(), WEDNESDAY)).toEqual({ kind: "trial_ended_late" });
    expect(decideTrialEndEmail(ended(24 * 30), new Set(), WEDNESDAY)).toEqual({ kind: "trial_ended_late" });
  });

  it("goes out once, whichever version was sent", () => {
    expect(decideTrialEndEmail(ended(5), new Set(["trial_ended"]), WEDNESDAY)).toBeNull();
    expect(decideTrialEndEmail(ended(60), new Set(["trial_ended_late"]), WEDNESDAY)).toBeNull();
  });

  it("never before the end, to a subscriber or to a comped/internal account", () => {
    expect(decideTrialEndEmail({ ...ended(5), trialEndsAt: new Date(WEDNESDAY.getTime() + HOUR) }, new Set(), WEDNESDAY)).toBeNull();
    expect(decideTrialEndEmail({ ...ended(5), hasSubscription: true }, new Set(), WEDNESDAY)).toBeNull();
    expect(decideTrialEndEmail({ ...ended(5), isExcluded: true }, new Set(), WEDNESDAY)).toBeNull();
    expect(decideTrialEndEmail({ ...ended(5), trialEndsAt: null }, new Set(), WEDNESDAY)).toBeNull();
  });

  it("is not a Monday-or-48h email: account news goes out the day it happens", () => {
    expect(decideTrialEndEmail({ trialEndsAt: ago(3, MONDAY), hasSubscription: false, isExcluded: false }, new Set(), MONDAY)).toEqual({
      kind: "trial_ended"
    });
  });
});

describe("D+3 y D+10", () => {
  const account = (endHoursAgo: number, overrides: Partial<WinbackAccountState> = {}, now: Date = WEDNESDAY): WinbackAccountState => ({
    hasSubscription: false,
    isExcluded: false,
    lifecycleOptIn: true,
    endEmailSentAt: ago(endHoursAgo, now),
    ...overrides
  });
  const sent = (endHoursAgo: number, extra: Partial<WinbackSentState> = {}, now: Date = WEDNESDAY): WinbackSentState => ({
    kinds: new Set(["trial_ended"]),
    d3SentAt: null,
    lastLifecycleSentAt: ago(endHoursAgo, now),
    ...extra
  });

  it("D+3 opens 72 h after the end email", () => {
    expect(decideWinbackEmail(account(71), sent(71), true, WEDNESDAY)).toBeNull();
    expect(decideWinbackEmail(account(73), sent(73), true, WEDNESDAY)).toEqual({ kind: "winback_d3" });
  });

  it("D+3 goes out with or without a promo: its content is the scan, not the price", () => {
    expect(decideWinbackEmail(account(73), sent(73), false, WEDNESDAY)).toEqual({ kind: "winback_d3" });
  });

  it("D+10 comes 7 days after D+3, only while the promo is live", () => {
    const after = (d3HoursAgo: number) =>
      sent(240, { kinds: new Set(["trial_ended", "winback_d3"]), d3SentAt: ago(d3HoursAgo), lastLifecycleSentAt: ago(d3HoursAgo) });
    expect(decideWinbackEmail(account(240), after(167), true, WEDNESDAY)).toBeNull();
    expect(decideWinbackEmail(account(240), after(168), true, WEDNESDAY)).toEqual({ kind: "winback_d10" });
    expect(decideWinbackEmail(account(240), after(168), false, WEDNESDAY)).toBeNull();
  });

  it("D+10 measures from the end email when D+3 never went out (no scan to quote)", () => {
    expect(decideWinbackEmail(account(239), sent(239), true, WEDNESDAY)).toEqual({ kind: "winback_d3" });
    expect(decideWinbackEmail(account(241), sent(241), true, WEDNESDAY)).toEqual({ kind: "winback_d10" });
  });

  it("each goes out once", () => {
    expect(decideWinbackEmail(account(100), sent(100, { kinds: new Set(["trial_ended", "winback_d3"]) }), true, WEDNESDAY)).toBeNull();
    const both = sent(400, { kinds: new Set(["trial_ended", "winback_d3", "winback_d10"]), d3SentAt: ago(300), lastLifecycleSentAt: ago(100) });
    expect(decideWinbackEmail(account(400), both, true, WEDNESDAY)).toBeNull();
  });

  it("stays silent for a subscriber, an opt-out, an excluded account, or with no end email on record", () => {
    expect(decideWinbackEmail(account(73, { hasSubscription: true }), sent(73), true, WEDNESDAY)).toBeNull();
    expect(decideWinbackEmail(account(73, { lifecycleOptIn: false }), sent(73), true, WEDNESDAY)).toBeNull();
    expect(decideWinbackEmail(account(73, { isExcluded: true }), sent(73), true, WEDNESDAY)).toBeNull();
    expect(decideWinbackEmail(account(73, { endEmailSentAt: null }), sent(73), true, WEDNESDAY)).toBeNull();
  });

  it("keeps the 48 h spacing and skips Mondays", () => {
    expect(decideWinbackEmail(account(80), sent(80, { lastLifecycleSentAt: ago(10) }), true, WEDNESDAY)).toBeNull();
    expect(decideWinbackEmail(account(80, {}, MONDAY), sent(80, {}, MONDAY), true, MONDAY)).toBeNull();
  });

  it("stops writing after 30 days", () => {
    expect(decideWinbackEmail(account(24 * 31), sent(24 * 31), true, WEDNESDAY)).toBeNull();
  });
});

describe("kinds", () => {
  it("every kind the sequence records is allowed by the email_sends constraint (migration 0038)", () => {
    const sql = readFileSync("supabase/migrations/0038_email_sends_winback_kinds.sql", "utf8");
    for (const kind of ["first_scan", ...TRIAL_KINDS, ...TRIAL_END_KINDS, ...WINBACK_KINDS]) {
      expect(sql).toContain(`'${kind}'`);
    }
  });

  it("the 48 h spacing counts the post-trial emails too", () => {
    for (const kind of [...TRIAL_END_KINDS, ...WINBACK_KINDS]) expect(LIFECYCLE_SPACED_KINDS).toContain(kind);
  });
});
