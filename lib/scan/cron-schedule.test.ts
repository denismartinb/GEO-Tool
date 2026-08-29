import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  RECURRING_CRON_UTC_HOUR,
  mostRecentCronFiringAt,
  resolveEligibilityCutoffIso
} from "@/lib/scan/cron";

/**
 * RECURRING-CADENCE-1 (log §191). Recurring-scan eligibility is anchored to
 * the cron's fixed firing time instead of a rolling window measured backwards
 * from `Date.now()`. These are the parts of that decision verifiable without a
 * database: the anchor arithmetic, and the fact that the anchor still matches
 * what Vercel is actually scheduled to fire.
 */
describe("recurring-scan cron schedule", () => {
  it("keeps RECURRING_CRON_UTC_HOUR in step with vercel.json", () => {
    const vercelConfig = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8")) as {
      crons: Array<{ path: string; schedule: string }>;
    };

    const sweepCron = vercelConfig.crons.find((entry) => entry.path === "/api/cron/weekly-scans");
    expect(sweepCron, "the recurring-scan cron must exist in vercel.json").toBeDefined();

    // A mismatch here is invisible at runtime: the sweep would still run, and
    // would still skip or scan projects — just against an anchor that is not
    // the hour it actually fires at, shifting every project's eligibility by
    // the difference.
    const [minute, hour] = (sweepCron as { schedule: string }).schedule.split(" ");
    expect(minute).toBe("0");
    expect(Number(hour)).toBe(RECURRING_CRON_UTC_HOUR);
  });
});

describe("mostRecentCronFiringAt", () => {
  it("returns today's firing once it has passed", () => {
    const now = Date.parse("2026-06-20T08:00:00.000Z");
    expect(new Date(mostRecentCronFiringAt(now)).toISOString()).toBe("2026-06-20T06:00:00.000Z");
  });

  it("returns yesterday's firing before today's has happened", () => {
    const now = Date.parse("2026-06-20T05:59:59.000Z");
    expect(new Date(mostRecentCronFiringAt(now)).toISOString()).toBe("2026-06-19T06:00:00.000Z");
  });

  it("treats the firing instant itself as already fired", () => {
    const now = Date.parse("2026-06-20T06:00:00.000Z");
    expect(new Date(mostRecentCronFiringAt(now)).toISOString()).toBe("2026-06-20T06:00:00.000Z");
  });

  it("is stable across a whole day of firing times: the anchor never moves with the caller", () => {
    // The property the old rolling window lacked. Every chained link of one
    // day's sweep — and every off-schedule run comparison — must resolve to
    // the same instant, whatever minute it happens to ask at.
    const firstLink = mostRecentCronFiringAt(Date.parse("2026-06-20T06:00:12.000Z"));
    const lateLink = mostRecentCronFiringAt(Date.parse("2026-06-20T06:47:33.000Z"));
    const muchLater = mostRecentCronFiringAt(Date.parse("2026-06-20T23:59:59.000Z"));

    expect(lateLink).toBe(firstLink);
    expect(muchLater).toBe(firstLink);
  });
});

describe("resolveEligibilityCutoffIso", () => {
  const now = Date.parse("2026-06-20T08:00:00.000Z");

  it("uses this firing itself for a daily plan", () => {
    expect(resolveEligibilityCutoffIso({ planId: "pro", now })).toBe("2026-06-20T06:00:00.000Z");
    expect(resolveEligibilityCutoffIso({ planId: "agency", now })).toBe("2026-06-20T06:00:00.000Z");
  });

  it("uses six days before this firing for Starter's weekly cadence", () => {
    // So a scan 7 days ago qualifies whatever time of day it happened, and
    // one 6 days ago does not — the boundary is a firing, not a stopwatch.
    expect(resolveEligibilityCutoffIso({ planId: "starter", now })).toBe("2026-06-14T06:00:00.000Z");
  });

  it("falls back to the daily cadence for an unknown plan id", () => {
    expect(resolveEligibilityCutoffIso({ planId: "enterprise-2027", now })).toBe("2026-06-20T06:00:00.000Z");
  });

  it("never lets an off-schedule run inside the previous interval block the next firing", () => {
    // The founder-visible bug, as a property: a run at ANY time of the day
    // before this firing is before the cutoff for a daily plan.
    const cutoff = resolveEligibilityCutoffIso({ planId: "pro", now });

    for (const hour of [0, 6, 9, 13, 18, 23]) {
      const yesterdayRun = `2026-06-19T${String(hour).padStart(2, "0")}:08:00.000Z`;
      expect(yesterdayRun < cutoff, `a run at ${yesterdayRun} must not block the 06:00 firing`).toBe(true);
    }
  });
});
