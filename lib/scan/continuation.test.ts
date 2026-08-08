import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { triggerScanContinuation } from "@/lib/scan/continuation";

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const RUN_ID = "22222222-2222-2222-2222-222222222222";

/**
 * SCAN-DRIVE-1 (docs/adr/0037). The background chain is the driver that
 * survives a locked phone, so "did the dispatch actually land" is the only
 * question worth asking when a campaign stops advancing — and `fetch` answers
 * it misleadingly: it resolves on 401/404/500 and only rejects on a transport
 * failure. An unreachable safety net must not read like a working one.
 */
describe("triggerScanContinuation", () => {
  const ORIGINAL_SECRET = process.env.SCAN_CONTINUE_SECRET;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.SCAN_CONTINUE_SECRET = "test-continue-secret";
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) delete process.env.SCAN_CONTINUE_SECRET;
    else process.env.SCAN_CONTINUE_SECRET = ORIGINAL_SECRET;
    errorSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("dispatches the next batch with the shared secret", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await triggerScanContinuation({ projectId: PROJECT_ID, runId: RUN_ID });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/scan/continue");
    expect(init.headers.Authorization).toBe("Bearer test-continue-secret");
    expect(JSON.parse(init.body as string)).toEqual({ projectId: PROJECT_ID, runId: RUN_ID });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("logs a rejected dispatch instead of treating it as delivered", async () => {
    // Exactly what Vercel's deployment protection returns on a preview.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 })));

    await triggerScanContinuation({ projectId: PROJECT_ID, runId: RUN_ID });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0][0])).toContain("rejected");
    expect(errorSpy.mock.calls[0][1]).toMatchObject({ status: 401, runId: RUN_ID });
  });

  it("never throws when the dispatch cannot be made at all", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    // A lost hand-off must not sink the invocation that scheduled it.
    await expect(triggerScanContinuation({ projectId: PROJECT_ID, runId: RUN_ID })).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("says so when the secret is missing rather than dispatching blind", async () => {
    delete process.env.SCAN_CONTINUE_SECRET;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await triggerScanContinuation({ projectId: PROJECT_ID, runId: RUN_ID });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
