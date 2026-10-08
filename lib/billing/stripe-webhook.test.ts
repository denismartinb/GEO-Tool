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
  process.env.STRIPE_PRICE_ID_STARTER = "price_starter_test";
  process.env.STRIPE_PRICE_ID_PRO = "price_pro_test";
  sendPlanConfirmedEmail.mockReset();
  sendPaymentFailedEmail.mockReset();
  sendCancellationScheduledEmail.mockReset();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

type Update = { patch: Record<string, unknown>; id: string };
type Row = Record<string, unknown>;

function fakeServiceClient(options: { updateError?: string; profile?: Row | null } = {}) {
  const updates: Update[] = [];
  // The row the account "holds" for guarded writes. Defaults to being linked to
  // sub_123 (what most fixtures use); a test overrides `stripe_subscription_id`
  // to model an account that has moved on to another subscription.
  const held: Row = { stripe_subscription_id: "sub_123", ...(options.profile ?? {}) };

  const client = {
    from(table: string) {
      if (table !== "profiles") throw new Error(`unexpected table ${table}`);
      return {
        select() {
          return {
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: options.profile ? held : null, error: null })
            })
          };
        },
        update(patch: Record<string, unknown>) {
          const filters: Array<[string, unknown]> = [];
          const builder = {
            eq(column: string, value: unknown) {
              filters.push([column, value]);
              return builder;
            },
            select() {
              return builder;
            },
            then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
              if (options.updateError) {
                return Promise.resolve({ data: null, error: { message: options.updateError } }).then(resolve, reject);
              }
              const matches = filters.every(([column, value]) => column === "id" || (held[column] ?? null) === value);
              const idFilter = filters.find(([column]) => column === "id");
              if (matches) updates.push({ patch, id: idFilter?.[1] as string });
              return Promise.resolve({ data: matches ? [{ id: idFilter?.[1] }] : [], error: null }).then(resolve, reject);
            }
          };
          return builder;
        }
      };
    }
  } as unknown as ReturnType<typeof createServiceClient>;

  return { client, updates };
}

function makeEvent<T>(type: string, object: T, id = "evt_test"): Stripe.Event {
  return { id, type, data: { object } } as unknown as Stripe.Event;
}

