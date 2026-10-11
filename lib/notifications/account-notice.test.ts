import { describe, expect, it } from "vitest";
import { buildAccountNotice, renderAccountNotice } from "./account-notice";

const NOW = Date.parse("2026-10-11T12:00:00Z");
const inHours = (h: number) => new Date(NOW + h * 3600_000).toISOString();
const base = { trialEndsAt: null, hasSubscription: false, lastCompletedScanAt: null, founderPrice: 69, now: NOW };

describe("buildAccountNotice", () => {
  it("counts trial days left, rounding up", () => {
    const notice = buildAccountNotice({ ...base, planId: "pro", trialEndsAt: inHours(24 * 3 + 2) });
    expect(notice).toEqual({ kind: "trial", daysLeft: 4, lastDay: false, founderPrice: 69 });
  });

  it("flags the last 24 hours as the last day", () => {
    const notice = buildAccountNotice({ ...base, planId: "pro", trialEndsAt: inHours(20) });
    expect(notice).toMatchObject({ kind: "trial", lastDay: true });
  });

  it("says nothing to a paying Pro, a comped Agency or an ended trial still read as pro", () => {
    expect(buildAccountNotice({ ...base, planId: "pro", trialEndsAt: inHours(30), hasSubscription: true })).toBeNull();
    expect(buildAccountNotice({ ...base, planId: "pro" })).toBeNull();
    expect(buildAccountNotice({ ...base, planId: "agency", trialEndsAt: inHours(30) })).toBeNull();
    expect(buildAccountNotice({ ...base, planId: "pro", trialEndsAt: inHours(-1) })).toBeNull();
  });

  it("tells a read-only account how stale its score is", () => {
    const notice = buildAccountNotice({ ...base, planId: "free", lastCompletedScanAt: inHours(-24 * 9 - 3) });
    expect(notice).toEqual({ kind: "read_only", daysSinceScan: 9, founderPrice: 69 });
  });
});

describe("renderAccountNotice", () => {
  it("is calm during the trial and only urgent on the last day", () => {
    const calm = renderAccountNotice({ kind: "trial", daysLeft: 4, lastDay: false, founderPrice: 69 });
    expect(calm.title).toBe("Te quedan 4 días de Pro");
    expect(calm.urgent).toBe(false);
    expect(calm.body).toContain("69 € al mes para siempre");

    const last = renderAccountNotice({ kind: "trial", daysLeft: 1, lastDay: true, founderPrice: null });
    expect(last.urgent).toBe(true);
    expect(last.body).not.toContain("€");
  });

  it("links to the plan change dialog", () => {
    const r = renderAccountNotice({ kind: "read_only", daysSinceScan: 1, founderPrice: null });
    expect(r.title).toBe("Tu puntuación lleva 1 día sin actualizarse");
    expect(r.href).toBe("/dashboard/settings?openPlan=pro#plan");
  });
});
