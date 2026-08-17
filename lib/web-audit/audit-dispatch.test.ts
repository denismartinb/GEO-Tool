import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isAutoWebAuditEnabled, triggerWebAuditRun } from "@/lib/web-audit/audit-dispatch";

/**
 * WEB-AUDIT-DRIVE-1. The worker dispatch is what gets an audit onto the screen
 * minutes after a scan instead of at the next daily cron, so "did it land" is
 * the first question when an audit sits still. `fetch` answered it wrong: it
 * resolves on 401/404/500 and rejects only on transport failure, so a preview
 * deploy whose worker was never reachable logged nothing at all.
 */
describe("triggerWebAuditRun", () => {
  const ORIGINAL_SECRET = process.env.CRON_SECRET;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.CRON_SECRET = "test-cron-secret";
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = ORIGINAL_SECRET;
    errorSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("dispatches the worker with the shared secret and the chain index", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await triggerWebAuditRun({ chainIndex: 3 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/cron/run-audit");
    expect(init.headers.Authorization).toBe("Bearer test-cron-secret");
    expect(JSON.parse(init.body as string)).toEqual({ chainIndex: 3 });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("logs a rejected dispatch instead of treating it as delivered", async () => {
    // Exactly what a protected preview deployment returns.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 })));

    await triggerWebAuditRun();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0][0])).toContain("rejected");
    expect(errorSpy.mock.calls[0][1]).toMatchObject({ status: 401 });
  });

  it("never throws when the worker cannot be reached at all", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    await expect(triggerWebAuditRun()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("says so when the secret is missing rather than dispatching blind", async () => {
    delete process.env.CRON_SECRET;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await triggerWebAuditRun();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});

describe("isAutoWebAuditEnabled", () => {
  const ORIGINAL = process.env.AUTO_WEB_AUDIT_ENABLED;

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.AUTO_WEB_AUDIT_ENABLED;
    else process.env.AUTO_WEB_AUDIT_ENABLED = ORIGINAL;
  });

  it("defaults to on, and only the exact string 'false' disables it", () => {
    delete process.env.AUTO_WEB_AUDIT_ENABLED;
    expect(isAutoWebAuditEnabled()).toBe(true);

    process.env.AUTO_WEB_AUDIT_ENABLED = "false";
    expect(isAutoWebAuditEnabled()).toBe(false);

    process.env.AUTO_WEB_AUDIT_ENABLED = "0";
    expect(isAutoWebAuditEnabled()).toBe(true);
  });
});
