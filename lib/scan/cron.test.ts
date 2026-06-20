import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { createServiceClient } from "@/lib/supabase/service";
import { ProjectActionError } from "@/lib/scan/types";

const createPendingScanRunForCron = vi.fn();
vi.mock("@/lib/scan/run-creation", () => ({
  createPendingScanRunForCron: (...args: unknown[]) => createPendingScanRunForCron(...args)
}));

const executePendingScan = vi.fn();
vi.mock("@/lib/scan/executor", () => ({
  executePendingScan: (...args: unknown[]) => executePendingScan(...args)
}));

type ProjectRow = { id: string };
type ScanRunRow = { project_id: string; status: string; created_at: string };

/**
 * Minimal fake service client supporting exactly the two query shapes
 * `runDailyCronScan` issues:
 *   - projects: select("id").eq(...).eq(...)                              -> array
 *   - scan_runs: select(...).eq("project_id", id).order(...).limit(n)     -> array, newest first
 */
function fakeServiceClient({ projects, scanRuns }: { projects: ProjectRow[]; scanRuns: ScanRunRow[] }) {
  return {
    from(table: string) {
      if (table === "projects") {
        const builder = {
          select() {
            return builder;
          },
          eq() {
            return builder;
          },
          then(resolve: (value: { data: ProjectRow[]; error: null }) => unknown) {
            return Promise.resolve({ data: projects, error: null }).then(resolve);
          }
        };
        return builder;
      }

      if (table === "scan_runs") {
        return {
          select() {
            return this;
          },
          eq(_column: string, projectId: string) {
            const rows = scanRuns
              .filter((run) => run.project_id === projectId)
              .sort((a, b) => b.created_at.localeCompare(a.created_at));
            return {
              order() {
                return this;
              },
              limit(n: number) {
                return Promise.resolve({ data: rows.slice(0, n), error: null });
              }
            };
          }
        };
      }

      throw new Error(`unexpected table ${table}`);
    }
  } as unknown as ReturnType<typeof createServiceClient>;
}

const HOUR_MS = 60 * 60 * 1000;

