import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: () =>
    Promise.resolve(
      new Map([
        ["host", "geo-tool-internal.vercel.app"],
        ["x-forwarded-host", "geo-tool-git-some-branch-team.vercel.app"],
        ["x-forwarded-proto", "https"]
      ])
    )
}));

const requireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (...args: unknown[]) => requireUser(...args) }));

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

  it("blocks starting a second checkout when the account already has a paid plan", async () => {
    getStripeClient.mockReturnValue({ checkout: { sessions: { create: vi.fn() } } });
    getPriceIdForPlan.mockReturnValue("price_pro_test");
    requireUser.mockResolvedValue({
      supabase: fakeSupabase({ profile: { current_plan: "starter", stripe_customer_id: null } }),
      user: { id: USER_ID, email: "founder@example.com" }
    });
    const { createCheckoutSession } = await import("./actions");

    const result = await createCheckoutSession("pro");

    expect(result).toMatchObject({ success: false });
    expect(getStripeClient().checkout.sessions.create).not.toHaveBeenCalled();
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
    vi.resetModules();
    vi.doMock("next/headers", () => ({ headers: () => Promise.resolve(new Map()) }));
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

    process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_SITE_URL;
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

describe("changePlan — Stripe-aware downgrade", () => {
  it("cancels the live Stripe subscription and clears stripe_subscription_id when downgrading", async () => {
    const cancel = vi.fn().mockResolvedValue({});
    getStripeClient.mockReturnValue({ subscriptions: { cancel } });
    const supabase = fakeSupabase({
      profile: { stripe_subscription_id: "sub_123" },
      activeProjectCount: 0
    });
    requireUser.mockResolvedValue({ supabase, user: { id: USER_ID } });
    const { changePlan } = await import("./actions");

    const result = await changePlan("free");

    expect(result).toEqual({ success: true });
    expect(cancel).toHaveBeenCalledWith("sub_123");
    expect(supabase.__profileUpdates).toContainEqual({ current_plan: "free", stripe_subscription_id: null });
  });

  it("does not call Stripe when there is no subscription to cancel", async () => {
    const cancel = vi.fn();
    getStripeClient.mockReturnValue({ subscriptions: { cancel } });
    const supabase = fakeSupabase({ profile: { stripe_subscription_id: null }, activeProjectCount: 0 });
    requireUser.mockResolvedValue({ supabase, user: { id: USER_ID } });
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
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { changePlan } = await import("./actions");

    const result = await changePlan("free");

    expect(result.success).toBe(false);
    expect(supabase.__profileUpdates).toHaveLength(0);
    errorSpy.mockRestore();
  });
});
