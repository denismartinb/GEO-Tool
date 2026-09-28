import { describe, expect, it } from "vitest";
import { SCAN_TIMEOUT_ERROR_SUMMARY } from "@/lib/scan/constants";
import { deriveAccountHealth, type HealthRun } from "@/lib/admin/account-health";

/**
 * ADMIN-HEALTH-1 (log §230). The "Error" column must agree with the watchdog
 * emails about what a problem is (§227, §229): failed runs someone expected,
 * runs that stopped advancing, recurring projects without data in their
 * cycle — and silence about accounts that have no reason to get data.
 */

const NOW = Date.parse("2026-09-28T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW - h * 60 * 60 * 1000).toISOString();

function run(overrides: Partial<HealthRun>): HealthRun {
  return {
    status: "completed",
    created_at: hoursAgo(5),
    updated_at: hoursAgo(5),
    error_summary: null,
    triggered_by_user_id: null,
    ...overrides
  };
}

describe("deriveAccountHealth", () => {
  it("is healthy when today's scan completed", () => {
    expect(
      deriveAccountHealth({
        planId: "pro",
        now: NOW,
        projects: [{ domain: "ok.es", recurringEnabled: true, runs: [run({ created_at: "2026-09-28T06:00:31.000Z" })] }]
      })
    ).toEqual({ hasError: false, reasons: [] });
  });

  it("flags the alberdiderma.es shape: latest run failed after the chain stalled", () => {
    const health = deriveAccountHealth({
      planId: "pro",
      now: NOW,
      projects: [
        {
          domain: "alberdiderma.es",
          recurringEnabled: true,
          runs: [run({ status: "failed", error_summary: SCAN_TIMEOUT_ERROR_SUMMARY }), run({ created_at: hoursAgo(200) })]
        }
      ]
    });
    expect(health.hasError).toBe(true);
    expect(health.reasons[0]).toMatch(/^alberdiderma\.es: último escaneo fallido .*sin avanzar/);
  });

  it("flags a run that stopped advancing, and does not double-report it as stale", () => {
    const health = deriveAccountHealth({
      planId: "pro",
      now: NOW,
      projects: [{ domain: "stuck.es", recurringEnabled: true, runs: [run({ status: "running", updated_at: hoursAgo(2) })] }]
    });
    expect(health.reasons).toHaveLength(1);
    expect(health.reasons[0]).toMatch(/escaneo parado/);
  });

  it("does not flag a run that is still advancing", () => {
    expect(
      deriveAccountHealth({
        planId: "pro",
        now: NOW,
        projects: [{ domain: "live.es", recurringEnabled: true, runs: [run({ status: "running", updated_at: hoursAgo(0.1) })] }]
      }).hasError
    ).toBe(false);
  });

  it("flags a recurring project with no completed scan in its cycle", () => {
    const health = deriveAccountHealth({
      planId: "pro",
      now: NOW,
      projects: [{ domain: "quiet.es", recurringEnabled: true, runs: [run({ created_at: hoursAgo(80) })] }]
    });
    expect(health.reasons[0]).toMatch(/^quiet\.es: sin datos nuevos desde/);
  });

  it("stays silent about Free / expired-trial accounts the system does not scan", () => {
    expect(
      deriveAccountHealth({
        planId: "free",
        now: NOW,
        projects: [
          { domain: "azotea.cl", recurringEnabled: true, runs: [run({ status: "failed", created_at: hoursAgo(6) })] }
        ]
      }).hasError
    ).toBe(false);
  });

  it("still flags a Free user's own failed scan — a prospect who sees nothing", () => {
    expect(
      deriveAccountHealth({
        planId: "free",
        now: NOW,
        projects: [
          {
            domain: "prospect.es",
            recurringEnabled: false,
            runs: [run({ status: "failed", created_at: hoursAgo(6), triggered_by_user_id: "user-1" })]
          }
        ]
      }).hasError
    ).toBe(true);
  });

  it("treats a failure older than a week as history, not a current problem", () => {
    expect(
      deriveAccountHealth({
        planId: "pro",
        now: NOW,
        projects: [{ domain: "old.es", recurringEnabled: false, runs: [run({ status: "failed", created_at: hoursAgo(24 * 10) })] }]
      }).hasError
    ).toBe(false);
  });

  it("lists one reason per affected domain", () => {
    const health = deriveAccountHealth({
      planId: "agency",
      now: NOW,
      projects: [
        { domain: "a.es", recurringEnabled: true, runs: [run({ status: "failed" })] },
        { domain: "b.es", recurringEnabled: true, runs: [run({ created_at: "2026-09-28T06:00:31.000Z" })] },
        { domain: "c.es", recurringEnabled: true, runs: [] }
      ]
    });
    expect(health.reasons.map((reason) => reason.split(":")[0])).toEqual(["a.es", "c.es"]);
  });
});
