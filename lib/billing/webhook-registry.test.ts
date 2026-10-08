import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type { createServiceClient } from "@/lib/supabase/service";

const sendPlanConfirmedEmail = vi.fn();
const sendPaymentFailedEmail = vi.fn();
const sendCancellationScheduledEmail = vi.fn();
vi.mock("@/lib/email/transactional", () => ({
  sendPlanConfirmedEmail: (...args: unknown[]) => sendPlanConfirmedEmail(...args),
  sendPaymentFailedEmail: (...args: unknown[]) => sendPaymentFailedEmail(...args),
  sendCancellationScheduledEmail: (...args: unknown[]) => sendCancellationScheduledEmail(...args)
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.STRIPE_PRICE_ID_PRO = "price_pro_test";
  sendPlanConfirmedEmail.mockReset();
  sendPaymentFailedEmail.mockReset();
  sendCancellationScheduledEmail.mockReset();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
  vi.restoreAllMocks();
});

type Row = Record<string, unknown>;

/**
 * In-memory stand-in for the two tables the processor touches. Implements just
 * the query shapes webhook-registry.ts / stripe-webhook.ts issue, including the
 * unique violation on a repeated event id and the "UPDATE only matches if the
 * row is unchanged" compare-and-set the reclaim relies on.
 */
function fakeDb(opts: { registryMissing?: boolean; profile?: Row; failProfileWrite?: boolean } = {}) {
  const events = new Map<string, Row>();
  const profile: Row = { id: "user-1", current_plan: "free", email: "a@b.c", stripe_subscription_id: null, ...opts.profile };
  const profileWrites: Row[] = [];

  function matcher(filters: Array<[string, unknown]>, row: Row) {
    return filters.every(([c, v]) => (row[c] ?? null) === v);
  }

  const client = {
    from(table: string) {
      if (table === "stripe_webhook_events") {
        if (opts.registryMissing) {
          const missing = { code: "PGRST205", message: "no table" };
          const chain: Record<string, unknown> = {};
          const reply = () => Promise.resolve({ data: null, error: missing });
          return {
            insert: reply,
            select: () => ({ eq: () => ({ maybeSingle: reply, eq: () => ({ eq: reply }) }) }),
            update: () => ({ eq: reply }),
            ...chain
          };
        }
        return {
          insert(row: Row) {
            if (events.has(row.event_id as string)) {
              return Promise.resolve({ error: { code: "23505", message: "duplicate key" } });
            }
            events.set(row.event_id as string, { attempts: 1, claimed_at: new Date().toISOString(), ...row });
            return Promise.resolve({ error: null });
          },
          select() {
            const filters: Array<[string, unknown]> = [];
            const b = {
              eq(c: string, v: unknown) {
                filters.push([c, v]);
                return b;
              },
              maybeSingle() {
                const row = [...events.values()].find((r) => matcher(filters, r));
                return Promise.resolve({ data: row ?? null, error: null });
              },
              then(resolve: (v: unknown) => unknown) {
                return Promise.resolve({ data: [...events.values()].filter((r) => matcher(filters, r)), error: null }).then(resolve);
              }
            };
            return b;
          },
          update(patch: Row) {
            const filters: Array<[string, unknown]> = [];
            const b = {
              eq(c: string, v: unknown) {
                filters.push([c, v]);
                return b;
              },
              select() {
                return b;
              },
              then(resolve: (v: unknown) => unknown) {
                const hit = [...events.values()].filter((r) => matcher(filters, r));
                hit.forEach((r) => Object.assign(r, patch));
                return Promise.resolve({ data: hit.map((r) => ({ event_id: r.event_id })), error: null }).then(resolve);
              }
            };
            return b;
          }
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { ...profile }, error: null }) }) }),
          update(patch: Row) {
            const filters: Array<[string, unknown]> = [];
            const b = {
              eq(c: string, v: unknown) {
                filters.push([c, v]);
                return b;
              },
              select() {
                return b;
              },
              then(resolve: (v: unknown) => unknown) {
                if (opts.failProfileWrite) return Promise.resolve({ data: null, error: { message: "db down" } }).then(resolve);
                const hit = matcher(filters, profile);
                if (hit) {
                  Object.assign(profile, patch);
                  profileWrites.push(patch);
                }
                return Promise.resolve({ data: hit ? [{ id: "user-1" }] : [], error: null }).then(resolve);
              }
            };
            return b;
          }
        };
      }
      throw new Error(`unexpected table ${table}`);
    }
  } as unknown as ReturnType<typeof createServiceClient>;

  return { client, events, profile, profileWrites };
}

