import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser }
  })
}));

const launchScan = vi.fn();
const executePendingScan = vi.fn();
vi.mock("@/lib/scan/scan-runner", async () => {
  const { ProjectActionError } = await import("@/lib/scan/types");
  return {
    launchScan: (...args: unknown[]) => launchScan(...args),
    executePendingScan: (...args: unknown[]) => executePendingScan(...args),
    getActionErrorCode: (error: unknown) => (error instanceof ProjectActionError ? error.code : "scan_failed"),
    getSanitizedScanError: () => "sanitized"
  };
});

// Capture after() callbacks so the test can flush the deferred execution
// kick explicitly (same pattern as lib/scan/cron.test.ts).
const afterCallbacks: Array<() => unknown> = [];
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (fn: () => unknown) => {
      afterCallbacks.push(fn);
    }
  };
});

import { POST } from "./route";
import { ProjectActionError } from "@/lib/scan/types";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

function postFor(projectId: string) {
  return POST(new Request("https://app.example.com/api/projects/x/scan", { method: "POST" }), {
    params: Promise.resolve({ projectId })
  });
}

async function flushAfterCallbacks() {
  const callbacks = afterCallbacks.splice(0);
  await Promise.all(callbacks.map((fn) => fn()));
}

describe("POST /api/projects/[projectId]/scan (ASYNC-SCAN-1c)", () => {
  beforeEach(() => {
    getUser.mockReset().mockResolvedValue({ data: { user: { id: "user-1" } } });
    launchScan.mockReset().mockResolvedValue({ runId: "run-1", executed: false });
    executePendingScan.mockReset().mockResolvedValue(undefined);
    afterCallbacks.length = 0;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("responds as soon as the pending run exists, with execution deferred to after()", async () => {
    const response = await postFor(PROJECT_ID);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ runId: "run-1", executed: false });
    expect(launchScan).toHaveBeenCalledWith(expect.objectContaining({ projectId: PROJECT_ID, deferExecution: true }));

    expect(executePendingScan).not.toHaveBeenCalled();
    await flushAfterCallbacks();
    expect(executePendingScan).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: PROJECT_ID, runId: "run-1" })
    );
  });

  it("returns 422 with the real error code when a run is already active, and kicks nothing", async () => {
    launchScan.mockRejectedValue(new ProjectActionError("active_run_exists"));

    const response = await postFor(PROJECT_ID);

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toBe("active_run_exists");

    await flushAfterCallbacks();
    expect(executePendingScan).not.toHaveBeenCalled();
  });

  it("swallows a deferred-execution failure (logged only), never an unhandled rejection", async () => {
    executePendingScan.mockRejectedValue(new Error("boom"));

    const response = await postFor(PROJECT_ID);
    expect(response.status).toBe(200);

    await expect(flushAfterCallbacks()).resolves.toBeUndefined();
  });

  it("rejects an invalid project id with 400", async () => {
    const response = await postFor("not-a-uuid");
    expect(response.status).toBe(400);
    expect(launchScan).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request with 401", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await postFor(PROJECT_ID);
    expect(response.status).toBe(401);
    expect(launchScan).not.toHaveBeenCalled();
  });
});
