import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * AUDIT-AFTER-SCAN-1 — the worker endpoint is the only authenticated surface
 * this phase adds, so its gates are worth pinning directly rather than
 * inferring them from the runner's tests: a regression here does not fail
 * loudly, it quietly lets an unauthenticated caller spend Gemini budget or
 * quietly stops the chain that makes the audit land at all.
 */

type SweepResult = { processed: number; outcomes: Array<{ result: string }>; hasMoreWork: boolean };
const processDueWebAuditJobs = vi.fn(
  (_args?: unknown): Promise<SweepResult> => Promise.resolve({ processed: 0, outcomes: [], hasMoreWork: false })
);
vi.mock("@/lib/web-audit/audit-job-runner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/web-audit/audit-job-runner")>();
  return {
    ...actual,
    processDueWebAuditJobs: (args: unknown) => processDueWebAuditJobs(args)
  };
});

const triggerWebAuditRun = vi.fn(async (_args?: { chainIndex?: number }) => undefined);
vi.mock("@/lib/web-audit/audit-dispatch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/web-audit/audit-dispatch")>();
  return {
    ...actual,
    triggerWebAuditRun: (args?: { chainIndex?: number }) => triggerWebAuditRun(args)
  };
});

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));

// `after()` callbacks are captured, not executed — the continuation dispatch
// is observed by flushing them explicitly.
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

async function flushAfterCallbacks() {
  const callbacks = afterCallbacks.splice(0);
  await Promise.all(callbacks.map((fn) => fn()));
}

const SECRET = "test-cron-secret";

function post(body: unknown, { auth = `Bearer ${SECRET}` }: { auth?: string | null } = {}) {
  return new Request("http://test.local/api/cron/run-audit", {
    method: "POST",
    headers: auth ? { "Content-Type": "application/json", Authorization: auth } : {},
    body: JSON.stringify(body)
  });
}

function get({ auth = `Bearer ${SECRET}` }: { auth?: string | null } = {}) {
  return new Request("http://test.local/api/cron/run-audit", {
    method: "GET",
    headers: auth ? { Authorization: auth } : {}
  });
}

async function route() {
  return import("./route");
}

beforeEach(() => {
  vi.resetModules();
  process.env.CRON_SECRET = SECRET;
  delete process.env.AUTO_WEB_AUDIT_ENABLED;
  processDueWebAuditJobs.mockResolvedValue({ processed: 0, outcomes: [], hasMoreWork: false });
});

afterEach(() => {
  afterCallbacks.length = 0;
  vi.clearAllMocks();
});

describe("authentication", () => {
  it("rejects a request with no Authorization header", async () => {
    const { POST } = await route();
    const res = await POST(post({}, { auth: null }));

    expect(res.status).toBe(401);
    expect(processDueWebAuditJobs).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret", async () => {
    const { POST } = await route();
    const res = await POST(post({}, { auth: "Bearer nope" }));

    expect(res.status).toBe(401);
    expect(processDueWebAuditJobs).not.toHaveBeenCalled();
  });

  it("fails closed when CRON_SECRET is unset — an unconfigured deploy must not run open", async () => {
    delete process.env.CRON_SECRET;
    const { POST } = await route();
    const res = await POST(post({}, { auth: "Bearer " }));

    expect(res.status).toBe(401);
    expect(processDueWebAuditJobs).not.toHaveBeenCalled();
  });

  it("gates GET on the same secret as POST", async () => {
    const { GET } = await route();

    expect((await GET(get({ auth: null }))).status).toBe(401);
    expect(processDueWebAuditJobs).not.toHaveBeenCalled();

    expect((await GET(get())).status).toBe(200);
    expect(processDueWebAuditJobs).toHaveBeenCalledOnce();
  });
});

describe("kill switch", () => {
  it("runs by default — the phase exists so this happens without configuration", async () => {
    const { POST } = await route();
    const res = await POST(post({}));

    expect(await res.json()).toMatchObject({ processed: 0 });
    expect(processDueWebAuditJobs).toHaveBeenCalledOnce();
  });

  it('does nothing when AUTO_WEB_AUDIT_ENABLED is exactly "false"', async () => {
    process.env.AUTO_WEB_AUDIT_ENABLED = "false";
    const { POST } = await route();
    const res = await POST(post({}));

    expect(await res.json()).toEqual({ skipped: "auto_web_audit_disabled" });
    expect(processDueWebAuditJobs).not.toHaveBeenCalled();
  });

  it("is not tripped by a truthy-looking value other than \"false\"", async () => {
    process.env.AUTO_WEB_AUDIT_ENABLED = "true";
    const { POST } = await route();
    await POST(post({}));

    expect(processDueWebAuditJobs).toHaveBeenCalledOnce();
  });

  it("checks the switch AFTER auth, so a disabled deploy still returns 401 to a stranger", async () => {
    process.env.AUTO_WEB_AUDIT_ENABLED = "false";
    const { POST } = await route();

    expect((await POST(post({}, { auth: null }))).status).toBe(401);
  });
});

