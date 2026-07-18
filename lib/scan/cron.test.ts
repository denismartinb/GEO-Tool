import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { createServiceClient } from "@/lib/supabase/service";
import { ProjectActionError } from "@/lib/scan/types";

const createPendingScanRunForCron = vi.fn();
vi.mock("@/lib/scan/run-creation", () => ({
  createPendingScanRunForCron: (...args: unknown[]) => createPendingScanRunForCron(...args)
}));

const executePendingScan = vi.fn();
vi.mock("@/lib/scan/executor", () => ({
  executePendingScan: (...args: unknown[]) => executePendingScan(...args),
  getSiteUrl: () => "http://test.local"
}));

// `after()` callbacks are captured, not executed — a test that wants to
// observe the continuation dispatch flushes them explicitly.
const afterCallbacks: Array<() => unknown> = [];
vi.mock("next/server", () => ({
  after: (fn: () => unknown) => {
    afterCallbacks.push(fn);
  }
}));

async function flushAfterCallbacks() {
  const callbacks = afterCallbacks.splice(0);
  await Promise.all(callbacks.map((fn) => fn()));
}

type ProjectRow = { id: string; owner_user_id?: string };
type ScanRunRow = { project_id: string; status: string; created_at: string };
type ProfileRow = { id: string; current_plan: string };

/**
 * Minimal fake service client supporting exactly the query shapes
 * `runDailyCronScan` issues:
 *   - projects: select("id, owner_user_id").eq(...).eq(...)                     -> array
 *   - profiles: select("id, current_plan").in("id", ownerIds)                  -> array
 *   - scan_runs: select(...).eq("project_id", id).order(...).limit(n)          -> array, newest first
 *
 * `owner_user_id` defaults to the project's own id when a test doesn't care
 * about plan-based behavior; `profiles` defaults to empty, which makes every
 * owner resolve to the default plan ("pro") via `resolvePlan` — preserving
 * the pre-PRICING-TRUTH-1 universal-24h cadence for every test that doesn't
 * explicitly opt into plan-cadence assertions.
 */
