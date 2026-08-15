import { beforeEach, describe, expect, it, vi } from "vitest";

const createPendingScanRun = vi.fn();
vi.mock("@/lib/scan/run-creation", () => ({
  createPendingScanRun: (...args: unknown[]) => createPendingScanRun(...args)
}));

const executePendingScan = vi.fn();
vi.mock("@/lib/scan/executor", () => ({
  executePendingScan: (...args: unknown[]) => executePendingScan(...args)
}));

// launch.ts only reads ENABLE_SYNC_SCAN_EXECUTION from constants; pin it on
// so the sync-execution branch is what deferExecution has to opt out of.
vi.mock("@/lib/scan/constants", () => ({
  ENABLE_SYNC_SCAN_EXECUTION: true
}));

import { launchScan } from "@/lib/scan/launch";
import type { AuthenticatedContext } from "@/lib/auth";

const supabase = {} as AuthenticatedContext["supabase"];
const user = { id: "user-1" } as AuthenticatedContext["user"];

describe("launchScan", () => {
  beforeEach(() => {
    createPendingScanRun.mockReset().mockResolvedValue("run-1");
    executePendingScan.mockReset().mockResolvedValue(undefined);
  });

  it("executes the run in-request by default (pre-ASYNC-SCAN-1c behavior preserved)", async () => {
    const result = await launchScan({ projectId: "project-1", supabase, user });

    expect(result).toEqual({ runId: "run-1", executed: true });
    expect(executePendingScan).toHaveBeenCalledWith({ projectId: "project-1", runId: "run-1", supabase });
  });

  it("with deferExecution only creates the pending run and returns immediately", async () => {
    const result = await launchScan({ projectId: "project-1", supabase, user, deferExecution: true });

    expect(result).toEqual({ runId: "run-1", executed: false });
    expect(createPendingScanRun).toHaveBeenCalledTimes(1);
    expect(executePendingScan).not.toHaveBeenCalled();
  });

  it("propagates run-creation failures (e.g. active_run_exists) without executing anything", async () => {
    const { ProjectActionError } = await import("@/lib/scan/types");
    createPendingScanRun.mockRejectedValue(new ProjectActionError("active_run_exists"));

    await expect(launchScan({ projectId: "project-1", supabase, user, deferExecution: true })).rejects.toMatchObject({
      code: "active_run_exists"
    });
    expect(executePendingScan).not.toHaveBeenCalled();
  });
});
