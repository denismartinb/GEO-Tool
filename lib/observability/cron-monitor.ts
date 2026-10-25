import "server-only";

import * as Sentry from "@sentry/nextjs";
import { isAuthorizedInternalRequest } from "@/lib/api/internal-auth";

/**
 * OBSERVABILITY-1 (log §300): Sentry Cron Monitors for every Vercel cron.
 *
 * What the email alerts can't see is a cron that never ran, or that Vercel
 * killed mid-pass: no code of ours is left alive to send anything. Those are
 * exactly the incidents of §227 (six days of failed scans without one email)
 * and §262 (a chain cut by 508). A monitor inverts that: Sentry expects a
 * check-in on the schedule and raises an issue when it doesn't arrive
 * ("missed"), when it stays `in_progress` past `maxRuntime` ("timeout"), or
 * when the route answers 5xx ("error").
 *
 * The schedules MUST follow the scheduler that fires each cron: `vercel.json`
 * for the daily ones, the pg_cron migration 0045 for the frequent ones
 * (CRON-HOBBY-1, log §347). `cron-monitor.test.ts` reads both and fails if
 * they drift, same guard as `lib/scan/cron-schedule.test.ts`.
 *
 * The Vercel ones get a 60-minute margin: on Hobby a cron set for 06:00 fires
 * anywhere between 06:00 and 06:59, so a tighter margin reports a "missed"
 * run that was only late.
 */

type CronMonitorSpec = {
  schedule: string;
  /** Minutes Sentry waits past the expected time before calling it missed. */
  checkinMargin: number;
  /** Consecutive failures before an issue opens. Frequent crons get slack. */
  failureIssueThreshold: number;
};

export const CRON_MONITORS = {
  "/api/cron/weekly-scans": { schedule: "0 6 * * *", checkinMargin: 60, failureIssueThreshold: 1 },
  "/api/cron/weekly-digest": { schedule: "0 8 * * 1", checkinMargin: 60, failureIssueThreshold: 1 },
  "/api/cron/run-audit": { schedule: "*/10 * * * *", checkinMargin: 5, failureIssueThreshold: 3 },
  "/api/cron/scan-watchdog": { schedule: "*/15 * * * *", checkinMargin: 5, failureIssueThreshold: 2 },
  "/api/cron/lifecycle-emails": { schedule: "45 7 * * *", checkinMargin: 60, failureIssueThreshold: 1 },
  "/api/cron/scan-continue": { schedule: "*/5 * * * *", checkinMargin: 3, failureIssueThreshold: 3 },
  "/api/cron/affiliate-report": { schedule: "0 7 5 * *", checkinMargin: 60, failureIssueThreshold: 1 },
  "/api/cron/seo-serp": { schedule: "*/10 * * * *", checkinMargin: 5, failureIssueThreshold: 3 }
} as const satisfies Record<string, CronMonitorSpec>;

export type CronPath = keyof typeof CRON_MONITORS;

/**
 * OBSERVABILITY-2 (log §302): which crons actually check in. Sentry's free
 * plan includes ONE cron monitor; every further slug is rejected ("Cron
 * monitors budget consumed", 2026-10-11) and would only work on
 * pay-as-you-go. The default is the watchdog because it is the monitor of
 * monitors: it reconciles stalled scans of every project and sends every
 * operator alert, so if it stops, everything else goes quiet with it. The
 * other crons still report their errors (`reportError` and the exception
 * path below); what they lose is only "missed"/"timeout" detection.
 *
 * `SENTRY_CRON_MONITORS` (comma-separated names, e.g.
 * `scan-watchdog,scan-continue`, or `all`) widens it once the plan allows.
 */
export const DEFAULT_MONITORED_CRONS = ["scan-watchdog"] as const;

export function isMonitoredCron(path: CronPath, setting: string | undefined): boolean {
  const name = path.slice("/api/cron/".length);
  const raw = setting?.trim();
  if (!raw) return (DEFAULT_MONITORED_CRONS as readonly string[]).includes(name);
  if (raw === "all") return true;
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .includes(name);
}

/** `/api/cron/scan-watchdog` → `cron-scan-watchdog`. */
export function monitorSlug(path: CronPath): string {
  return `cron-${path.slice("/api/cron/".length)}`;
}

/**
 * Wraps a cron route's GET. Check-ins only happen in production, with Sentry
 * configured, and for the request Vercel actually sent (a stray or forged hit
 * answers 401 inside the handler and must not count as a run). Everything
 * else passes straight through, so the route behaves exactly as before.
 */
export function withCronMonitor(path: CronPath, handler: (request: Request) => Promise<Response>) {
  return async function monitored(request: Request): Promise<Response> {
    const enabled =
      Boolean(process.env.SENTRY_DSN) &&
      process.env.VERCEL_ENV === "production" &&
      isAuthorizedInternalRequest(request, process.env.CRON_SECRET);
    if (!enabled) return handler(request);

    if (!isMonitoredCron(path, process.env.SENTRY_CRON_MONITORS)) {
      // No check-in, but an exception still reaches Sentry as an error.
      try {
        return await handler(request);
      } catch (error) {
        Sentry.captureException(error, { tags: { cron: monitorSlug(path) } });
        await Sentry.flush(2000);
        throw error;
      }
    }

    const spec: CronMonitorSpec = CRON_MONITORS[path];
    const monitorSlugValue = monitorSlug(path);
    const startedAt = Date.now();
    const checkInId = Sentry.captureCheckIn(
      { monitorSlug: monitorSlugValue, status: "in_progress" },
      {
        schedule: { type: "crontab", value: spec.schedule },
        checkinMargin: spec.checkinMargin,
        // Every cron route has maxDuration = 60 s; past 2 min it is dead.
        maxRuntime: 2,
        timezone: "Etc/UTC",
        failureIssueThreshold: spec.failureIssueThreshold,
        recoveryThreshold: 1
      }
    );

    const finish = async (status: "ok" | "error") => {
      Sentry.captureCheckIn({
        monitorSlug: monitorSlugValue,
        status,
        checkInId,
        duration: (Date.now() - startedAt) / 1000
      });
      await Sentry.flush(2000);
    };

    try {
      const response = await handler(request);
      await finish(response.status >= 500 ? "error" : "ok");
      return response;
    } catch (error) {
      Sentry.captureException(error, { tags: { cron: monitorSlugValue } });
      await finish("error");
      throw error;
    }
  };
}
