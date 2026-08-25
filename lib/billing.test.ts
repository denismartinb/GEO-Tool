import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (...args: unknown[]) => requireUser(...args) }));

const createServiceClient = vi.fn();
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: (...args: unknown[]) => createServiceClient(...args) }));

const sendTrialEndedEmail = vi.fn();
vi.mock("@/lib/email/transactional", () => ({
  sendTrialEndedEmail: (...args: unknown[]) => sendTrialEndedEmail(...args)
}));

const getActiveSubscriptionPromo = vi.fn();
vi.mock("@/lib/stripe", () => ({
  getActiveSubscriptionPromo: (...args: unknown[]) => getActiveSubscriptionPromo(...args)
}));

import { getPlanForUser, getUsageSummary, isProOrAbove } from "./billing";

describe("isProOrAbove", () => {
  it("allows pro and agency", () => {
    expect(isProOrAbove("pro")).toBe(true);
    expect(isProOrAbove("agency")).toBe(true);
  });

  it("denies free and starter", () => {
    expect(isProOrAbove("free")).toBe(false);
    expect(isProOrAbove("starter")).toBe(false);
  });

  it("fails closed on a missing/unrecognized value instead of defaulting to allowed", () => {
    expect(isProOrAbove(null)).toBe(false);
    expect(isProOrAbove(undefined)).toBe(false);
    expect(isProOrAbove("")).toBe(false);
    expect(isProOrAbove("not-a-real-plan")).toBe(false);
  });
});

type Row = Record<string, unknown>;

function fakeProfileClient(profile: Row | null) {
  return {
    from(table: string) {
      if (table !== "profiles") throw new Error(`unexpected table ${table}`);
      return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: profile, error: null }) }) }) };
    }
  };
}

function fakeServiceClient(updateError?: string) {
  const updates: Array<{ patch: Row; id: string }> = [];
  return {
    client: {
      from(table: string) {
        if (table !== "profiles") throw new Error(`unexpected table ${table}`);
        return {
          update(patch: Row) {
            return {
              eq(_column: string, id: string) {
                updates.push({ patch, id });
                return Promise.resolve({ error: updateError ? { message: updateError } : null });
              }
            };
          }
        };
      }
    },
    updates
  };
}

const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

beforeEach(() => {
  createServiceClient.mockReset();
  requireUser.mockReset();
  sendTrialEndedEmail.mockReset();
  getActiveSubscriptionPromo.mockReset();
  getActiveSubscriptionPromo.mockResolvedValue(null);
});

