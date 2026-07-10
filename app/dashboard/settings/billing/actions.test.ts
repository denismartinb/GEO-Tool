import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Mutable (not vi.doMock, which leaks into later tests since resetModules()
// doesn't undo it) so individual tests can simulate a missing host header.
let headerEntries = new Map<string, string>();
function resetHeaderEntries() {
  headerEntries = new Map([
    ["host", "geo-tool-internal.vercel.app"],
    ["x-forwarded-host", "geo-tool-git-some-branch-team.vercel.app"],
    ["x-forwarded-proto", "https"]
  ]);
}
resetHeaderEntries();
vi.mock("next/headers", () => ({ headers: () => Promise.resolve(headerEntries) }));

const requireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (...args: unknown[]) => requireUser(...args) }));

const createServiceClient = vi.fn();
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: (...args: unknown[]) => createServiceClient(...args) }));

const getStripeClient = vi.fn();
const getPriceIdForPlan = vi.fn();
const isSelfServePlan = vi.fn((planId: string) => planId === "starter" || planId === "pro");
vi.mock("@/lib/stripe", () => ({
  getStripeClient: (...args: unknown[]) => getStripeClient(...args),
  getPriceIdForPlan: (...args: unknown[]) => getPriceIdForPlan(...args),
  isSelfServePlan: (...args: [string]) => isSelfServePlan(...args)
}));

const USER_ID = "user-1";

type Row = Record<string, unknown>;

/** Minimal fake covering exactly the query shapes actions.ts issues against `profiles`/`projects`. */
function fakeSupabase({
  profile,
  activeProjectCount = 0,
  updateError
}: {
  profile: Row | null;
  activeProjectCount?: number;
  updateError?: string;
}) {
  const profileUpdates: Row[] = [];

  return {
    from(table: string) {
      if (table === "profiles") {
        return {
          select() {
            return { eq: () => ({ maybeSingle: () => Promise.resolve({ data: profile, error: null }) }) };
          },
          update(patch: Row) {
            profileUpdates.push(patch);
            return { eq: () => Promise.resolve({ error: updateError ? { message: updateError } : null }) };
          }
        };
      }
      if (table === "projects") {
        return {
          select() {
            return {
              eq: () => ({
                eq: () => Promise.resolve({ count: activeProjectCount, error: null })
              })
            };
          },
          update() {
            return { in: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null, count: 0 }) }) }) };
          }
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    __profileUpdates: profileUpdates
  };
}

beforeEach(() => {
  requireUser.mockReset();
  getStripeClient.mockReset();
  getPriceIdForPlan.mockReset();
  createServiceClient.mockReset();
  resetHeaderEntries();
});

afterEach(() => {
  vi.resetModules();
});