describe("runDailyCronScan", () => {
  let nowMs: number;

  beforeEach(() => {
    nowMs = Date.parse("2026-06-20T08:00:00.000Z");
    vi.spyOn(Date, "now").mockImplementation(() => nowMs);
    createPendingScanRunForCron.mockReset().mockResolvedValue("run-id");
    executePendingScan.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty results when there are no candidate projects", async () => {
    const { runDailyCronScan } = await import("@/lib/scan/cron");
    const service = fakeServiceClient({ projects: [], scanRuns: [] });

    const result = await runDailyCronScan({ service });

    expect(result).toEqual({ processed: 0, scanned: 0, results: [] });
  });

  it("scans a never-scanned project and a project with an old scan", async () => {
    const { runDailyCronScan } = await import("@/lib/scan/cron");
    const service = fakeServiceClient({
      projects: [{ id: "never-scanned" }, { id: "old-scan" }],
      scanRuns: [
        {
          project_id: "old-scan",
          status: "completed",
          created_at: new Date(nowMs - 48 * HOUR_MS).toISOString()
        }
      ]
    });

    const result = await runDailyCronScan({ service });

    expect(result.scanned).toBe(2);
    expect(result.results).toEqual(
      expect.arrayContaining([
        { projectId: "never-scanned", status: "scanned" },
        { projectId: "old-scan", status: "scanned" }
      ])
    );
    expect(createPendingScanRunForCron).toHaveBeenCalledTimes(2);
    expect(executePendingScan).toHaveBeenCalledTimes(2);
  });

  it("orders candidates oldest-last-scan-first, never-scanned before any prior scan", async () => {
    const { runDailyCronScan } = await import("@/lib/scan/cron");
    const order: string[] = [];
    executePendingScan.mockImplementation(async ({ projectId }: { projectId: string }) => {
      order.push(projectId);
    });

    const service = fakeServiceClient({
      projects: [{ id: "scanned-recently-ish" }, { id: "never-scanned" }, { id: "scanned-2-days-ago" }],
      scanRuns: [
        {
          project_id: "scanned-recently-ish",
          status: "completed",
          created_at: new Date(nowMs - 30 * HOUR_MS).toISOString()
        },
        {
          project_id: "scanned-2-days-ago",
          status: "completed",
          created_at: new Date(nowMs - 48 * HOUR_MS).toISOString()
        }
      ]
    });

    await runDailyCronScan({ service, maxProjects: 10 });

    expect(order).toEqual(["never-scanned", "scanned-2-days-ago", "scanned-recently-ish"]);
  });

  it("skips a project scanned within the last 24h", async () => {
    const { runDailyCronScan } = await import("@/lib/scan/cron");
    const service = fakeServiceClient({
      projects: [{ id: "p1" }],
      scanRuns: [{ project_id: "p1", status: "completed", created_at: new Date(nowMs - 2 * HOUR_MS).toISOString() }]
    });

    const result = await runDailyCronScan({ service });

    expect(result.results).toEqual([{ projectId: "p1", status: "skipped_recent" }]);
    expect(createPendingScanRunForCron).not.toHaveBeenCalled();
  });

  it("skips a project with 3 consecutive failed runs (failure streak)", async () => {
    const { runDailyCronScan } = await import("@/lib/scan/cron");
    const service = fakeServiceClient({
      projects: [{ id: "p1" }],
      scanRuns: [
        { project_id: "p1", status: "failed", created_at: new Date(nowMs - 72 * HOUR_MS).toISOString() },
        { project_id: "p1", status: "failed", created_at: new Date(nowMs - 96 * HOUR_MS).toISOString() },
        { project_id: "p1", status: "failed", created_at: new Date(nowMs - 120 * HOUR_MS).toISOString() }
      ]
    });

    const result = await runDailyCronScan({ service });

    expect(result.results).toEqual([{ projectId: "p1", status: "skipped_failure_streak" }]);
    expect(createPendingScanRunForCron).not.toHaveBeenCalled();
  });

  it("marks a project as failed if run creation throws, without counting it as scanned", async () => {
    const { runDailyCronScan } = await import("@/lib/scan/cron");
    createPendingScanRunForCron.mockRejectedValueOnce(new ProjectActionError("prompts_required"));
    const service = fakeServiceClient({ projects: [{ id: "p1" }], scanRuns: [] });

    const result = await runDailyCronScan({ service });

    expect(result.scanned).toBe(0);
    expect(result.results).toEqual([{ projectId: "p1", status: "failed" }]);
  });

  it("marks a project as failed if scan execution throws, without counting it as scanned", async () => {
    const { runDailyCronScan } = await import("@/lib/scan/cron");
    executePendingScan.mockRejectedValueOnce(new Error("boom"));
    const service = fakeServiceClient({ projects: [{ id: "p1" }], scanRuns: [] });

    const result = await runDailyCronScan({ service });

    expect(result.scanned).toBe(0);
    expect(result.results).toEqual([{ projectId: "p1", status: "failed" }]);
  });

  it("excludes candidates beyond maxProjects with no result entry at all", async () => {
    const { runDailyCronScan } = await import("@/lib/scan/cron");
    const service = fakeServiceClient({
      projects: [{ id: "p1" }, { id: "p2" }, { id: "p3" }],
      scanRuns: []
    });

    const result = await runDailyCronScan({ service, maxProjects: 1 });

    expect(result.scanned).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(result.processed).toBe(1);
  });

  it("marks remaining candidates as skipped_budget once the time budget is exceeded", async () => {
    const { runDailyCronScan } = await import("@/lib/scan/cron");
    // Simulate the first batch's scans taking 50s each (over the 45s soft
    // budget), by advancing the mocked clock inside executePendingScan
    // itself.
    executePendingScan.mockImplementation(async () => {
      nowMs += 50_000;
    });

    const service = fakeServiceClient({
      projects: [{ id: "p1" }, { id: "p2" }, { id: "p3" }, { id: "p4" }],
      scanRuns: []
    });

    const result = await runDailyCronScan({ service, maxProjects: 10 });

    expect(result.scanned).toBe(2);
    const statuses = result.results.map((r) => r.status);
    expect(statuses.filter((s) => s === "scanned")).toHaveLength(2);
    expect(statuses.filter((s) => s === "skipped_budget")).toHaveLength(2);
  });

  it("reconciles a stuck run instead of skipping outright: a stale pending/running latest run that createPendingScanRunForCron clears results in a real scan", async () => {
    const { runDailyCronScan } = await import("@/lib/scan/cron");
    const service = fakeServiceClient({
      projects: [{ id: "p1" }],
      scanRuns: [{ project_id: "p1", status: "running", created_at: new Date(nowMs - 10 * 60_000).toISOString() }]
    });

    const result = await runDailyCronScan({ service });

    expect(createPendingScanRunForCron).toHaveBeenCalledTimes(1);
    expect(result.results).toEqual([{ projectId: "p1", status: "scanned" }]);
  });

  it("still reports skipped_active_run when createPendingScanRunForCron confirms the run is genuinely still active", async () => {
    const { runDailyCronScan } = await import("@/lib/scan/cron");
    createPendingScanRunForCron.mockRejectedValueOnce(new ProjectActionError("active_run_exists"));
    const service = fakeServiceClient({
      projects: [{ id: "p1" }],
      scanRuns: [{ project_id: "p1", status: "running", created_at: new Date(nowMs - 10_000).toISOString() }]
    });

    const result = await runDailyCronScan({ service });

    expect(result.results).toEqual([{ projectId: "p1", status: "skipped_active_run" }]);
    expect(executePendingScan).not.toHaveBeenCalled();
  });
});
