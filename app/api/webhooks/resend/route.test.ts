import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Signed deliveries, fully local: the Svix signature is computed here with a
// throwaway secret and checked by the route's real verifier. No network.
const RAW_SECRET = Buffer.from("resend-webhook-test-secret-local").toString("base64");
const WEBHOOK_SECRET = `whsec_${RAW_SECRET}`;

const upsert = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ from: () => ({ upsert: (...args: unknown[]) => upsert(...args) }) })
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.RESEND_WEBHOOK_SECRET = WEBHOOK_SECRET;
  upsert.mockReset();
  upsert.mockResolvedValue({ error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
  vi.restoreAllMocks();
});

function signed(body: string, opts: { id?: string; secret?: string; timestamp?: number } = {}): Request {
  const id = opts.id ?? "msg_1";
  const timestamp = String(opts.timestamp ?? Math.floor(Date.now() / 1000));
  const key = Buffer.from((opts.secret ?? WEBHOOK_SECRET).replace(/^whsec_/, ""), "base64");
  const signature = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  return new Request("https://www.genscore.es/api/webhooks/resend", {
    method: "POST",
    headers: { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${signature}` },
    body
  });
}

const opened = JSON.stringify({
  type: "email.opened",
  created_at: "2026-11-02T08:00:00.000Z",
  data: {
    email_id: "em_1",
    created_at: "2026-11-02T07:45:00.000Z",
    from: "GenScore <noreply@genscore.es>",
    to: ["cliente@ejemplo.com"],
    subject: "Tu resumen semanal de ejemplo.com",
    tags: { kind: "weekly_digest" }
  }
});

async function post(request: Request) {
  const { POST } = await import("./route");
  return POST(request);
}

describe("POST /api/webhooks/resend (MAIL-METRICS-1, log §419)", () => {
  it("is off until the secret exists", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    expect((await post(signed(opened))).status).toBe(503);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("rejects a missing or wrong signature before reading anything", async () => {
    const unsigned = new Request("https://www.genscore.es/api/webhooks/resend", { method: "POST", body: opened });
    expect((await post(unsigned)).status).toBe(400);
    const forged = signed(opened, { secret: `whsec_${Buffer.from("another-secret-entirely").toString("base64")}` });
    expect((await post(forged)).status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("rejects a stale delivery (replay)", async () => {
    const old = signed(opened, { timestamp: Math.floor(Date.now() / 1000) - 3600 });
    expect((await post(old)).status).toBe(400);
  });

  it("stores only the email id, the event, the type and the time, once per delivery", async () => {
    const response = await post(signed(opened, { id: "msg_42" }));
    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      {
        webhook_id: "msg_42",
        resend_email_id: "em_1",
        event: "opened",
        kind: "weekly_digest",
        occurred_at: "2026-11-02T08:00:00.000Z"
      },
      { onConflict: "webhook_id", ignoreDuplicates: true }
    );
    const stored = JSON.stringify(upsert.mock.calls[0][0]);
    expect(stored).not.toContain("cliente@ejemplo.com");
    expect(stored).not.toContain("resumen semanal");
  });

  it("acknowledges events it does not keep", async () => {
    const contact = JSON.stringify({ type: "contact.created", created_at: "2026-11-02T08:00:00Z", data: { id: "c1" } });
    expect((await post(signed(contact))).status).toBe(200);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("asks Resend to retry when the table is missing or the write fails", async () => {
    upsert.mockResolvedValueOnce({ error: { code: "PGRST205" } });
    const missing = await post(signed(opened));
    expect(missing.status).toBe(503);
    expect(await missing.json()).toEqual({ error: "email_events_unavailable" });
    upsert.mockResolvedValueOnce({ error: { code: "XX000" } });
    expect((await post(signed(opened))).status).toBe(503);
  });
});