describe("createCheckoutSession", () => {
  it("rejects a non-self-serve plan (free, agency)", async () => {
    const { createCheckoutSession } = await import("./actions");

    await expect(createCheckoutSession("agency")).resolves.toMatchObject({ success: false });
    expect(requireUser).not.toHaveBeenCalled();
  });

  it("fails gracefully when Stripe isn't configured yet", async () => {
    getStripeClient.mockReturnValue(null);
    getPriceIdForPlan.mockReturnValue("price_pro_test");
    const { createCheckoutSession } = await import("./actions");

    const result = await createCheckoutSession("pro");

    expect(result).toMatchObject({ success: false });
  });

  it("fails gracefully when the plan has no configured price id", async () => {
    getStripeClient.mockReturnValue({ checkout: { sessions: { create: vi.fn() } } });
    getPriceIdForPlan.mockReturnValue(null);
    const { createCheckoutSession } = await import("./actions");

    const result = await createCheckoutSession("pro");

    expect(result).toMatchObject({ success: false });
  });

  it("blocks starting a second checkout when the account already has a real paid subscription", async () => {
    getStripeClient.mockReturnValue({ checkout: { sessions: { create: vi.fn() } } });
    getPriceIdForPlan.mockReturnValue("price_pro_test");
    requireUser.mockResolvedValue({
      supabase: fakeSupabase({
        profile: { current_plan: "starter", stripe_customer_id: "cus_existing", stripe_subscription_id: "sub_existing" }
      }),
      user: { id: USER_ID, email: "founder@example.com" }
    });
    const { createCheckoutSession } = await import("./actions");

    const result = await createCheckoutSession("pro");

    expect(result).toMatchObject({ success: false });
    expect(getStripeClient().checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("allows checking out during an unconverted reverse trial (current_plan='pro' but no real subscription)", async () => {
    const create = vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/session/xyz" });
    getStripeClient.mockReturnValue({ checkout: { sessions: { create } } });
    getPriceIdForPlan.mockReturnValue("price_pro_test");
    requireUser.mockResolvedValue({
      supabase: fakeSupabase({
        profile: { current_plan: "pro", stripe_customer_id: null, stripe_subscription_id: null }
      }),
      user: { id: USER_ID, email: "founder@example.com" }
    });
    const { createCheckoutSession } = await import("./actions");

    const result = await createCheckoutSession("pro");

    expect(result).toEqual({ success: true, url: "https://checkout.stripe.com/session/xyz" });
    expect(create).toHaveBeenCalled();
  });

  it("creates a real Checkout Session for a Free -> paid move and returns its url", async () => {
    const create = vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/session/xyz" });
    getStripeClient.mockReturnValue({ checkout: { sessions: { create } } });
    getPriceIdForPlan.mockReturnValue("price_pro_test");
    requireUser.mockResolvedValue({
      supabase: fakeSupabase({ profile: { current_plan: "free", stripe_customer_id: null } }),
      user: { id: USER_ID, email: "founder@example.com" }
    });
    const { createCheckoutSession } = await import("./actions");

    const result = await createCheckoutSession("pro");

    expect(result).toEqual({ success: true, url: "https://checkout.stripe.com/session/xyz" });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        // Regression coverage: success_url/cancel_url must be derived from
        // x-forwarded-host (the branch alias the user actually visited), not
        // the internal `host` Vercel rewrites requests to, and not
        // NEXT_PUBLIC_SITE_URL (production) — both previously sent a Preview
        // deployment's checkout back to the wrong origin after payment.
        success_url: "https://geo-tool-git-some-branch-team.vercel.app/dashboard/settings/billing?checkout=success",
        cancel_url: "https://geo-tool-git-some-branch-team.vercel.app/dashboard/settings/billing?checkout=cancelled",
        mode: "subscription",
        client_reference_id: USER_ID,
        line_items: [{ price: "price_pro_test", quantity: 1 }],
        metadata: { user_id: USER_ID, plan_id: "pro" }
      })
    );
  });

  it("strips a trailing slash from the NEXT_PUBLIC_SITE_URL fallback when no host header is present", async () => {
    headerEntries = new Map();
    const hadOriginal = "NEXT_PUBLIC_SITE_URL" in process.env;
    const ORIGINAL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.genscore.es/";

    const create = vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/session/xyz" });
    getStripeClient.mockReturnValue({ checkout: { sessions: { create } } });
    getPriceIdForPlan.mockReturnValue("price_pro_test");
    requireUser.mockResolvedValue({
      supabase: fakeSupabase({ profile: { current_plan: "free", stripe_customer_id: null } }),
      user: { id: USER_ID, email: "founder@example.com" }
    });
    const { createCheckoutSession } = await import("./actions");

    await createCheckoutSession("pro");

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url: "https://www.genscore.es/dashboard/settings/billing?checkout=success",
        cancel_url: "https://www.genscore.es/dashboard/settings/billing?checkout=cancelled"
      })
    );

    // process.env assignment stringifies its value, so assigning back
    // `undefined` would leave the literal string "undefined" behind for
    // every later test in this run instead of actually clearing it.
    if (hadOriginal) {
      process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_SITE_URL;
    } else {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    }
  });

  it("reuses an existing stripe_customer_id instead of customer_email when one is on file", async () => {
    const create = vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/session/xyz" });
    getStripeClient.mockReturnValue({ checkout: { sessions: { create } } });
    getPriceIdForPlan.mockReturnValue("price_pro_test");
    requireUser.mockResolvedValue({
      supabase: fakeSupabase({ profile: { current_plan: "free", stripe_customer_id: "cus_existing" } }),
      user: { id: USER_ID, email: "founder@example.com" }
    });
    const { createCheckoutSession } = await import("./actions");

    await createCheckoutSession("pro");

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_existing", customer_email: undefined })
    );
  });

  it("returns a safe error when Stripe itself throws", async () => {
    const create = vi.fn().mockRejectedValue(new Error("stripe api down"));
    getStripeClient.mockReturnValue({ checkout: { sessions: { create } } });
    getPriceIdForPlan.mockReturnValue("price_pro_test");
    requireUser.mockResolvedValue({
      supabase: fakeSupabase({ profile: { current_plan: "free", stripe_customer_id: null } }),
      user: { id: USER_ID, email: "founder@example.com" }
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { createCheckoutSession } = await import("./actions");

    const result = await createCheckoutSession("pro");

    expect(result.success).toBe(false);
    errorSpy.mockRestore();
  });
});

