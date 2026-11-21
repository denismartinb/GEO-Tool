import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const sendFirstScanOpsAlertEmail = vi.fn(async (..._args: unknown[]) => "sent");
let configured = true;
vi.mock("@/lib/email/transactional", () => ({
  isOpsAlertConfigured: () => configured,
  sendFirstScanOpsAlertEmail: (...args: unknown[]) => sendFirstScanOpsAlertEmail(...args)
}));

import { sendFirstScanOpsAlert } from "./first-scan-alert";

function fakeService(runIds: string[], email: string | null = "cliente@ejemplo.com") {
  const from = vi.fn(() => ({
    select: () => ({
      eq: () => ({
        limit: async () => ({ data: runIds.map((id) => ({ id })), error: null })
      })
    })
  }));
  return {
    from,
    auth: { admin: { getUserById: vi.fn(async () => ({ data: { user: email ? { email } : null } })) } }
  } as unknown as Parameters<typeof sendFirstScanOpsAlert>[0]["service"] & { from: typeof from };
}

const base = {
  projectId: "p1",
  runId: "r1",
  domain: "ejemplo.com",
  ownerUserId: "u1",
  planId: "pro",
  triggerSource: "user" as const,
  prompts: 17,
  samples: 1,
  engines: ["gemini", "claude", "openai"]
};

describe("sendFirstScanOpsAlert (OPS-FIRST-SCAN-1, log §441)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configured = true;
  });

  it("alerts on the project's only run, with the owner's email and a per-project idempotency key", async () => {
    await sendFirstScanOpsAlert({ ...base, service: fakeService(["r1"]) });
    expect(sendFirstScanOpsAlertEmail).toHaveBeenCalledTimes(1);
    const [payload, options] = sendFirstScanOpsAlertEmail.mock.calls[0] as [Record<string, unknown>, unknown];
    expect(payload).toMatchObject({ domain: "ejemplo.com", ownerEmail: "cliente@ejemplo.com", prompts: 17 });
    expect(options).toEqual({ idempotencyKey: "ops-first-scan/p1" });
  });

  it("stays quiet when the project already had a run (a retry or a later scan)", async () => {
    await sendFirstScanOpsAlert({ ...base, service: fakeService(["r0", "r1"]) });
    expect(sendFirstScanOpsAlertEmail).not.toHaveBeenCalled();
  });

  it("does not query anything without an alert channel", async () => {
    configured = false;
    const service = fakeService(["r1"]);
    await sendFirstScanOpsAlert({ ...base, service });
    expect(service.from).not.toHaveBeenCalled();
    expect(sendFirstScanOpsAlertEmail).not.toHaveBeenCalled();
  });

  it("never throws, even if the send does", async () => {
    sendFirstScanOpsAlertEmail.mockRejectedValueOnce(new Error("boom"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(sendFirstScanOpsAlert({ ...base, service: fakeService(["r1"]) })).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
