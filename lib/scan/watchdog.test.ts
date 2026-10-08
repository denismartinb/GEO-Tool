import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendWatchdogAlertEmail, isOpsAlertConfigured, reconcileStuckScanRuns, checkAndSendScanHealthAlert } =
  vi.hoisted(() => ({
    sendWatchdogAlertEmail: vi.fn(async () => undefined),
    isOpsAlertConfigured: vi.fn(() => true),
    reconcileStuckScanRuns: vi.fn(async () => ({ reconciledCount: 0 })),
    checkAndSendScanHealthAlert: vi.fn(async () => undefined)
  }));

vi.mock("@/lib/email/transactional", () => ({ sendWatchdogAlertEmail, isOpsAlertConfigured }));
vi.mock("@/lib/scan/reconciliation", () => ({ reconcileStuckScanRuns }));
vi.mock("@/lib/scan/scan-health-alert", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/scan/scan-health-alert")>()),
  checkAndSendScanHealthAlert
}));
vi.mock("next/server", () => ({ after: vi.fn() }));

import { EXTRACTION_VERSION, SCAN_TIMEOUT_ERROR_SUMMARY, WATCHDOG_ALERT_LOG_MESSAGE } from "@/lib/scan/constants";
import {
  WATCHDOG_INTERVAL_MINUTES,
  shouldAlertFailedRun,
  describeFailedRunReason,
  evaluateRecurringFreshness,
  runScanWatchdog,
  summarizeEngineIssues
} from "@/lib/scan/watchdog";
import { analyzeRunHealth } from "@/lib/scan/scan-health-alert";

/**
 * ALERTS-ALWAYS-1 (log §227). The incident this exists for: alberdiderma.es
 * failed every day from 22 to 28 Sept 2026 and no alert of any kind went
 * out. These pin the decisions — what counts as "a customer stopped getting
 * data", what is said once and what is repeated — and that nothing is marked
 * as alerted unless the email actually went.
 */

describe("evaluateRecurringFreshness", () => {
  it("counts a daily project as fresh when today's scan exists after the grace", () => {
    const now = Date.parse("2026-09-28T10:00:00.000Z");
    expect(
      evaluateRecurringFreshness({ planId: "agency", lastCompletedAt: "2026-09-28T06:00:31.000Z", now })
    ).toEqual({ stale: false, cutoffIso: "2026-09-28T06:00:00.000Z" });
  });

  it("flags a daily project whose last completed scan is from before today's firing", () => {
    // The real shape: last completed 20 Sept, checked on the 28th.
    const now = Date.parse("2026-09-28T10:00:00.000Z");
    expect(evaluateRecurringFreshness({ planId: "agency", lastCompletedAt: "2026-09-20T06:01:26.000Z", now }).stale).toBe(
      true
    );
  });

  it("does not judge today's firing before its grace has elapsed", () => {
    // 08:00 UTC: today's 06:00 scan may legitimately still be running, so the
    // question is still about yesterday's.
    const now = Date.parse("2026-09-28T08:00:00.000Z");
    expect(
      evaluateRecurringFreshness({ planId: "agency", lastCompletedAt: "2026-09-27T06:00:31.000Z", now })
    ).toEqual({ stale: false, cutoffIso: "2026-09-27T06:00:00.000Z" });
  });

  it("gives Starter its weekly cadence, like the sweep does", () => {
    const now = Date.parse("2026-09-28T10:00:00.000Z");
    expect(evaluateRecurringFreshness({ planId: "starter", lastCompletedAt: "2026-09-22T06:00:31.000Z", now }).stale).toBe(
      false
    );
    expect(evaluateRecurringFreshness({ planId: "starter", lastCompletedAt: "2026-09-21T06:00:31.000Z", now }).stale).toBe(
      true
    );
  });

  it("gives Pro (CONTRACT-99) the same weekly cadence: 6 days old is fresh, 7 days old is stale", () => {
    const now = Date.parse("2026-09-28T10:00:00.000Z");
    expect(evaluateRecurringFreshness({ planId: "pro", lastCompletedAt: "2026-09-22T06:00:31.000Z", now }).stale).toBe(
      false
    );
    expect(evaluateRecurringFreshness({ planId: "pro", lastCompletedAt: "2026-09-21T06:00:31.000Z", now }).stale).toBe(
      true
    );
  });

  it("treats a project that never completed a scan as without data", () => {
    const now = Date.parse("2026-09-28T10:00:00.000Z");
    expect(evaluateRecurringFreshness({ planId: "pro", lastCompletedAt: null, now }).stale).toBe(true);
  });
});