describe("getPlanForUser — reverse trial expiry", () => {
  it("leaves an active (not-yet-expired) trial untouched", async () => {
    const supabase = fakeProfileClient({ current_plan: "pro", trial_ends_at: FUTURE, stripe_subscription_id: null });

    const plan = await getPlanForUser(supabase as never, "user-1");

    expect(plan.id).toBe("pro");
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("downgrades to free and clears trial_ends_at once the trial has expired", async () => {
    const supabase = fakeProfileClient({
      current_plan: "pro",
      trial_ends_at: PAST,
      stripe_subscription_id: null,
      email: "founder@example.com"
    });
    const { client, updates } = fakeServiceClient();
    createServiceClient.mockReturnValue(client);

    const plan = await getPlanForUser(supabase as never, "user-1");

    expect(plan.id).toBe("free");
    expect(updates).toEqual([{ patch: { current_plan: "free", trial_ends_at: null }, id: "user-1" }]);
    expect(sendTrialEndedEmail).toHaveBeenCalledWith("founder@example.com");
  });

  it("doesn't send a trial-ended email when the downgrade write fails", async () => {
    const supabase = fakeProfileClient({
      current_plan: "pro",
      trial_ends_at: PAST,
      stripe_subscription_id: null,
      email: "founder@example.com"
    });
    const { client } = fakeServiceClient("db down");
    createServiceClient.mockReturnValue(client);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await getPlanForUser(supabase as never, "user-1");

    expect(sendTrialEndedEmail).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("never downgrades an account that converted to a real paid subscription during the trial", async () => {
    const supabase = fakeProfileClient({
      current_plan: "pro",
      trial_ends_at: PAST,
      stripe_subscription_id: "sub_123"
    });

    const plan = await getPlanForUser(supabase as never, "user-1");

    expect(plan.id).toBe("pro");
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("fails safe (keeps the pre-expiry plan) when the service-role downgrade write fails", async () => {
    const supabase = fakeProfileClient({ current_plan: "pro", trial_ends_at: PAST, stripe_subscription_id: null });
    const { client } = fakeServiceClient("db down");
    createServiceClient.mockReturnValue(client);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const plan = await getPlanForUser(supabase as never, "user-1");

    expect(plan.id).toBe("pro");
    errorSpy.mockRestore();
  });

  it("fails safe when the service client itself is unavailable (misconfigured)", async () => {
    const supabase = fakeProfileClient({ current_plan: "pro", trial_ends_at: PAST, stripe_subscription_id: null });
    createServiceClient.mockImplementation(() => {
      throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const plan = await getPlanForUser(supabase as never, "user-1");

    expect(plan.id).toBe("pro");
    errorSpy.mockRestore();
  });

  it("no-ops when there is no trial at all", async () => {
    const supabase = fakeProfileClient({ current_plan: "starter", trial_ends_at: null, stripe_subscription_id: null });

    const plan = await getPlanForUser(supabase as never, "user-1");

    expect(plan.id).toBe("starter");
    expect(createServiceClient).not.toHaveBeenCalled();
  });
});

function fakeUsageSupabase(profile: Row | null) {
  return {
    from(table: string) {
      if (table === "profiles") {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: profile, error: null }) }) }) };
      }
      if (table === "projects") {
        return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
      }
      if (table === "project_prompts") {
        return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
      }
      if (table === "scan_prompt_results") {
        return { select: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    }
  };
}

describe("getUsageSummary — trial fields", () => {
  it("reports trialEndsAt while the trial is still active", async () => {
    const supabase = fakeUsageSupabase({
      current_plan: "pro",
      trial_ends_at: FUTURE,
      stripe_customer_id: null,
      stripe_subscription_id: null
    });
    requireUser.mockResolvedValue({ supabase, user: { id: "user-1" } });

    const usage = await getUsageSummary();

    expect(usage.planId).toBe("pro");
    expect(usage.trialEndsAt).toBe(FUTURE);
  });

  it("reports no trial once it has expired and the account has been downgraded", async () => {
    const supabase = fakeUsageSupabase({
      current_plan: "pro",
      trial_ends_at: PAST,
      stripe_customer_id: null,
      stripe_subscription_id: null
    });
    requireUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    const { client } = fakeServiceClient();
    createServiceClient.mockReturnValue(client);

    const usage = await getUsageSummary();

    expect(usage.planId).toBe("free");
    expect(usage.trialEndsAt).toBeNull();
  });

  it("reports cancelAt when a Portal-driven cancellation is scheduled", async () => {
    const supabase = fakeUsageSupabase({
      current_plan: "pro",
      trial_ends_at: null,
      stripe_customer_id: "cus_123",
      stripe_subscription_id: "sub_123",
      cancel_at: FUTURE
    });
    requireUser.mockResolvedValue({ supabase, user: { id: "user-1" } });

    const usage = await getUsageSummary();

    expect(usage.cancelAt).toBe(FUTURE);
  });

  it("reports cancelAt as null when there's no scheduled cancellation", async () => {
    const supabase = fakeUsageSupabase({
      current_plan: "pro",
      trial_ends_at: null,
      stripe_customer_id: "cus_123",
      stripe_subscription_id: "sub_123"
    });
    requireUser.mockResolvedValue({ supabase, user: { id: "user-1" } });

    const usage = await getUsageSummary();

    expect(usage.cancelAt).toBeNull();
  });
});

describe("getUsageSummary — subscriptionPromo (PRICING-PROMO-1)", () => {
  it("never checks Stripe for a promo when there's no real subscription yet", async () => {
    const supabase = fakeUsageSupabase({
      current_plan: "free",
      trial_ends_at: null,
      stripe_customer_id: null,
      stripe_subscription_id: null
    });
    requireUser.mockResolvedValue({ supabase, user: { id: "user-1" } });

    const usage = await getUsageSummary();

    expect(usage.subscriptionPromo).toBeNull();
    expect(getActiveSubscriptionPromo).not.toHaveBeenCalled();
  });

  it("threads through whatever Stripe reports for a real subscription", async () => {
    const supabase = fakeUsageSupabase({
      current_plan: "pro",
      trial_ends_at: null,
      stripe_customer_id: "cus_123",
      stripe_subscription_id: "sub_123"
    });
    requireUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    getActiveSubscriptionPromo.mockResolvedValue({ promoPrice: 59, endsAt: "2027-01-01T00:00:00.000Z" });

    const usage = await getUsageSummary();

    expect(usage.subscriptionPromo).toEqual({ promoPrice: 59, endsAt: "2027-01-01T00:00:00.000Z" });
    expect(getActiveSubscriptionPromo).toHaveBeenCalledWith("sub_123", "pro");
  });
});
