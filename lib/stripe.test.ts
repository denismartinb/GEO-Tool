import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const retrieve = vi.fn();
vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    subscriptions: { retrieve }
  }))
}));

const ORIGINAL_ENV = { ...process.env };

/**
 * `getStripeClient()` caches its client in a module-level variable, so every
 * test here re-imports the module fresh (`vi.resetModules()`) — otherwise the
 * first test's client (or lack of one) would leak into the rest via the
 * cache, independent of what STRIPE_SECRET_KEY says on a later test.
 */
async function freshGetActiveSubscriptionPromo() {
  const mod = await import("./stripe");
  return mod.getActiveSubscriptionPromo;
}

beforeEach(() => {
  retrieve.mockReset();
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("getActiveSubscriptionPromo", () => {
  it("returns null when Stripe isn't configured at all", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_COUPON_ID_PRO_PROMO = "promo_pro";
    const getActiveSubscriptionPromo = await freshGetActiveSubscriptionPromo();

    const result = await getActiveSubscriptionPromo("sub_1", "pro");

    expect(result).toBeNull();
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("returns null when this plan has no promo coupon configured", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    delete process.env.STRIPE_COUPON_ID_PRO_PROMO;
    const getActiveSubscriptionPromo = await freshGetActiveSubscriptionPromo();

    const result = await getActiveSubscriptionPromo("sub_1", "pro");

    expect(result).toBeNull();
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("returns null for a non-self-serve plan (free, agency)", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    const getActiveSubscriptionPromo = await freshGetActiveSubscriptionPromo();

    expect(await getActiveSubscriptionPromo("sub_1", "free")).toBeNull();
    expect(await getActiveSubscriptionPromo("sub_1", "agency")).toBeNull();
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("returns the promo price and real end date when the matching coupon is applied", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.STRIPE_COUPON_ID_PRO_PROMO = "promo_pro";
    const endTimestamp = Math.floor(new Date("2027-01-01T00:00:00Z").getTime() / 1000);
    retrieve.mockResolvedValue({
      discounts: [{ id: "di_1", source: { type: "coupon", coupon: { id: "promo_pro" } }, end: endTimestamp }]
    });
    const getActiveSubscriptionPromo = await freshGetActiveSubscriptionPromo();

    const result = await getActiveSubscriptionPromo("sub_1", "pro");

    expect(result).toEqual({ promoPrice: 59, endsAt: new Date(endTimestamp * 1000).toISOString() });
    expect(retrieve).toHaveBeenCalledWith("sub_1", { expand: ["discounts"] });
  });

  it("matches a coupon returned as a bare string id, not just an expanded object", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.STRIPE_COUPON_ID_STARTER_PROMO = "promo_starter";
    const endTimestamp = Math.floor(new Date("2027-01-01T00:00:00Z").getTime() / 1000);
    retrieve.mockResolvedValue({
      discounts: [{ id: "di_1", source: { type: "coupon", coupon: "promo_starter" }, end: endTimestamp }]
    });
    const getActiveSubscriptionPromo = await freshGetActiveSubscriptionPromo();

    const result = await getActiveSubscriptionPromo("sub_1", "starter");

    expect(result).toEqual({ promoPrice: 19, endsAt: new Date(endTimestamp * 1000).toISOString() });
  });

  it("never mislabels an unrelated discount (e.g. a manual support coupon) as the launch promo", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.STRIPE_COUPON_ID_PRO_PROMO = "promo_pro";
    retrieve.mockResolvedValue({
      discounts: [{ id: "di_1", source: { type: "coupon", coupon: { id: "support_discount_50" } }, end: 9999999999 }]
    });
    const getActiveSubscriptionPromo = await freshGetActiveSubscriptionPromo();

    const result = await getActiveSubscriptionPromo("sub_1", "pro");

    expect(result).toBeNull();
  });

  it("returns null when there is no discount on the subscription at all", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.STRIPE_COUPON_ID_PRO_PROMO = "promo_pro";
    retrieve.mockResolvedValue({ discounts: [] });
    const getActiveSubscriptionPromo = await freshGetActiveSubscriptionPromo();

    const result = await getActiveSubscriptionPromo("sub_1", "pro");

    expect(result).toBeNull();
  });

  it("fails safe (null, logged) when the Stripe API call itself fails", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.STRIPE_COUPON_ID_PRO_PROMO = "promo_pro";
    retrieve.mockRejectedValue(new Error("network down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const getActiveSubscriptionPromo = await freshGetActiveSubscriptionPromo();

    const result = await getActiveSubscriptionPromo("sub_1", "pro");

    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
