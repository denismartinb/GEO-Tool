import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const retrieve = vi.fn();
const update = vi.fn();
vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    subscriptions: { retrieve },
    customers: { update }
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

async function freshSyncBillingDetailsToStripeCustomer() {
  const mod = await import("./stripe");
  return mod.syncBillingDetailsToStripeCustomer;
}

beforeEach(() => {
  retrieve.mockReset();
  update.mockReset();
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

/**
 * BILLING-INVOICE-FIELDS-1 (Task Intake approved 2026-08-25, log §166): razón
 * social/NIF reach a real Stripe customer as `invoice_settings.custom_fields`
 * — free text, not typed `tax_id_data`, so there is no fiscal-type inference
 * to get wrong.
 */
describe("syncBillingDetailsToStripeCustomer", () => {
  it("does nothing when Stripe isn't configured at all", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const syncBillingDetailsToStripeCustomer = await freshSyncBillingDetailsToStripeCustomer();

    await syncBillingDetailsToStripeCustomer("cus_123", { legalName: "Xataka Media S.L.", taxId: "B-1" });

    expect(update).not.toHaveBeenCalled();
  });

  it("sends both fields when both are filled in", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    update.mockResolvedValue({});
    const syncBillingDetailsToStripeCustomer = await freshSyncBillingDetailsToStripeCustomer();

    await syncBillingDetailsToStripeCustomer("cus_123", {
      legalName: "Xataka Media S.L.",
      taxId: "B-84920011"
    });

    expect(update).toHaveBeenCalledWith("cus_123", {
      invoice_settings: {
        custom_fields: [
          { name: "Razón social", value: "Xataka Media S.L." },
          { name: "NIF/CIF", value: "B-84920011" }
        ]
      }
    });
  });

  it("only sends the field that is actually filled in", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    update.mockResolvedValue({});
    const syncBillingDetailsToStripeCustomer = await freshSyncBillingDetailsToStripeCustomer();

    await syncBillingDetailsToStripeCustomer("cus_123", { legalName: "Xataka Media S.L.", taxId: "" });

    expect(update).toHaveBeenCalledWith("cus_123", {
      invoice_settings: { custom_fields: [{ name: "Razón social", value: "Xataka Media S.L." }] }
    });
  });

  it("clears custom_fields with null, not an empty array, when both are blank", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    update.mockResolvedValue({});
    const syncBillingDetailsToStripeCustomer = await freshSyncBillingDetailsToStripeCustomer();

    await syncBillingDetailsToStripeCustomer("cus_123", { legalName: "", taxId: "" });

    expect(update).toHaveBeenCalledWith("cus_123", { invoice_settings: { custom_fields: null } });
  });

  it("truncates a value past Stripe's 30-character limit instead of sending it raw", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    update.mockResolvedValue({});
    const syncBillingDetailsToStripeCustomer = await freshSyncBillingDetailsToStripeCustomer();
    const longName = "Una Razón Social Muy Larga De Verdad S.L.";

    await syncBillingDetailsToStripeCustomer("cus_123", { legalName: longName, taxId: "" });

    const sentValue = update.mock.calls[0][1].invoice_settings.custom_fields[0].value;
    expect(sentValue).toBe(longName.slice(0, 30));
    expect(sentValue.length).toBe(30);
  });

  it("fails safe (silent, logged) when the Stripe API call itself fails", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    update.mockRejectedValue(new Error("network down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const syncBillingDetailsToStripeCustomer = await freshSyncBillingDetailsToStripeCustomer();

    await expect(
      syncBillingDetailsToStripeCustomer("cus_123", { legalName: "Xataka Media S.L.", taxId: "" })
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
