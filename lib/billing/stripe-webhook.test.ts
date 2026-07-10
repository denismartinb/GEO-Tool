import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type { createServiceClient } from "@/lib/supabase/service";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.STRIPE_PRICE_ID_STARTER = "price_starter_test";
  process.env.STRIPE_PRICE_ID_PRO = "price_pro_test";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

type Update = { patch: Record<string, unknown>; id: string };

function fakeServiceClient(options: { updateError?: string } = {}) {
  const updates: Update[] = [];

  const client = {
    from(table: string) {
      if (table !== "profiles") throw new Error(`unexpected table ${table}`);
      return {
        update(patch: Record<string, unknown>) {
          return {
            eq(_column: string, id: string) {
              updates.push({ patch, id });
              return Promise.resolve({ error: options.updateError ? { message: options.updateError } : null });
            }
          };
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
      customer: "cus_123",
      subscription: "sub_123"
    });

    await handleStripeWebhookEvent(event, client);

    expect(updates).toEqual([
      { patch: { current_plan: "pro", stripe_customer_id: "cus_123", stripe_subscription_id: "sub_123" }, id: "user-1" }
    ]);
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
      customer: "cus_123",
      subscription: "sub_123"
    });

    await expect(handleStripeWebhookEvent(event, client)).rejects.toThrow(/db down/);
  });

  it("customer.subscription.updated: resolves the plan from the subscription's price id when active", async () => {
    const { handleStripeWebhookEvent } = await import("./stripe-webhook");
    const { client, updates } = fakeServiceClient();

    const event = makeEvent("customer.subscription.updated", {
      id: "sub_123",
      status: "active",
      metadata: { user_id: "user-1" },
      items: { data: [{ price: { id: "price_pro_test" } }] }
    });

    await handleStripeWebhookEvent(event, client);

    expect(updates).toEqual([{ patch: { current_plan: "pro" }, id: "user-1" }]);
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

      expect(updates).toEqual([{ patch: { current_plan: "free", stripe_subscription_id: null }, id: "user-1" }]);
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

    expect(updates).toEqual([{ patch: { current_plan: "free", stripe_subscription_id: null }, id: "user-1" }]);
  });

  it("ignores event types it doesn't handle", async () => {
    const { handleStripeWebhookEvent } = await import("./stripe-webhook");
    const { client, updates } = fakeServiceClient();

    const event = makeEvent("invoice.paid", { id: "in_123" });

    await expect(handleStripeWebhookEvent(event, client)).resolves.toBeUndefined();
    expect(updates).toHaveLength(0);
  });
});