function checkout(id: string, created: number, sub = "sub_1"): Stripe.Event {
  return {
    id,
    type: "checkout.session.completed",
    created,
    data: {
      object: {
        metadata: { user_id: "user-1", plan_id: "pro" },
        payment_status: "paid",
        customer: "cus_1",
        subscription: sub,
        customer_details: { email: "a@b.c" }
      }
    }
  } as unknown as Stripe.Event;
}

function subscriptionEvent(id: string, type: "updated" | "deleted", created: number, sub: string, status = "active"): Stripe.Event {
  return {
    id,
    type: `customer.subscription.${type}`,
    created,
    data: {
      object: {
        id: sub,
        status,
        metadata: { user_id: "user-1" },
        items: { data: [{ price: { id: "price_pro_test" } }] },
        cancel_at: null
      }
    }
  } as unknown as Stripe.Event;
}

describe("processStripeWebhookEvent — idempotency", () => {
  it("applies once and answers duplicate for a retry of the same event id, sending the email only once", async () => {
    const { processStripeWebhookEvent } = await import("./webhook-registry");
    const { client, profileWrites } = fakeDb();
    const event = checkout("evt_1", 1000);

    const first = await processStripeWebhookEvent(event, client);
    const second = await processStripeWebhookEvent(event, client);

    expect(first).toEqual({ status: "processed", outcome: "applied" });
    expect(second).toEqual({ status: "duplicate" });
    expect(profileWrites).toHaveLength(1);
    expect(sendPlanConfirmedEmail).toHaveBeenCalledTimes(1);
  });

  it("a failed DB write marks the event failed, throws, and the retry succeeds without a duplicate email", async () => {
    const { processStripeWebhookEvent } = await import("./webhook-registry");
    const failing = fakeDb({ failProfileWrite: true });
    const event = checkout("evt_1", 1000);

    await expect(processStripeWebhookEvent(event, failing.client)).rejects.toThrow("profiles update failed");
    expect(failing.events.get("evt_1")).toMatchObject({ status: "failed", last_error: "handler_failed" });
    expect(sendPlanConfirmedEmail).not.toHaveBeenCalled();

    // Same registry, healthy DB this time: re-claims the failed event.
    const healthy = fakeDb();
    healthy.events.set("evt_1", failing.events.get("evt_1")!);
    const retry = await processStripeWebhookEvent(event, healthy.client);

    expect(retry).toEqual({ status: "processed", outcome: "applied" });
    expect(healthy.events.get("evt_1")).toMatchObject({ status: "processed", attempts: 2 });
    expect(sendPlanConfirmedEmail).toHaveBeenCalledTimes(1);
  });

  it("an event another invocation is processing right now is in_progress (route answers non-2xx)", async () => {
    const { processStripeWebhookEvent } = await import("./webhook-registry");
    const { client, events } = fakeDb();
    events.set("evt_1", { event_id: "evt_1", status: "processing", claimed_at: new Date().toISOString(), attempts: 1 });

    expect(await processStripeWebhookEvent(checkout("evt_1", 1000), client)).toEqual({ status: "in_progress" });
    expect(sendPlanConfirmedEmail).not.toHaveBeenCalled();
  });

  it("takes over a claim abandoned past its lease", async () => {
    const { processStripeWebhookEvent, CLAIM_LEASE_MS } = await import("./webhook-registry");
    const { client, events } = fakeDb();
    events.set("evt_1", {
      event_id: "evt_1",
      status: "processing",
      claimed_at: new Date(Date.now() - CLAIM_LEASE_MS - 1000).toISOString(),
      attempts: 1
    });

    expect(await processStripeWebhookEvent(checkout("evt_1", 1000), client)).toEqual({ status: "processed", outcome: "applied" });
  });

  it("a failing email does not fail the webhook nor get retried (the write is already committed)", async () => {
    const { processStripeWebhookEvent } = await import("./webhook-registry");
    const { client, events } = fakeDb();
    sendPlanConfirmedEmail.mockRejectedValue(new Error("resend down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await processStripeWebhookEvent(checkout("evt_1", 1000), client);

    expect(result.status).toBe("processed");
    expect(events.get("evt_1")).toMatchObject({ status: "processed" });
    expect(errorSpy).toHaveBeenCalled();
  });

  it("degrades to unregistered processing (loudly) when migration 0038 isn't applied, instead of rejecting the webhook", async () => {
    const { processStripeWebhookEvent } = await import("./webhook-registry");
    const { client, profileWrites } = fakeDb({ registryMissing: true });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await processStripeWebhookEvent(checkout("evt_1", 1000), client);

    expect(result).toEqual({ status: "processed", outcome: "applied" });
    expect(profileWrites).toHaveLength(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("UNREGISTERED"), expect.anything());
  });
});

describe("processStripeWebhookEvent — ordering per subscription", () => {
  it("a delete for an OLD subscription arriving after a newer checkout does not touch the newer plan", async () => {
    const { processStripeWebhookEvent } = await import("./webhook-registry");
    const { client, profile } = fakeDb();

    await processStripeWebhookEvent(checkout("evt_new", 2000, "sub_new"), client);
    await processStripeWebhookEvent(subscriptionEvent("evt_old_del", "deleted", 1500, "sub_old", "canceled"), client);

    expect(profile).toMatchObject({ current_plan: "pro", stripe_subscription_id: "sub_new" });
  });

  it("an older update delivered after a newer one for the same subscription is skipped as stale", async () => {
    const { processStripeWebhookEvent } = await import("./webhook-registry");
    const { client, events, profile } = fakeDb({ profile: { stripe_subscription_id: "sub_1", current_plan: "pro" } });

    await processStripeWebhookEvent(subscriptionEvent("evt_b", "updated", 2000, "sub_1", "canceled"), client);
    expect(profile).toMatchObject({ current_plan: "free", stripe_subscription_id: null });

    const stale = await processStripeWebhookEvent(subscriptionEvent("evt_a", "updated", 1000, "sub_1", "active"), client);

    expect(stale).toEqual({ status: "processed", outcome: "skipped_stale" });
    expect(events.get("evt_a")).toMatchObject({ outcome: "skipped_stale" });
    expect(profile).toMatchObject({ current_plan: "free", stripe_subscription_id: null });
  });

  it("nothing is applied for a subscription after its delete, even a replayed checkout with a newer timestamp", async () => {
    const { processStripeWebhookEvent } = await import("./webhook-registry");
    const { client, profile } = fakeDb({ profile: { stripe_subscription_id: "sub_1", current_plan: "pro" } });

    await processStripeWebhookEvent(subscriptionEvent("evt_del", "deleted", 3000, "sub_1", "canceled"), client);
    expect(profile).toMatchObject({ current_plan: "free", stripe_subscription_id: null });

    const replay = await processStripeWebhookEvent(checkout("evt_replay", 4000, "sub_1"), client);

    expect(replay).toEqual({ status: "processed", outcome: "skipped_terminal" });
    expect(profile).toMatchObject({ current_plan: "free", stripe_subscription_id: null });
    expect(sendPlanConfirmedEmail).not.toHaveBeenCalled();
  });

  it("a delete that arrives BEFORE its checkout (ignored, nothing linked yet) still blocks the late checkout", async () => {
    const { processStripeWebhookEvent } = await import("./webhook-registry");
    const { client, events, profile } = fakeDb();

    const del = await processStripeWebhookEvent(subscriptionEvent("evt_del", "deleted", 3000, "sub_1", "canceled"), client);
    expect(del).toEqual({ status: "processed", outcome: "ignored" });

    const late = await processStripeWebhookEvent(checkout("evt_late", 2000, "sub_1"), client);

    expect(late).toEqual({ status: "processed", outcome: "skipped_terminal" });
    expect(events.get("evt_late")).toMatchObject({ outcome: "skipped_terminal" });
    expect(profile).toMatchObject({ current_plan: "free", stripe_subscription_id: null });
    expect(sendPlanConfirmedEmail).not.toHaveBeenCalled();
  });

  it("a delete is never skipped for being 'older' than another event: it is terminal truth", async () => {
    const { processStripeWebhookEvent } = await import("./webhook-registry");
    const { client, profile } = fakeDb({ profile: { stripe_subscription_id: "sub_1", current_plan: "pro" } });

    await processStripeWebhookEvent(subscriptionEvent("evt_up", "updated", 5000, "sub_1", "active"), client);
    const del = await processStripeWebhookEvent(subscriptionEvent("evt_del", "deleted", 4000, "sub_1", "canceled"), client);

    expect(del).toEqual({ status: "processed", outcome: "applied" });
    expect(profile).toMatchObject({ current_plan: "free", stripe_subscription_id: null });
  });

  it("invoice.payment_failed emails once per event id, however many times Stripe retries it", async () => {
    const { processStripeWebhookEvent } = await import("./webhook-registry");
    const { client } = fakeDb();
    const event = {
      id: "evt_inv",
      type: "invoice.payment_failed",
      created: 1000,
      data: { object: { customer_email: "a@b.c" } }
    } as unknown as Stripe.Event;

    await processStripeWebhookEvent(event, client);
    await processStripeWebhookEvent(event, client);
    await processStripeWebhookEvent(event, client);

    expect(sendPaymentFailedEmail).toHaveBeenCalledTimes(1);
  });
});
