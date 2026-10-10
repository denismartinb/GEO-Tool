import { beforeEach, describe, expect, it, vi } from "vitest";

const scheduleScanContinuation = vi.fn(async (_args: { projectId: string; runId: string }) => undefined);
vi.mock("@/lib/scan/continuation", () => ({
  scheduleScanContinuation: (args: { projectId: string; runId: string }) => scheduleScanContinuation(args)
}));

import { SCAN_RESUME_MAX_RUN_AGE_HOURS } from "@/lib/scan/constants";
import {
  SCAN_DRAIN_IDLE_MS,
  SCAN_DRAIN_MAX_RUNS_PER_PASS,
  isClaimableJob,
  runScanDrain,
  selectRunsToContinue,
  type DrainJob,
  type DrainRun
} from "@/lib/scan/drain";

/**
 * SCAN-CRON-DRAIN-1 (log §262). The 2026-10-10 06:00 sweep's chain died at
 * 06:04 with a 508 and nothing moved until the watchdog at 06:15. These pin
 * which runs the 5-minute pass re-dispatches and, as importantly, which it
 * leaves alone.
 */

const NOW = Date.parse("2026-10-10T06:05:00.000Z");
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

function run(id: string, overrides: Partial<DrainRun> = {}): DrainRun {
  return { id, project_id: `p-${id}`, created_at: iso(5 * 60_000), updated_at: iso(60_000 + SCAN_DRAIN_IDLE_MS), ...overrides };
}

const pendingPrompt = (runId: string): DrainJob => ({ run_id: runId, job_type: "scan_prompt", status: "pending", locked_at: null });

describe("isClaimableJob", () => {
  it("claims a pending prompt or finalize job", () => {
    expect(isClaimableJob(pendingPrompt("r"), NOW)).toBe(true);
    expect(isClaimableJob({ run_id: "r", job_type: "scan_finalize", status: "pending", locked_at: null }, NOW)).toBe(true);
  });

  it("claims a running job only once its lease has expired", () => {
    const leased = (msAgo: number): DrainJob => ({ run_id: "r", job_type: "scan_prompt", status: "running", locked_at: iso(msAgo) });
    expect(isClaimableJob(leased(10_000), NOW)).toBe(false);
    expect(isClaimableJob(leased(SCAN_DRAIN_IDLE_MS + 1_000), NOW)).toBe(true);
  });

  it("ignores job types the scan executor does not run", () => {
    expect(isClaimableJob({ run_id: "r", job_type: "web_audit", status: "pending", locked_at: null }, NOW)).toBe(false);
  });
});

describe("selectRunsToContinue", () => {
  it("re-dispatches the 06:04 shape: a young run, idle, with prompt jobs left", () => {
    expect(selectRunsToContinue({ runs: [run("a")], jobs: [pendingPrompt("a")], now: NOW }).map((r) => r.id)).toEqual(["a"]);
  });

  it("leaves a run that is advancing right now to its own chain", () => {
    const live = run("a", { updated_at: iso(20_000) });
    expect(selectRunsToContinue({ runs: [live], jobs: [pendingPrompt("a")], now: NOW })).toEqual([]);
  });

  it("leaves a run with nothing claimable — e.g. a batch still inside its lease", () => {
    const inFlight: DrainJob = { run_id: "a", job_type: "scan_prompt", status: "running", locked_at: iso(10_000) };
    expect(selectRunsToContinue({ runs: [run("a")], jobs: [inFlight], now: NOW })).toEqual([]);
  });

  it("leaves a run past the resume age limit to the watchdog's fail path", () => {
    const old = run("a", { created_at: iso(SCAN_RESUME_MAX_RUN_AGE_HOURS * 60 * 60 * 1000 + 60_000) });
    expect(selectRunsToContinue({ runs: [old], jobs: [pendingPrompt("a")], now: NOW })).toEqual([]);
  });

  it("takes the longest-idle runs first and leaves the rest for the next firing", () => {
    const runs = Array.from({ length: SCAN_DRAIN_MAX_RUNS_PER_PASS + 2 }, (_, i) =>
      run(`r${i}`, { updated_at: iso(SCAN_DRAIN_IDLE_MS + i * 1_000) })
    );
    const selected = selectRunsToContinue({ runs, jobs: runs.map((r) => pendingPrompt(r.id)), now: NOW });
    expect(selected).toHaveLength(SCAN_DRAIN_MAX_RUNS_PER_PASS);
    expect(selected[0].id).toBe(`r${SCAN_DRAIN_MAX_RUNS_PER_PASS + 1}`);
  });
});

describe("runScanDrain", () => {
  beforeEach(() => scheduleScanContinuation.mockClear());

  function fakeService(runs: DrainRun[], jobs: DrainJob[], writes: string[]) {
    const query = (rows: unknown[]) => {
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "in", "gte", "lt", "eq"]) builder[method] = () => builder;
      builder.then = (resolve: (value: unknown) => unknown) => resolve({ data: rows, error: null });
      for (const method of ["update", "insert", "upsert", "delete"]) {
        builder[method] = () => {
          writes.push(method);
          return builder;
        };
      }
      return builder;
    };
    return { from: (table: string) => query(table === "scan_runs" ? runs : jobs) } as never;
  }

  it("dispatches the selected runs and writes nothing itself", async () => {
    const writes: string[] = [];
    const summary = await runScanDrain({ service: fakeService([run("a")], [pendingPrompt("a")], writes), now: NOW });

    expect(summary).toEqual({ candidates: 1, dispatched: 1 });
    expect(scheduleScanContinuation).toHaveBeenCalledWith({ projectId: "p-a", runId: "a" });
    expect(writes).toEqual([]);
  });

  it("does nothing when no run is in flight", async () => {
    const summary = await runScanDrain({ service: fakeService([], [], []), now: NOW });
    expect(summary).toEqual({ candidates: 0, dispatched: 0 });
    expect(scheduleScanContinuation).not.toHaveBeenCalled();
  });
});
