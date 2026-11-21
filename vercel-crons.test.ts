import { describe, expect, it } from "vitest";
import { readAllCrons, readVercelCrons, type ScheduledCron } from "@/tests/helpers/cron-schedules";

/**
 * Static guard over `vercel.json`'s `crons`.
 *
 * A cron entry is the only thing that makes a scheduled route actually run.
 * Delete one and nothing fails: no test breaks, no type errors, the route
 * keeps existing and answering requests — it just never gets called. The
 * feature that depends on it degrades silently, weeks later, in production
 * only.
 *
 * The near-miss that motivated this file: AUDIT-AFTER-SCAN-1 added
 * `/api/cron/run-audit` in #322, and #323 (opened before that merged) also
 * edited `vercel.json`. Git merges the two cleanly because they touch
 * different keys, so a branch carrying a stale `crons` array would have
 * dropped the new entry with no conflict and no failing check. It was caught
 * by reading the merged file by hand, which is not a control.
 *
 * The assertions are deliberately about presence and schedule, not about the
 * whole file: adding a cron should not require editing this test, but
 * removing or rescheduling one should.
 *
 * CRON-HOBBY-1 (log §347): since the move to Vercel Hobby, a cron lives in one
 * of two schedulers — `vercel.json` (daily or rarer) or the pg_cron migration
 * 0045 (anything more frequent). Each entry says which, so moving one back
 * without moving its schedule fails here.
 */

/**
 * Every scheduled route the product depends on, with the schedule its own
 * documentation commits to. Each entry cites where that schedule is justified,
 * so a future change has something to argue with.
 */
const REQUIRED_CRONS: Array<ScheduledCron & { why: string }> = [
  {
    path: "/api/cron/weekly-scans",
    via: "vercel",
    schedule: "0 6 * * *",
    why: "daily scan sweep — docs/environment-contract.md, 'Recurring scans (cron)'"
  },
  {
    path: "/api/cron/weekly-digest",
    via: "vercel",
    schedule: "0 8 * * 1",
    why: "weekly digest email, Mondays — ALERTS-1 Fase 6b"
  },
  {
    path: "/api/cron/run-audit",
    via: "pg_cron",
    schedule: "*/10 * * * *",
    // Every 10 minutes, not daily (AUDIT-CRON-DRAIN-1, log §261): Vercel
    // rejects a chain of self-calls with 508 after a few hops, so the worker's
    // own self-chain cannot drain the queue. Each cron firing starts a fresh
    // chain; back on a daily schedule, every audit past the first few hops
    // waits until the next morning.
    why: "post-scan web audit queue, drained every 10 min — ADR 0027, log §261"
  },
  {
    path: "/api/cron/lifecycle-emails",
    via: "vercel",
    schedule: "45 7 * * *",
    // 09:45 Madrid in summer / 08:45 in winter: a morning inbox, and off the
    // round hour on purpose (Vercel crons on :00 queue behind everyone else's).
    why: "trial lifecycle emails D1/D3/D5 — LIFECYCLE-TRIAL-1, log §233"
  },
  {
    path: "/api/cron/scan-continue",
    via: "pg_cron",
    schedule: "*/5 * * * *",
    // A cron firing is what starts a fresh chain: Vercel cuts a scan's own
    // chain of self-calls with 508 after a few hops (log §261), so without
    // this a run waits for the 15-minute watchdog and its three resumes.
    why: "re-dispatch stalled scan runs — SCAN-CRON-DRAIN-1, log §262"
  },
  {
    path: "/api/cron/affiliate-report",
    via: "vercel",
    schedule: "0 7 5 * *",
    // The 5th, not the 1st: late renewals and refunds of the previous month
    // have had a few days to settle, and the page promises «el día 5».
    why: "monthly affiliate commissions to the operator — AFFILIATES-1"
  },
  {
    path: "/api/cron/seo-serp",
    via: "pg_cron",
    schedule: "*/10 * * * *",
    // Each pass takes what is still pending for the week (new keywords, or all
    // of them after Monday 00:00 UTC) and a quiet pass makes no provider call.
    // The cron is the engine; the run after a save is only an accelerator, so
    // a keyword it could not reach is picked up within 10 minutes (log §346).
    why: "weekly Google Top 20 of tracked keywords — SEO-TRACK-1, log §345"
  },
  {
    path: "/api/cron/scan-watchdog",
    via: "pg_cron",
    schedule: "*/15 * * * *",
    // The interval its dedupe fallback assumes (WATCHDOG_INTERVAL_MINUTES,
    // asserted again in lib/scan/watchdog.test.ts).
    why: "reconcile stalled scans and send every operator alert — ALERTS-ALWAYS-1, log §227"
  }
];

/**
 * True if a five-field cron expression fires at most once a day: fixed minute
 * and fixed hour. That is Vercel Hobby's rule; a deployment with anything more
 * frequent is rejected at build time (log §347).
 */
function firesAtMostDaily(schedule: string): boolean {
  const [minute, hour] = schedule.trim().split(/\s+/);
  return /^\d+$/.test(minute) && /^\d+$/.test(hour);
}

describe("scheduled crons", () => {
  const crons = readAllCrons();

  it.each(REQUIRED_CRONS)("still schedules $path via $via ($why)", ({ path, schedule, via }) => {
    const entry = crons.find((c) => c.path === path);

    expect(entry, `${path} is not scheduled anywhere — the route exists but nothing calls it`).toBeDefined();
    expect(entry?.via).toBe(via);
    expect(entry?.schedule).toBe(schedule);
  });

  it("keeps vercel.json within Vercel Hobby (at most once a day per cron)", () => {
    const tooFrequent = readVercelCrons().filter((c) => !firesAtMostDaily(c.schedule));
    expect(tooFrequent, "move these to the pg_cron migration (log §347)").toEqual([]);
  });

  it("does not schedule a pg_cron job that vercel.json could take", () => {
    // Fewer moving parts: a daily cron needs no secret in Vault.
    const daily = crons.filter((c) => c.via === "pg_cron" && firesAtMostDaily(c.schedule));
    expect(daily).toEqual([]);
  });

  it("declares no duplicate cron paths", () => {
    // Vercel's behaviour with a repeated path is unspecified, and a duplicate
    // is almost always the fossil of a bad merge rather than an intent.
    // Across both schedulers: the same route in both would run twice.
    const paths = crons.map((c) => c.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