describe("self-chaining", () => {
  it("dispatches the next invocation when work remains, incrementing chainIndex", async () => {
    processDueWebAuditJobs.mockResolvedValue({ processed: 1, outcomes: [{ result: "continue" }], hasMoreWork: true });
    const { POST } = await route();
    const res = await POST(post({ chainIndex: 4 }));

    expect(await res.json()).toMatchObject({ continuationScheduled: true });
    await flushAfterCallbacks();
    expect(triggerWebAuditRun).toHaveBeenCalledWith({ chainIndex: 5 });
  });

  it("does not dispatch when there is nothing left to do", async () => {
    const { POST } = await route();
    const res = await POST(post({}));

    expect(await res.json()).toMatchObject({ continuationScheduled: false });
    await flushAfterCallbacks();
    expect(triggerWebAuditRun).not.toHaveBeenCalled();
  });

  it("stops the chain at the cap instead of self-dispatching forever", async () => {
    const { MAX_AUDIT_WORKER_CHAIN } = await import("@/lib/web-audit/audit-job-runner");
    processDueWebAuditJobs.mockResolvedValue({ processed: 1, outcomes: [{ result: "continue" }], hasMoreWork: true });
    const { POST } = await route();

    const res = await POST(post({ chainIndex: MAX_AUDIT_WORKER_CHAIN - 1 }));

    expect(await res.json()).toMatchObject({ continuationScheduled: false });
    await flushAfterCallbacks();
    expect(triggerWebAuditRun).not.toHaveBeenCalled();
  });

  it("starts GET (Vercel's cron) at chainIndex 0, so a cron tick always gets a full chain", async () => {
    processDueWebAuditJobs.mockResolvedValue({ processed: 1, outcomes: [{ result: "continue" }], hasMoreWork: true });
    const { GET } = await route();
    await GET(get());

    await flushAfterCallbacks();
    expect(triggerWebAuditRun).toHaveBeenCalledWith({ chainIndex: 1 });
  });
});

describe("request validation", () => {
  it("treats a missing/empty body as chainIndex 0 rather than a 400", async () => {
    // The executor's `after()` dispatch and Vercel's cron both post no
    // meaningful body; rejecting them would break the fast path entirely.
    processDueWebAuditJobs.mockResolvedValue({ processed: 1, outcomes: [{ result: "continue" }], hasMoreWork: true });
    const { POST } = await route();

    const res = await POST(
      new Request("http://test.local/api/cron/run-audit", {
        method: "POST",
        headers: { Authorization: `Bearer ${SECRET}` }
      })
    );

    expect(res.status).toBe(200);
    await flushAfterCallbacks();
    expect(triggerWebAuditRun).toHaveBeenCalledWith({ chainIndex: 1 });
  });

  it("rejects a chainIndex above the cap instead of trusting it", async () => {
    const { MAX_AUDIT_WORKER_CHAIN } = await import("@/lib/web-audit/audit-job-runner");
    const { POST } = await route();
    const res = await POST(post({ chainIndex: MAX_AUDIT_WORKER_CHAIN + 1 }));

    expect(res.status).toBe(400);
    expect(processDueWebAuditJobs).not.toHaveBeenCalled();
  });

  it("rejects a negative chainIndex", async () => {
    const { POST } = await route();

    expect((await POST(post({ chainIndex: -1 }))).status).toBe(400);
  });
});

describe("failure handling", () => {
  it("never leaks a raw provider or Postgres error to the caller", async () => {
    processDueWebAuditJobs.mockRejectedValue(new Error('relation "jobs" does not exist'));
    const { POST } = await route();
    const res = await POST(post({}));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ processed: 0, error: "run_failed" });
    expect(JSON.stringify(body)).not.toContain("jobs");
  });
});
