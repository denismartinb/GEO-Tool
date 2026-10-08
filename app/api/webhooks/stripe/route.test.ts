import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";

// Signed-event tests, fully local: the signature is generated with the
// webhook secret below via Stripe's own helper and verified by the route's real
// `constructEvent`. No network, no real keys — the secrets are throwaway test
// strings that exist only in this file.
const WEBHOOK_SECRET = "whsec_test_local_only";
const stripeSigner = new Stripe("sk_test_local_only");

const processStripeWebhookEvent = vi.fn();
vi.mock("@/lib/billing/webhook-registry", () => ({
  processStripeWebhookEvent: (...args: unknown[]) => processStripeWebhookEvent(...args)
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_local_only";
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  processStripeWebhookEvent.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
  vi.restoreAllMocks();
});

const payload = JSON.stringify({
  id: "evt_signed_1",
  object: "event",
  type: "customer.subscription.deleted",
  created: 1_700_000_000,
  data: { object: { id: "sub_1", metadata: { user_id: "user-1" } } }
});

function signedRequest(body = payload, secret = WEBHOOK_SECRET) {
  const signature = stripeSigner.webhooks.generateTestHeaderString({ payload: body, secret });
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": signature },
    body
  });
}

describe("POST /api/webhooks/stripe", () => {
  it("rejects a request without a signature header", async () => {
    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/api/webhooks/stripe", { method: "POST", body: payload }));
    expect(res.status).toBe(400);
    expect(processStripeWebhookEvent).not.toHaveBeenCalled();
  });

  it("rejects a payload signed with the wrong secret and processes nothing", async () => {
    const { POST } = await import("./route");
    const res = await POST(signedRequest(payload, "whsec_someone_else"));
    expect(res.status).toBe(400);
    expect(processStripeWebhookEvent).not.toHaveBeenCalled();
  });

  it("rejects a validly signed payload that was tampered with afterwards", async () => {
    const { POST } = await import("./route");
    const signature = stripeSigner.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    const res = await POST(
      new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        headers: { "stripe-signature": signature },
        body: payload.replace("user-1", "attacker")
      })
    );
    expect(res.status).toBe(400);
    expect(processStripeWebhookEvent).not.toHaveBeenCalled();
  });

  it("answers 503 when Stripe isn't configured (never processes unverified events)", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const { POST } = await import("./route");
    expect((await POST(signedRequest())).status).toBe(503);
    expect(processStripeWebhookEvent).not.toHaveBeenCalled();
  });

  it("processes a correctly signed event and answers 200", async () => {
    processStripeWebhookEvent.mockResolvedValue({ status: "processed", outcome: "applied" });
    const { POST } = await import("./route");
    const res = await POST(signedRequest());
    expect(res.status).toBe(200);
    expect(processStripeWebhookEvent).toHaveBeenCalledTimes(1);
    expect(processStripeWebhookEvent.mock.calls[0][0]).toMatchObject({ id: "evt_signed_1" });
  });

  it("answers 200 (flagged duplicate) for a retried, already-processed event", async () => {
    processStripeWebhookEvent.mockResolvedValue({ status: "duplicate" });
    const { POST } = await import("./route");
    const res = await POST(signedRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, duplicate: true });
  });

  it("answers 409 while another invocation holds the event, so Stripe retries", async () => {
    processStripeWebhookEvent.mockResolvedValue({ status: "in_progress" });
    const { POST } = await import("./route");
    expect((await POST(signedRequest())).status).toBe(409);
  });

  it("answers 500 when processing throws, so Stripe retries", async () => {
    processStripeWebhookEvent.mockRejectedValue(new Error("db down"));
    const { POST } = await import("./route");
    expect((await POST(signedRequest())).status).toBe(500);
  });
});
