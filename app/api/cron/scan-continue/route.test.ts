import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runScanDrain = vi.fn(async (_args?: unknown) => ({ candidates: 0, dispatched: 0 }));
vi.mock("@/lib/scan/drain", () => ({ runScanDrain: (args: unknown) => runScanDrain(args) }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));

import { GET } from "@/app/api/cron/scan-continue/route";

/**
 * SCAN-CRON-DRAIN-1 (log §261): the only new authenticated surface. A missing
 * gate here would let anyone re-dispatch scans; a broken one would quietly
 * stop the pass that carries runs past Vercel's 508.
 */

const request = (auth?: string) =>
  new Request("https://www.genscore.es/api/cron/scan-continue", auth ? { headers: { Authorization: auth } } : undefined);

describe("GET /api/cron/scan-continue", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    runScanDrain.mockClear();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("rejects a request without the cron secret and runs nothing", async () => {
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(runScanDrain).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret", async () => {
    const response = await GET(request("Bearer nope"));
    expect(response.status).toBe(401);
    expect(runScanDrain).not.toHaveBeenCalled();
  });

  it("runs the drain pass with the cron secret", async () => {
    runScanDrain.mockResolvedValueOnce({ candidates: 2, dispatched: 1 });
    const response = await GET(request("Bearer cron-secret"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ candidates: 2, dispatched: 1 });
  });

  it("answers 500 when the pass fails, so Vercel's cron log shows it", async () => {
    runScanDrain.mockRejectedValueOnce(new Error("scan_drain_runs_read_failed"));
    const response = await GET(request("Bearer cron-secret"));
    expect(response.status).toBe(500);
  });
});