function fakeServiceClient({
  projects,
  scanRuns,
  profiles = []
}: {
  projects: ProjectRow[];
  scanRuns: ScanRunRow[];
  profiles?: ProfileRow[];
}) {
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
            const rows = projects.map((p) => ({ owner_user_id: p.id, ...p }));
            return Promise.resolve({ data: rows, error: null }).then(resolve);
          }
        };
        return builder;
      }

      if (table === "profiles") {
        return {
          select() {
            return this;
          },
          in(_column: string, ids: string[]) {
            return Promise.resolve({ data: profiles.filter((p) => ids.includes(p.id)), error: null });
          }
        };
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
    afterCallbacks.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty results when there are no candidate projects", async () => {
    const { runDailyCronScan } = await import("@/lib/scan/cron");
    const service = fakeServiceClient({ projects: [], scanRuns: [] });

    const result = await runDailyCronScan({ service });

    expect(result).toEqual({
      processed: 0,
      scanned: 0,
      results: [],
      deferred: 0,
      continuationScheduled: false
    });
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
    expect(result.deferred).toBe(2);
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
    expect(result.deferred).toBe(2);
    expect(result.continuationScheduled).toBe(true);
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

describe("runDailyCronScan — plan-based cadence and eligibility (PRICING-TRUTH-1)", () => {
  let nowMs: number;

  beforeEach(() => {
    nowMs = Date.parse("2026-06-20T08:00:00.000Z");
    vi.spyOn(Date, "now").mockImplementation(() => nowMs);
    createPendingScanRunForCron.mockReset().mockResolvedValue("run-id");
    executePendingScan.mockReset().mockResolvedValue(undefined);
    afterCallbacks.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("applies Starter's weekly cadence, skipping a project scanned 3 days ago even though it's over 24h", async () => {
    const { runDailyCronScan } = await import("@/lib/scan/cron");
    const service = fakeServiceClient({
      projects: [{ id: "p1" }],
      profiles: [{ id: "p1", current_plan: "starter" }],
      scanRuns: [{ project_id: "p1", status: "completed", created_at: new Date(nowMs - 72 * HOUR_MS).toISOString() }]
    });

    const result = await runDailyCronScan({ service });

    expect(result.results).toEqual([{ projectId: "p1", status: "skipped_recent" }]);
    expect(createPendingScanRunForCron).not.toHaveBeenCalled();
  });

  it("scans a Starter-plan project once its last scan is over 7 days old", async () => {
    const { runDailyCronScan } = await import("@/lib/scan/cron");
    const service = fakeServiceClient({
      projects: [{ id: "p1" }],
      profiles: [{ id: "p1", current_plan: "starter" }],
      scanRuns: [{ project_id: "p1", status: "completed", created_at: new Date(nowMs - 8 * 24 * HOUR_MS).toISOString() }]
    });

    const result = await runDailyCronScan({ service });

    expect(result.results).toEqual([{ projectId: "p1", status: "scanned" }]);
  });

  it("still applies the daily cadence for Pro and Agency plans", async () => {
    const { runDailyCronScan } = await import("@/lib/scan/cron");
    const service = fakeServiceClient({
      projects: [{ id: "pro-project" }, { id: "agency-project" }],
      profiles: [
        { id: "pro-project", current_plan: "pro" },
        { id: "agency-project", current_plan: "agency" }
      ],
      scanRuns: [
        { project_id: "pro-project", status: "completed", created_at: new Date(nowMs - 30 * HOUR_MS).toISOString() },
        { project_id: "agency-project", status: "completed", created_at: new Date(nowMs - 30 * HOUR_MS).toISOString() }
      ]
    });

    const result = await runDailyCronScan({ service });

    expect(result.results).toEqual(
      expect.arrayContaining([
        { projectId: "pro-project", status: "scanned" },
        { projectId: "agency-project", status: "scanned" }
      ])
    );
  });

  it("filters out a free-plan project as skipped_plan_ineligible without attempting a scan", async () => {
    const { runDailyCronScan } = await import("@/lib/scan/cron");
    const service = fakeServiceClient({
      projects: [{ id: "free-project" }],
      profiles: [{ id: "free-project", current_plan: "free" }],
      // Recurring requires a prior completed scan to enable in the first
      // place — included here to prove the filter still applies even if a
      // free-plan project somehow reached this state.
      scanRuns: [{ project_id: "free-project", status: "completed", created_at: new Date(nowMs - 8 * 24 * HOUR_MS).toISOString() }]
    });

    const result = await runDailyCronScan({ service });

    expect(result.results).toEqual([{ projectId: "free-project", status: "skipped_plan_ineligible" }]);
    expect(createPendingScanRunForCron).not.toHaveBeenCalled();
    expect(executePendingScan).not.toHaveBeenCalled();
  });
});

describe("runDailyCronScan — self-chaining sweep (ASYNC-SCAN-1a)", () => {
  let nowMs: number;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    nowMs = Date.parse("2026-06-20T08:00:00.000Z");
    vi.spyOn(Date, "now").mockImplementation(() => nowMs);
    createPendingScanRunForCron.mockReset().mockResolvedValue("run-id");
    executePendingScan.mockReset().mockResolvedValue(undefined);
    afterCallbacks.length = 0;
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("dispatches a sweep continuation when candidates are deferred by the per-invocation cap", async () => {
    const { runDailyCronScan } = await import("@/lib/scan/cron");
    const service = fakeServiceClient({
      projects: [{ id: "p1" }, { id: "p2" }, { id: "p3" }],
      scanRuns: []
    });

    const result = await runDailyCronScan({ service, maxProjects: 1 });

    expect(result.scanned).toBe(1);
    expect(result.deferred).toBe(2);
    expect(result.continuationScheduled).toBe(true);

    await flushAfterCallbacks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://test.local/api/cron/sweep-continue");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-cron-secret");
    expect(JSON.parse(init.body as string)).toEqual({ chainIndex: 1 });
  });

  it("does not chain when every candidate was processed this invocation", async () => {
    const { runDailyCronScan } = await import("@/lib/scan/cron");
    const service = fakeServiceClient({
      projects: [{ id: "p1" }, { id: "p2" }],
      scanRuns: []
    });

    const result = await runDailyCronScan({ service, maxProjects: 10 });

    expect(result.deferred).toBe(0);
    expect(result.continuationScheduled).toBe(false);
    await flushAfterCallbacks();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not chain when the invocation made no progress (progress guard against non-converging loops)", async () => {
    const { runDailyCronScan } = await import("@/lib/scan/cron");
    // Every attempt fails slowly enough to blow the 45s soft budget, so
    // candidates remain deferred but nothing was actually scanned — chaining
    // again would retry the exact same failing set forever.
    executePendingScan.mockImplementation(async () => {
      nowMs += 50_000;
      throw new Error("boom");
    });

    const service = fakeServiceClient({
      projects: [{ id: "p1" }, { id: "p2" }, { id: "p3" }, { id: "p4" }],
      scanRuns: []
    });

    const result = await runDailyCronScan({ service, maxProjects: 10 });

    expect(result.scanned).toBe(0);
    expect(result.deferred).toBeGreaterThan(0);
    expect(result.continuationScheduled).toBe(false);
    await flushAfterCallbacks();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops chaining at the hard invocation cap even with deferred candidates and progress", async () => {
    const { runDailyCronScan } = await import("@/lib/scan/cron");
    const service = fakeServiceClient({
      projects: [{ id: "p1" }, { id: "p2" }, { id: "p3" }],
      scanRuns: []
    });

    const result = await runDailyCronScan({ service, maxProjects: 1, chainIndex: 19 });

    expect(result.scanned).toBe(1);
    expect(result.deferred).toBe(2);
    expect(result.continuationScheduled).toBe(false);
    await flushAfterCallbacks();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("respects scheduleContinuation=false (single-invocation mode)", async () => {
    const { runDailyCronScan } = await import("@/lib/scan/cron");
    const service = fakeServiceClient({
      projects: [{ id: "p1" }, { id: "p2" }],
      scanRuns: []
    });

    const result = await runDailyCronScan({ service, maxProjects: 1, scheduleContinuation: false });

    expect(result.deferred).toBe(1);
    expect(result.continuationScheduled).toBe(false);
    await flushAfterCallbacks();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips the dispatch (logged only) when CRON_SECRET is missing at fire time", async () => {
    const { runDailyCronScan } = await import("@/lib/scan/cron");
    vi.stubEnv("CRON_SECRET", "");
    const service = fakeServiceClient({
      projects: [{ id: "p1" }, { id: "p2" }],
      scanRuns: []
    });

    const result = await runDailyCronScan({ service, maxProjects: 1 });

    expect(result.continuationScheduled).toBe(true);
    await flushAfterCallbacks();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