describe("describeFailedRunReason", () => {
  it("names a stalled chain instead of the internal code", () => {
    expect(describeFailedRunReason(SCAN_TIMEOUT_ERROR_SUMMARY)).toMatch(/sin avanzar/);
    expect(describeFailedRunReason("scan_timeout_retry_exhausted")).toMatch(/reintento/);
  });

  it("never returns an empty line", () => {
    expect(describeFailedRunReason(null)).toBeTruthy();
  });
});

describe("summarizeEngineIssues", () => {
  it("surfaces the quota that actually stopped alberdiderma.es", () => {
    const findings = analyzeRunHealth([
      {
        provider: "openai",
        status: "completed",
        raw_response_text: "x",
        extraction_version: "old",
        extraction_error: "quota: OpenAI API quota or rate limit reached."
      },
      { provider: "claude", status: "completed", raw_response_text: "x", extraction_version: EXTRACTION_VERSION, extraction_error: null }
    ]);
    expect(summarizeEngineIssues(findings)).toContain("openai: sin cuota (1/1)");
  });
});

describe("shouldAlertFailedRun", () => {
  it("always alerts a run a person launched, whatever the plan", () => {
    expect(shouldAlertFailedRun({ triggeredByUserId: "user-1", ownerPlanId: "free" })).toBe(true);
  });

  it("alerts a system run only while the account has a scanning plan", () => {
    expect(shouldAlertFailedRun({ triggeredByUserId: null, ownerPlanId: "pro" })).toBe(true);
    expect(shouldAlertFailedRun({ triggeredByUserId: null, ownerPlanId: "free" })).toBe(false);
  });
});

describe("vercel.json", () => {
  it("schedules the watchdog at the interval its dedupe fallback assumes", () => {
    const config = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8")) as {
      crons: Array<{ path: string; schedule: string }>;
    };
    const entry = config.crons.find((cron) => cron.path === "/api/cron/scan-watchdog");
    expect(entry?.schedule).toBe(`*/${WATCHDOG_INTERVAL_MINUTES} * * * *`);
  });
});

/**
 * Minimal Supabase stand-in: every chain resolves to whatever `resolve` returns
 * for (table, operation, filters). Enough to drive `runScanWatchdog` through
 * its decisions without pretending to be Postgres.
 */
type Filters = Record<string, unknown>;
function fakeService(resolve: (table: string, op: string, filters: Filters, payload?: unknown) => unknown) {
  const inserts: Array<{ table: string; rows: unknown }> = [];
  const service = {
    from(table: string) {
      const filters: Filters = {};
      let op = "select";
      let payload: unknown;
      const builder: Record<string, unknown> = {};
      const chain = (name: string) => (column: string, value?: unknown) => {
        filters[`${name}:${column}`] = value;
        return builder;
      };
      for (const name of ["eq", "in", "lt", "gte", "order", "limit", "neq"]) builder[name] = chain(name);
      builder.select = () => builder;
      builder.maybeSingle = () => builder;
      builder.insert = (rows: unknown) => {
        op = "insert";
        payload = rows;
        inserts.push({ table, rows });
        return builder;
      };
      builder.then = (onFulfilled: (value: unknown) => unknown) =>
        Promise.resolve(op === "insert" ? { error: null } : { data: resolve(table, op, filters, payload), error: null }).then(
          onFulfilled
        );
      return builder;
    }
  };
  return { service: service as never, inserts };
}

