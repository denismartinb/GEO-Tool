import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (...args: unknown[]) => requireUser(...args) }));

const createServiceClient = vi.fn();
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: (...args: unknown[]) => createServiceClient(...args) }));

const sendTrialEndedEmail = vi.fn();
vi.mock("@/lib/email/transactional", () => ({
  sendTrialEndedEmail: (...args: unknown[]) => sendTrialEndedEmail(...args)
}));

const notifyTrialEndedOnDowngrade = vi.fn(async (..._args: unknown[]) => true);
vi.mock("@/lib/email/lifecycle/runner", () => ({
  notifyTrialEndedOnDowngrade: (...args: unknown[]) => notifyTrialEndedOnDowngrade(...args)
}));
let lifecycleOn = false;
vi.mock("@/lib/email/lifecycle/flag", () => ({ isLifecycleEmailEnabled: () => lifecycleOn }));

const getActiveSubscriptionPromo = vi.fn();
vi.mock("@/lib/stripe", () => ({
  getActiveSubscriptionPromo: (...args: unknown[]) => getActiveSubscriptionPromo(...args)
}));

import { getPlanForUser, getUsageSummary, isProOrAbove, resolveEffectivePlanId, resolveSystemPlanId } from "./billing";

describe("resolveEffectivePlanId (BILLING-COMPED-1)", () => {
  const ORIGINAL = process.env.COMPED_ACCOUNT_EMAILS;

  beforeEach(() => {
    process.env.COMPED_ACCOUNT_EMAILS = "comped@example.com";
  });

  afterEach(() => {
    process.env.COMPED_ACCOUNT_EMAILS = ORIGINAL;
  });

  it("overrides to agency for a comped email regardless of the stored plan", () => {
    expect(resolveEffectivePlanId("free", "comped@example.com")).toBe("agency");
    expect(resolveEffectivePlanId(null, "Comped@Example.com")).toBe("agency");
  });

  it("passes the raw plan through unchanged for a non-comped email", () => {
    expect(resolveEffectivePlanId("starter", "customer@example.com")).toBe("starter");
    expect(resolveEffectivePlanId(null, "customer@example.com")).toBeNull();
  });

  it("fails closed (no override) when the env var is unset", () => {
    delete process.env.COMPED_ACCOUNT_EMAILS;
    expect(resolveEffectivePlanId("free", "comped@example.com")).toBe("free");
  });
});

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
  notifyTrialEndedOnDowngrade.mockClear();
  lifecycleOn = false;
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

  it("hands the end-of-trial email to the lifecycle sequence when its switch is on (LIFECYCLE-WINBACK-1)", async () => {
    lifecycleOn = true;
    const supabase = fakeProfileClient({
      current_plan: "pro",
      trial_ends_at: PAST,
      stripe_subscription_id: null,
      email: "founder@example.com"
    });
    const { client } = fakeServiceClient();
    createServiceClient.mockReturnValue(client);

    const plan = await getPlanForUser(supabase as never, "user-1");

    expect(plan.id).toBe("free");
    expect(sendTrialEndedEmail).not.toHaveBeenCalled();
    expect(notifyTrialEndedOnDowngrade).toHaveBeenCalledWith(client, {
      userId: "user-1",
      email: "founder@example.com",
      trialEndsAt: new Date(PAST)
    });
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

  it("reads a comped account as agency regardless of its stored plan (BILLING-COMPED-1)", async () => {
    const ORIGINAL = process.env.COMPED_ACCOUNT_EMAILS;
    process.env.COMPED_ACCOUNT_EMAILS = "comped@example.com";
    const supabase = fakeProfileClient({
      current_plan: "free",
      trial_ends_at: null,
      stripe_subscription_id: null,
      email: "comped@example.com"
    });

    const plan = await getPlanForUser(supabase as never, "user-1");

    expect(plan.id).toBe("agency");
    process.env.COMPED_ACCOUNT_EMAILS = ORIGINAL;
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

describe("getUsageSummary — comped accounts (BILLING-COMPED-1)", () => {
  it("reports agency caps for a comped email even on the free plan", async () => {
    const ORIGINAL = process.env.COMPED_ACCOUNT_EMAILS;
    process.env.COMPED_ACCOUNT_EMAILS = "comped@example.com";
    const supabase = fakeUsageSupabase({
      current_plan: "free",
      trial_ends_at: null,
      stripe_customer_id: null,
      stripe_subscription_id: null,
      email: "comped@example.com"
    });
    requireUser.mockResolvedValue({ supabase, user: { id: "user-1" } });

    const usage = await getUsageSummary();

    expect(usage.planId).toBe("agency");
    process.env.COMPED_ACCOUNT_EMAILS = ORIGINAL;
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

/**
 * ALERTS-SCOPE-1 (log §229): the plan system code (sweep, scan creation,
 * watchdog) acts on. azotea.cl and rideflumserberg.ch were scanned daily for
 * ten days after their trials ended, because the sweep read `current_plan`
 * raw and trial expiry only lands when the user opens the console.
 */
describe("resolveSystemPlanId (ALERTS-SCOPE-1)", () => {
  const ORIGINAL = process.env.COMPED_ACCOUNT_EMAILS;
  const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  beforeEach(() => {
    process.env.COMPED_ACCOUNT_EMAILS = "comped@example.com";
  });

  afterEach(() => {
    process.env.COMPED_ACCOUNT_EMAILS = ORIGINAL;
  });

  it("reads an expired, never-revisited trial as Free", () => {
    expect(resolveSystemPlanId({ current_plan: "pro", trial_ends_at: past, email: "a@example.com" })).toBe("free");
  });

  it("keeps a trial that is still running", () => {
    expect(resolveSystemPlanId({ current_plan: "pro", trial_ends_at: future, email: "a@example.com" })).toBe("pro");
  });

  it("never downgrades an account that converted to a paid subscription", () => {
    expect(
      resolveSystemPlanId({ current_plan: "pro", trial_ends_at: past, stripe_subscription_id: "sub_1", email: "a@example.com" })
    ).toBe("pro");
  });

  it("reads a comped account as Agency, like the console does", () => {
    expect(resolveSystemPlanId({ current_plan: "free", trial_ends_at: null, email: "comped@example.com" })).toBe("agency");
  });

  it("passes a plain plan through", () => {
    expect(resolveSystemPlanId({ current_plan: "starter", trial_ends_at: null, email: "a@example.com" })).toBe("starter");
  });
});

/**
 * TRIAL-ONLY-1: the domain-overage gate locked the whole console of any trial
 * that ended with 2+ domains. Without a plan the account is read-only, so the
 * gate has nothing to protect — it keeps its job only for a real paid
 * downgrade.
 */
describe("getDomainOverage", () => {
  function fakeOverageSupabase(plan: string, activeCount: number) {
    return {
      from(table: string) {
        if (table === "profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { current_plan: plan, stripe_subscription_id: null, email: "a@b.es" },
                  error: null
                })
              })
            })
          };
        }
        const rows = Array.from({ length: activeCount }, (_, i) => ({ id: `p${i}`, name: `p${i}`, domain: `p${i}.es` }));
        return {
          select: (_cols: string, opts?: { head?: boolean }) => ({
            eq: () =>
              opts?.head
                ? Promise.resolve({ count: activeCount, error: null })
                : { order: async () => ({ data: rows, error: null }) }
          })
        };
      }
    };
  }

  it("never gates a read-only (free) account, whatever its domain count", async () => {
    const { getDomainOverage } = await import("./billing");
    requireUser.mockResolvedValue({ supabase: fakeOverageSupabase("free", 4), user: { id: "user-1" } });
    expect((await getDomainOverage()).isOverCapacity).toBe(false);
  });

  it("still gates a paid plan over its cap", async () => {
    const { getDomainOverage } = await import("./billing");
    requireUser.mockResolvedValue({ supabase: fakeOverageSupabase("starter", 3), user: { id: "user-1" } });
    const overage = await getDomainOverage();
    expect(overage.isOverCapacity).toBe(true);
    expect(overage.requiredRemoveCount).toBe(2);
  });
});
