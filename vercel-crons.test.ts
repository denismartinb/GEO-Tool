import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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
 */

type VercelConfig = {
  crons?: Array<{ path: string; schedule: string }>;
};

/**
 * Every scheduled route the product depends on, with the schedule its own
 * documentation commits to. Each entry cites where that schedule is justified,
 * so a future change has something to argue with.
 */
const REQUIRED_CRONS: Array<{ path: string; schedule: string; why: string }> = [
  {
    path: "/api/cron/weekly-scans",
    schedule: "0 6 * * *",
    why: "daily scan sweep — docs/environment-contract.md, 'Recurring scans (cron)'"
  },
  {
    path: "/api/cron/weekly-digest",
    schedule: "0 8 * * 1",
    why: "weekly digest email, Mondays — ALERTS-1 Fase 6b"
  },
  {
    path: "/api/cron/run-audit",
    schedule: "0 7 * * *",
    // The hour gap is load-bearing, not cosmetic: the sweep is the safety net
    // for audits queued by the day's automatic scans, so it has to run after
    // those scans have finished queueing them.
    why: "post-scan web audit queue, one hour after the scan sweep — ADR 0027"
  }
];

function readCrons(): Array<{ path: string; schedule: string }> {
  const raw = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
  return (JSON.parse(raw) as VercelConfig).crons ?? [];
}

describe("vercel.json crons", () => {
  const crons = readCrons();

  it.each(REQUIRED_CRONS)("still schedules $path ($why)", ({ path, schedule }) => {
    const entry = crons.find((c) => c.path === path);

    expect(entry, `${path} is missing from vercel.json crons — the route exists but nothing calls it`).toBeDefined();
    expect(entry?.schedule).toBe(schedule);
  });

  it("declares no duplicate cron paths", () => {
    // Vercel's behaviour with a repeated path is unspecified, and a duplicate
    // is almost always the fossil of a bad merge rather than an intent.
    const paths = crons.map((c) => c.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