describe("handleStripeWebhookEvent", () => {
  it("checkout.session.completed: syncs current_plan + stripe ids from session metadata", async () => {
    const { handleStripeWebhookEvent } = await import("./stripe-webhook");
    const { client, updates } = fakeServiceClient();

    const event = makeEvent("checkout.session.completed", {
      metadata: { user_id: "user-1", plan_id: "pro" },
      payment_status: "paid",
      customer: "cus_123",
      subscription: "sub_123",
      customer_details: { email: "founder@example.com" }
    });

    await handleStripeWebhookEvent(event, client);

    expect(updates).toEqual([
      {
        patch: {
          current_plan: "pro",
          stripe_customer_id: "cus_123",
          stripe_subscription_id: "sub_123",
          trial_ends_at: null
        },
        id: "user-1"
      }
    ]);
    expect(sendPlanConfirmedEmail).toHaveBeenCalledWith("founder@example.com", "Pro");
  });

  it("checkout.session.completed: doesn't send an email when the session has no customer email", async () => {
    const { handleStripeWebhookEvent } = await import("./stripe-webhook");
    const { client } = fakeServiceClient();

    const event = makeEvent("checkout.session.completed", {
      metadata: { user_id: "user-1", plan_id: "pro" },
      payment_status: "paid",
      customer: "cus_123",
      subscription: "sub_123"
    });

    await handleStripeWebhookEvent(event, client);

    expect(sendPlanConfirmedEmail).not.toHaveBeenCalled();
  });

  it("checkout.session.completed: skips silently when required fields are missing (logged, not thrown)", async () => {
    const { handleStripeWebhookEvent } = await import("./stripe-webhook");
    const { client, updates } = fakeServiceClient();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const event = makeEvent("checkout.session.completed", {
      metadata: {},
      customer: "cus_123",
      subscription: "sub_123"
    });

    await expect(handleStripeWebhookEvent(event, client)).resolves.toBeUndefined();
    expect(updates).toHaveLength(0);

    errorSpy.mockRestore();
  });

  it("checkout.session.completed: throws (for a 500 + Stripe retry) when the DB write fails", async () => {
    const { handleStripeWebhookEvent } = await import("./stripe-webhook");
    const { client } = fakeServiceClient({ updateError: "db down" });

    const event = makeEvent("checkout.session.completed", {
      metadata: { user_id: "user-1", plan_id: "pro" },
      payment_status: "paid",
      customer: "cus_123",
      subscription: "sub_123"
    });

    await expect(handleStripeWebhookEvent(event, client)).rejects.toThrow(/db down/);
  });

  it("customer.subscription.updated: resolves the plan from the subscription's price id when active", async () => {
    const { handleStripeWebhookEvent } = await import("./stripe-webhook");
    const { client, updates } = fakeServiceClient({ profile: { current_plan: "pro", email: null } });

    const event = makeEvent("customer.subscription.updated", {
      id: "sub_123",
      status: "active",
      metadata: { user_id: "user-1" },
      items: { data: [{ price: { id: "price_pro_test" } }] }
    });

    await handleStripeWebhookEvent(event, client);

    expect(updates).toEqual([{ patch: { current_plan: "pro", trial_ends_at: null, cancel_at: null }, id: "user-1" }]);
  });

  it("customer.subscription.updated: sends a plan-confirmed email when the plan actually changed (a Portal-driven switch)", async () => {
    const { handleStripeWebhookEvent } = await import("./stripe-webhook");
    const { client } = fakeServiceClient({ profile: { current_plan: "starter", email: "founder@example.com" } });

    const event = makeEvent("customer.subscription.updated", {
      id: "sub_123",
      status: "active",
      metadata: { user_id: "user-1" },
      items: { data: [{ price: { id: "price_pro_test" } }] }
    });

    await handleStripeWebhookEvent(event, client);

    expect(sendPlanConfirmedEmail).toHaveBeenCalledWith("founder@example.com", "Pro");
  });

  it("customer.subscription.updated: doesn't send a plan-confirmed email when the plan didn't actually change", async () => {
    const { handleStripeWebhookEvent } = await import("./stripe-webhook");
    const { client } = fakeServiceClient({ profile: { current_plan: "pro", email: "founder@example.com" } });

    const event = makeEvent("customer.subscription.updated", {
      id: "sub_123",
      status: "active",
      metadata: { user_id: "user-1" },
      items: { data: [{ price: { id: "price_pro_test" } }] }
    });

    await handleStripeWebhookEvent(event, client);

    expect(sendPlanConfirmedEmail).not.toHaveBeenCalled();
  });

  it("customer.subscription.updated: sends a cancellation-scheduled email with the end-of-period date", async () => {
    const { handleStripeWebhookEvent } = await import("./stripe-webhook");
    const { client } = fakeServiceClient({ profile: { current_plan: "pro", email: "founder@example.com" } });
    const cancelAt = Math.floor(new Date("2026-08-11T00:00:00Z").getTime() / 1000);

    const event = makeEvent("customer.subscription.updated", {
      id: "sub_123",
      status: "active",
      metadata: { user_id: "user-1" },
      items: { data: [{ price: { id: "price_pro_test" } }] },
      cancel_at_period_end: true,
      cancel_at: cancelAt
    });

    await handleStripeWebhookEvent(event, client);

    expect(sendCancellationScheduledEmail).toHaveBeenCalledWith("founder@example.com", new Date(cancelAt * 1000));
  });

  it("customer.subscription.updated: doesn't send a cancellation email when there's no cancel_at at all", async () => {
    const { handleStripeWebhookEvent } = await import("./stripe-webhook");
    const { client } = fakeServiceClient({ profile: { current_plan: "pro", email: "founder@example.com" } });

    const event = makeEvent("customer.subscription.updated", {
      id: "sub_123",
      status: "active",
      metadata: { user_id: "user-1" },
      items: { data: [{ price: { id: "price_pro_test" } }] },
      cancel_at_period_end: false,
      cancel_at: null
    });

    await handleStripeWebhookEvent(event, client);

    expect(sendCancellationScheduledEmail).not.toHaveBeenCalled();
  });

  it("customer.subscription.updated: sends the cancellation email even when cancel_at_period_end stays false (Portal's actual behavior)", async () => {
    const { handleStripeWebhookEvent } = await import("./stripe-webhook");
    const { client, updates } = fakeServiceClient({ profile: { current_plan: "pro", email: "founder@example.com" } });
    const cancelAt = Math.floor(new Date("2026-08-11T00:00:00Z").getTime() / 1000);

    // Found via live testing: the Customer Portal's cancel flow sets
    // cancel_at directly and never flips cancel_at_period_end to true, so
    // this combination — not cancel_at_period_end: true — is the real shape
    // of a Portal-driven cancellation.
    const event = makeEvent("customer.subscription.updated", {
      id: "sub_123",
      status: "active",
      metadata: { user_id: "user-1" },
      items: { data: [{ price: { id: "price_pro_test" } }] },
      cancel_at_period_end: false,
      cancel_at: cancelAt
    });

    await handleStripeWebhookEvent(event, client);

    expect(sendCancellationScheduledEmail).toHaveBeenCalledWith("founder@example.com", new Date(cancelAt * 1000));
    expect(updates).toEqual([
      { patch: { current_plan: "pro", trial_ends_at: null, cancel_at: "2026-08-11T00:00:00.000Z" }, id: "user-1" }
    ]);
  });

  it("customer.subscription.updated: stores cancel_at so the billing page can show the scheduled cancellation", async () => {
    const { handleStripeWebhookEvent } = await import("./stripe-webhook");
    const { client, updates } = fakeServiceClient({ profile: { current_plan: "pro", email: "founder@example.com" } });
    const cancelAt = Math.floor(new Date("2026-08-11T00:00:00Z").getTime() / 1000);

    const event = makeEvent("customer.subscription.updated", {
      id: "sub_123",
      status: "active",
      metadata: { user_id: "user-1" },
      items: { data: [{ price: { id: "price_pro_test" } }] },
      cancel_at_period_end: true,
      cancel_at: cancelAt
    });

    await handleStripeWebhookEvent(event, client);

    expect(updates).toEqual([
      { patch: { current_plan: "pro", trial_ends_at: null, cancel_at: "2026-08-11T00:00:00.000Z" }, id: "user-1" }
    ]);
  });

  it("customer.subscription.updated: clears cancel_at when the owner reactivates (cancel_at back to null)", async () => {
    const { handleStripeWebhookEvent } = await import("./stripe-webhook");
    const { client, updates } = fakeServiceClient({ profile: { current_plan: "pro", email: "founder@example.com" } });

    const event = makeEvent("customer.subscription.updated", {
      id: "sub_123",
      status: "active",
      metadata: { user_id: "user-1" },
      items: { data: [{ price: { id: "price_pro_test" } }] },
      cancel_at_period_end: false,
      cancel_at: null
    });

    await handleStripeWebhookEvent(event, client);

    expect(updates).toEqual([{ patch: { current_plan: "pro", trial_ends_at: null, cancel_at: null }, id: "user-1" }]);
  });

  it("customer.subscription.updated: does nothing when the price id isn't a known self-serve plan", async () => {
    const { handleStripeWebhookEvent } = await import("./stripe-webhook");
    const { client, updates } = fakeServiceClient();

    const event = makeEvent("customer.subscription.updated", {
      id: "sub_123",
      status: "active",
      metadata: { user_id: "user-1" },
      items: { data: [{ price: { id: "price_unknown" } }] }
    });

    await handleStripeWebhookEvent(event, client);

    expect(updates).toHaveLength(0);
  });

  it.each(["canceled", "unpaid", "incomplete_expired", "paused"] as const)(
    "customer.subscription.updated: downgrades to free and clears the subscription id on status=%s",
    async (status) => {
      const { handleStripeWebhookEvent } = await import("./stripe-webhook");
      const { client, updates } = fakeServiceClient();

      const event = makeEvent("customer.subscription.updated", {
        id: "sub_123",
        status,
        metadata: { user_id: "user-1" },
        items: { data: [{ price: { id: "price_pro_test" } }] }
      });

      await handleStripeWebhookEvent(event, client);

      expect(updates).toEqual([{ patch: { current_plan: "free", stripe_subscription_id: null, cancel_at: null }, id: "user-1" }]);
    }
  );

  it("customer.subscription.updated: no-ops when metadata.user_id is missing", async () => {
    const { handleStripeWebhookEvent } = await import("./stripe-webhook");
    const { client, updates } = fakeServiceClient();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const event = makeEvent("customer.subscription.updated", {
      id: "sub_123",
      status: "active",
      metadata: {},
      items: { data: [{ price: { id: "price_pro_test" } }] }
    });

    await handleStripeWebhookEvent(event, client);

    expect(updates).toHaveLength(0);
    errorSpy.mockRestore();
  });

  it("customer.subscription.deleted: downgrades to free and clears the subscription id", async () => {
    const { handleStripeWebhookEvent } = await import("./stripe-webhook");
    const { client, updates } = fakeServiceClient();

    const event = makeEvent("customer.subscription.deleted", {
      id: "sub_123",
      metadata: { user_id: "user-1" }
    });

    await handleStripeWebhookEvent(event, client);

    expect(updates).toEqual([{ patch: { current_plan: "free", stripe_subscription_id: null, cancel_at: null }, id: "user-1" }]);
  });

  it("ignores event types it doesn't handle", async () => {
    const { handleStripeWebhookEvent } = await import("./stripe-webhook");
    const { client, updates } = fakeServiceClient();

    const event = makeEvent("invoice.paid", { id: "in_123" });

    await expect(handleStripeWebhookEvent(event, client)).resolves.toBeUndefined();
    expect(updates).toHaveLength(0);
  });

  it("invoice.payment_failed: sends a payment-failed email, no profile write", async () => {
    const { handleStripeWebhookEvent } = await import("./stripe-webhook");
    const { client, updates } = fakeServiceClient();

    const event = makeEvent("invoice.payment_failed", {
      id: "in_123",
      customer_email: "founder@example.com"
    });

    await handleStripeWebhookEvent(event, client);

    expect(sendPaymentFailedEmail).toHaveBeenCalledWith("founder@example.com");
    expect(updates).toHaveLength(0);
  });

  it("invoice.payment_failed: no-ops when the invoice has no customer email", async () => {
    const { handleStripeWebhookEvent } = await import("./stripe-webhook");
    const { client } = fakeServiceClient();

    const event = makeEvent("invoice.payment_failed", { id: "in_123" });

    await handleStripeWebhookEvent(event, client);

    expect(sendPaymentFailedEmail).not.toHaveBeenCalled();
  });

  describe("SEC-WEBHOOK-REGISTRY-1: scoped to the subscription the event is about", () => {
    it("checkout.session.completed: does NOT grant a plan for an unpaid session", async () => {
      const { handleStripeWebhookEvent } = await import("./stripe-webhook");
      const { client, updates } = fakeServiceClient();
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await handleStripeWebhookEvent(
        makeEvent("checkout.session.completed", {
          metadata: { user_id: "user-1", plan_id: "pro" },
          payment_status: "unpaid",
          customer: "cus_123",
          subscription: "sub_123",
          customer_details: { email: "a@b.c" }
        }),
        client
      );

      expect(updates).toHaveLength(0);
      expect(sendPlanConfirmedEmail).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it("customer.subscription.deleted for an OLD subscription leaves the newer one untouched", async () => {
      const { handleStripeWebhookEvent } = await import("./stripe-webhook");
      const { client, updates } = fakeServiceClient({ profile: { current_plan: "pro", stripe_subscription_id: "sub_new" } });

      await handleStripeWebhookEvent(
        makeEvent("customer.subscription.deleted", { id: "sub_old", metadata: { user_id: "user-1" } }),
        client
      );

      expect(updates).toHaveLength(0);
    });

    it("customer.subscription.updated(ended) for an OLD subscription does not downgrade the newer one", async () => {
      const { handleStripeWebhookEvent } = await import("./stripe-webhook");
      const { client, updates } = fakeServiceClient({ profile: { current_plan: "pro", stripe_subscription_id: "sub_new" } });

      await handleStripeWebhookEvent(
        makeEvent("customer.subscription.updated", { id: "sub_old", status: "canceled", metadata: { user_id: "user-1" } }),
        client
      );

      expect(updates).toHaveLength(0);
    });

    it("a stale 'active' update cannot resurrect a plan after the account was downgraded (no subscription held)", async () => {
      const { handleStripeWebhookEvent } = await import("./stripe-webhook");
      const { client, updates } = fakeServiceClient({
        profile: { current_plan: "free", stripe_subscription_id: null, email: "a@b.c" }
      });
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await handleStripeWebhookEvent(
        makeEvent("customer.subscription.updated", {
          id: "sub_123",
          status: "active",
          metadata: { user_id: "user-1" },
          items: { data: [{ price: { id: "price_pro_test" } }] }
        }),
        client
      );

      expect(updates).toHaveLength(0);
      expect(sendPlanConfirmedEmail).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });
});