describe("runScanWatchdog", () => {
  const failedRun = {
    id: "run-9",
    project_id: "proj-1",
    created_at: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    triggered_by_user_id: null as string | null,
    finished_at: new Date().toISOString(),
    error_summary: SCAN_TIMEOUT_ERROR_SUMMARY,
    successful_prompts: 30,
    total_prompts: 30
  };

  function world({ alreadyAlerted = false }: { alreadyAlerted?: boolean } = {}) {
    return fakeService((table, _op, filters) => {
      if (table === "scan_runs" && filters["eq:status"] === "failed") return [failedRun];
      if (table === "scan_runs") return [];
      if (table === "job_logs" && filters["eq:message"] === WATCHDOG_ALERT_LOG_MESSAGE)
        return alreadyAlerted ? [{ run_id: "run-9" }] : [];
      if (table === "jobs") return [{ id: "job-finalize", run_id: "run-9", job_type: "scan_finalize" }];
      if (table === "projects" && filters["eq:recurring_scans_enabled"]) return [];
      if (table === "projects") return [{ id: "proj-1", domain: "alberdiderma.es", owner_user_id: "user-1" }];
      if (table === "profiles") return [{ id: "user-1", email: "owner@example.com", current_plan: "pro" }];
      if (table === "scan_prompt_results") return [];
      return [];
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    isOpsAlertConfigured.mockReturnValue(true);
  });

  it("emails every newly failed run, with its account, and marks it as alerted", async () => {
    const { service, inserts } = world();

    const summary = await runScanWatchdog({ service });

    expect(summary).toMatchObject({ failedRunsAlerted: 1, delivered: true });
    expect(sendWatchdogAlertEmail).toHaveBeenCalledTimes(1);
    const [payload] = sendWatchdogAlertEmail.mock.calls[0] as unknown as [
      { failedRuns: Array<{ domain: string; ownerEmail: string; retryStarted: boolean }> }
    ];
    expect(payload.failedRuns[0]).toMatchObject({
      domain: "alberdiderma.es",
      ownerEmail: "owner@example.com",
      retryStarted: false
    });
    expect(inserts).toEqual([
      {
        table: "job_logs",
        rows: [expect.objectContaining({ job_id: "job-finalize", run_id: "run-9", context_json: { kind: "failed_run" } })]
      }
    ]);
  });

  // ALERTS-SCOPE-1: the first real pass alerted about eight runs stuck for
  // weeks on accounts whose trials had ended and recurring was off.
  it("stays silent about a zombie run created days ago and only now failed", async () => {
    const { service } = fakeService((table, _op, filters) => {
      if (table === "scan_runs" && filters["eq:status"] === "failed")
        return [{ ...failedRun, created_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString() }];
      return [];
    });

    expect((await runScanWatchdog({ service })).failedRunsAlerted).toBe(0);
    expect(sendWatchdogAlertEmail).not.toHaveBeenCalled();
  });

  it("stays silent about a system-launched run on an account without a scanning plan", async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { service } = fakeService((table, _op, filters) => {
      if (table === "scan_runs" && filters["eq:status"] === "failed") return [failedRun];
      if (table === "jobs") return [{ id: "job-finalize", run_id: "run-9", job_type: "scan_finalize" }];
      if (table === "projects" && filters["eq:recurring_scans_enabled"]) return [];
      if (table === "projects") return [{ id: "proj-1", domain: "azotea.cl", owner_user_id: "user-1" }];
      // Expired trial never revisited: `current_plan` still says pro.
      if (table === "profiles") return [{ id: "user-1", email: "o@example.com", current_plan: "pro", trial_ends_at: past }];
      return [];
    });

    expect((await runScanWatchdog({ service })).failedRunsAlerted).toBe(0);
    expect(sendWatchdogAlertEmail).not.toHaveBeenCalled();
  });

  it("says each failed run once", async () => {
    const { service, inserts } = world({ alreadyAlerted: true });

    const summary = await runScanWatchdog({ service });

    expect(summary.failedRunsAlerted).toBe(0);
    expect(sendWatchdogAlertEmail).not.toHaveBeenCalled();
    expect(inserts).toEqual([]);
  });

  it("marks nothing when the alert channel cannot deliver, so it goes out once it can", async () => {
    isOpsAlertConfigured.mockReturnValue(false);
    const { service, inserts } = world();

    const summary = await runScanWatchdog({ service });

    expect(summary.delivered).toBe(false);
    expect(sendWatchdogAlertEmail).not.toHaveBeenCalled();
    expect(inserts).toEqual([]);
  });

  it("marks nothing when the send throws", async () => {
    sendWatchdogAlertEmail.mockRejectedValueOnce(new Error("resend down"));
    const { service, inserts } = world();

    const summary = await runScanWatchdog({ service });

    expect(summary.delivered).toBe(false);
    expect(inserts).toEqual([]);
  });

  it("checks runs in flight for quota/config only, never for 'nothing extracted yet'", async () => {
    const { service } = fakeService((table, _op, filters) => {
      if (table === "scan_runs" && Array.isArray(filters["in:status"])) return [{ id: "run-live", project_id: "proj-1" }];
      if (table === "jobs") return [{ id: "job-finalize", run_id: "run-live", job_type: "scan_finalize" }];
      return [];
    });

    await runScanWatchdog({ service });

    expect(checkAndSendScanHealthAlert).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "run-live", finalizeJobId: "job-finalize", onlyReasons: ["quota", "config"] })
    );
  });

  it("reconciles every project with a stalled run, not only the one someone is looking at", async () => {
    const { service } = fakeService((table, _op, filters) => {
      if (table === "scan_runs" && filters["eq:status"] === "running") return [{ project_id: "proj-a" }];
      if (table === "scan_runs" && filters["eq:status"] === "pending") return [{ project_id: "proj-b" }];
      return [];
    });

    const summary = await runScanWatchdog({ service });

    expect(summary.reconciledProjects).toBe(2);
    expect(reconcileStuckScanRuns).toHaveBeenCalledWith(expect.objectContaining({ projectId: "proj-a" }));
    expect(reconcileStuckScanRuns).toHaveBeenCalledWith(expect.objectContaining({ projectId: "proj-b" }));
  });

  it("reports a recurring project that went a cycle without data, once per cycle", async () => {
    const make = (alerted: boolean) =>
      fakeService((table, _op, filters) => {
        if (table === "projects" && filters["eq:recurring_scans_enabled"])
          return [{ id: "proj-1", domain: "alberdiderma.es", owner_user_id: "user-1" }];
        if (table === "profiles") return [{ id: "user-1", email: "owner@example.com", current_plan: "pro" }];
        if (table === "scan_runs" && filters["eq:project_id"] === "proj-1")
          return [
            { id: "run-9", status: "failed", created_at: "2026-09-28T06:00:31.000Z" },
            { id: "run-1", status: "completed", created_at: "2026-09-20T06:01:26.000Z" }
          ];
        if (table === "jobs") return [{ id: "job-x", run_id: "run-9", job_type: "scan_start" }];
        if (table === "job_logs" && filters["eq:context_json->>kind"] === "stale_data")
          return alerted ? [{ project_id: "proj-1", context_json: { kind: "stale_data", cutoff: cutoffFor() } }] : [];
        return [];
      });
    const cutoffFor = () => evaluateRecurringFreshness({ planId: "pro", lastCompletedAt: null, now: Date.now() }).cutoffIso;

    const first = make(false);
    const summary = await runScanWatchdog({ service: first.service });
    expect(summary.staleProjectsAlerted).toBe(1);
    expect(first.inserts[0]?.rows).toEqual([
      expect.objectContaining({ project_id: "proj-1", run_id: "run-9", context_json: { kind: "stale_data", cutoff: cutoffFor() } })
    ]);

    vi.clearAllMocks();
    isOpsAlertConfigured.mockReturnValue(true);
    const second = make(true);
    expect((await runScanWatchdog({ service: second.service })).staleProjectsAlerted).toBe(0);
    expect(sendWatchdogAlertEmail).not.toHaveBeenCalled();
  });

  it("stays silent about Free projects and projects with a scan in flight", async () => {
    const { service } = fakeService((table, _op, filters) => {
      if (table === "projects" && filters["eq:recurring_scans_enabled"])
        return [
          { id: "proj-free", domain: "free.es", owner_user_id: "user-free" },
          { id: "proj-live", domain: "live.es", owner_user_id: "user-pro" }
        ];
      if (table === "profiles")
        return [
          { id: "user-free", email: "f@example.com", current_plan: "free" },
          { id: "user-pro", email: "p@example.com", current_plan: "pro" }
        ];
      if (table === "scan_runs" && filters["eq:project_id"] === "proj-live")
        return [{ id: "run-live", status: "running", created_at: "2026-09-28T06:00:31.000Z" }];
      return [];
    });

    expect((await runScanWatchdog({ service })).staleProjectsAlerted).toBe(0);
    expect(sendWatchdogAlertEmail).not.toHaveBeenCalled();
  });
});