describe("createPortalSession", () => {
  it("fails gracefully when Stripe isn't configured yet", async () => {
    getStripeClient.mockReturnValue(null);
    const { createPortalSession } = await import("./actions");

    const result = await createPortalSession();

    expect(result).toMatchObject({ success: false });
  });

  it("fails when the account has no stripe_customer_id (never subscribed)", async () => {
    getStripeClient.mockReturnValue({ billingPortal: { sessions: { create: vi.fn() } } });
    requireUser.mockResolvedValue({
      supabase: fakeSupabase({ profile: { stripe_customer_id: null } }),
      user: { id: USER_ID }
    });
    const { createPortalSession } = await import("./actions");

    const result = await createPortalSession();

    expect(result).toMatchObject({ success: false });
  });

  it("creates a real portal session for an existing customer and returns its url, derived from the request host", async () => {
    const create = vi.fn().mockResolvedValue({ url: "https://billing.stripe.com/session/xyz" });
    getStripeClient.mockReturnValue({ billingPortal: { sessions: { create } } });
    requireUser.mockResolvedValue({
      supabase: fakeSupabase({ profile: { stripe_customer_id: "cus_existing" } }),
      user: { id: USER_ID }
    });
    const { createPortalSession } = await import("./actions");

    const result = await createPortalSession();

    expect(result).toEqual({ success: true, url: "https://billing.stripe.com/session/xyz" });
    expect(create).toHaveBeenCalledWith({
      customer: "cus_existing",
      return_url: "https://geo-tool-git-some-branch-team.vercel.app/dashboard/settings/billing"
    });
  });

  it("returns a safe error when Stripe itself throws", async () => {
    const create = vi.fn().mockRejectedValue(new Error("stripe api down"));
    getStripeClient.mockReturnValue({ billingPortal: { sessions: { create } } });
    requireUser.mockResolvedValue({
      supabase: fakeSupabase({ profile: { stripe_customer_id: "cus_existing" } }),
      user: { id: USER_ID }
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { createPortalSession } = await import("./actions");

    const result = await createPortalSession();

    expect(result.success).toBe(false);
    errorSpy.mockRestore();
  });

  it("deep-links a cancel intent straight into the Portal's cancellation flow", async () => {
    const create = vi.fn().mockResolvedValue({ url: "https://billing.stripe.com/session/xyz" });
    getStripeClient.mockReturnValue({ billingPortal: { sessions: { create } } });
    requireUser.mockResolvedValue({
      supabase: fakeSupabase({ profile: { stripe_customer_id: "cus_existing", stripe_subscription_id: "sub_123" } }),
      user: { id: USER_ID }
    });
    const { createPortalSession } = await import("./actions");

    await createPortalSession({ type: "cancel" });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        flow_data: { type: "subscription_cancel", subscription_cancel: { subscription: "sub_123" } }
      })
    );
  });

  it("deep-links an update intent straight into the Portal's plan-confirmation flow, using the subscription's item id", async () => {
    const create = vi.fn().mockResolvedValue({ url: "https://billing.stripe.com/session/xyz" });
    const retrieve = vi.fn().mockResolvedValue({ items: { data: [{ id: "si_abc" }] } });
    getStripeClient.mockReturnValue({ billingPortal: { sessions: { create } }, subscriptions: { retrieve } });
    getPriceIdForPlan.mockReturnValue("price_pro_test");
    requireUser.mockResolvedValue({
      supabase: fakeSupabase({ profile: { stripe_customer_id: "cus_existing", stripe_subscription_id: "sub_123" } }),
      user: { id: USER_ID }
    });
    const { createPortalSession } = await import("./actions");

    await createPortalSession({ type: "update", planId: "pro" });

    expect(retrieve).toHaveBeenCalledWith("sub_123");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        flow_data: expect.objectContaining({
          type: "subscription_update_confirm",
          subscription_update_confirm: {
            subscription: "sub_123",
            items: [{ id: "si_abc", price: "price_pro_test", quantity: 1 }]
          }
        })
      })
    );
  });

  it("falls back to the plain portal homepage when the subscription lookup fails for a deep link", async () => {
    const create = vi.fn().mockResolvedValue({ url: "https://billing.stripe.com/session/xyz" });
    const retrieve = vi.fn().mockRejectedValue(new Error("stripe api down"));
    getStripeClient.mockReturnValue({ billingPortal: { sessions: { create } }, subscriptions: { retrieve } });
    getPriceIdForPlan.mockReturnValue("price_pro_test");
    requireUser.mockResolvedValue({
      supabase: fakeSupabase({ profile: { stripe_customer_id: "cus_existing", stripe_subscription_id: "sub_123" } }),
      user: { id: USER_ID }
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { createPortalSession } = await import("./actions");

    const result = await createPortalSession({ type: "update", planId: "pro" });

    expect(result.success).toBe(true);
    expect(create).toHaveBeenCalledWith(
      expect.not.objectContaining({ flow_data: expect.anything() })
    );
    errorSpy.mockRestore();
  });
});

describe("changePlan — Stripe-aware downgrade", () => {
  it("cancels the live Stripe subscription and clears stripe_subscription_id when downgrading", async () => {
    const cancel = vi.fn().mockResolvedValue({});
    getStripeClient.mockReturnValue({ subscriptions: { cancel } });
    const supabase = fakeSupabase({
      profile: { stripe_subscription_id: "sub_123" },
      activeProjectCount: 0
    });
    requireUser.mockResolvedValue({ supabase, user: { id: USER_ID } });
    createServiceClient.mockReturnValue(supabase);
    const { changePlan } = await import("./actions");

    const result = await changePlan("free");

    expect(result).toEqual({ success: true });
    expect(cancel).toHaveBeenCalledWith("sub_123");
    // Regression: the final profiles write is privileged (0016_protect_billing_columns.sql
    // rejects it otherwise) — must go through the service client, not the caller's own session.
    expect(supabase.__profileUpdates).toContainEqual({ current_plan: "free", stripe_subscription_id: null });
  });

  it("does not call Stripe when there is no subscription to cancel", async () => {
    const cancel = vi.fn();
    getStripeClient.mockReturnValue({ subscriptions: { cancel } });
    const supabase = fakeSupabase({ profile: { stripe_subscription_id: null }, activeProjectCount: 0 });
    requireUser.mockResolvedValue({ supabase, user: { id: USER_ID } });
    createServiceClient.mockReturnValue(supabase);
    const { changePlan } = await import("./actions");

    const result = await changePlan("free");

    expect(result).toEqual({ success: true });
    expect(cancel).not.toHaveBeenCalled();
  });

  it("fails the downgrade (does not silently succeed) when Stripe cancellation fails", async () => {
    const cancel = vi.fn().mockRejectedValue(new Error("stripe down"));
    getStripeClient.mockReturnValue({ subscriptions: { cancel } });
    const supabase = fakeSupabase({ profile: { stripe_subscription_id: "sub_123" }, activeProjectCount: 0 });
    requireUser.mockResolvedValue({ supabase, user: { id: USER_ID } });
    createServiceClient.mockReturnValue(supabase);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { changePlan } = await import("./actions");

    const result = await changePlan("free");

    expect(result.success).toBe(false);
    expect(supabase.__profileUpdates).toHaveLength(0);
    errorSpy.mockRestore();
  });

  it("fails gracefully instead of crashing when the service client is unavailable", async () => {
    const supabase = fakeSupabase({ profile: { stripe_subscription_id: null }, activeProjectCount: 0 });
    requireUser.mockResolvedValue({ supabase, user: { id: USER_ID } });
    createServiceClient.mockImplementation(() => {
      throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { changePlan } = await import("./actions");

    const result = await changePlan("free");

    expect(result.success).toBe(false);
    expect(supabase.__profileUpdates).toHaveLength(0);
    errorSpy.mockRestore();
  });
});
