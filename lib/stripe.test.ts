import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const retrieve = vi.fn();
const update = vi.fn();
const couponRetrieve = vi.fn();
const priceRetrieve = vi.fn();
vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    subscriptions: { retrieve },
    customers: { update },
    coupons: { retrieve: couponRetrieve },
    prices: { retrieve: priceRetrieve }
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
  couponRetrieve.mockReset();
  priceRetrieve.mockReset();
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

/**
 * FOUNDER-PRICE-1 (log §237). The offer is shown and charged only when every
 * configured coupon has exactly the shape the screen advertises, and the
 * slots are counted from Stripe's own `times_redeemed`.
 */
const founderCoupon = (amountOff: number, timesRedeemed = 0, overrides: Record<string, unknown> = {}) => ({
  valid: true,
  duration: "forever",
  currency: "eur",
  amount_off: amountOff,
  times_redeemed: timesRedeemed,
  ...overrides
});

describe("getFounderOffer", () => {
  function configureFounder() {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.STRIPE_COUPON_ID_STARTER_FOUNDER = "c_starter";
    process.env.STRIPE_COUPON_ID_PRO_FOUNDER = "c_pro";
  }

  it("offers both plans with the slots left summed across both coupons", async () => {
    configureFounder();
    couponRetrieve.mockImplementation(async (id: string) =>
      id === "c_starter" ? founderCoupon(900, 2) : founderCoupon(3000, 1)
    );
    const { getFounderOffer } = await import("./stripe");

    expect(await getFounderOffer()).toEqual({ planIds: ["starter", "pro"], remaining: 35, total: 38 });
  });

  it("drops a plan whose coupon does not match its advertised price (old 6-month promo, percentage, wrong amount)", async () => {
    configureFounder();
    couponRetrieve.mockImplementation(async (id: string) =>
      id === "c_starter"
        ? founderCoupon(900, 0, { duration: "repeating" })
        : founderCoupon(3000, 0, { amount_off: null, percent_off: 30 })
    );
    const { getFounderOffer } = await import("./stripe");

    expect((await getFounderOffer()).planIds).toEqual([]);
  });

  it("closes the offer once the slots are gone", async () => {
    configureFounder();
    couponRetrieve.mockImplementation(async (id: string) =>
      id === "c_starter" ? founderCoupon(900, 20) : founderCoupon(3000, 18)
    );
    const { getFounderOffer } = await import("./stripe");

    expect(await getFounderOffer()).toEqual({ planIds: [], remaining: 0, total: 38 });
  });

  it("fails closed when Stripe cannot be read, and caches only briefly", async () => {
    configureFounder();
    couponRetrieve.mockRejectedValue(new Error("network down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { getFounderOffer } = await import("./stripe");

    expect((await getFounderOffer(1_000)).planIds).toEqual([]);
    couponRetrieve.mockImplementation(async (id: string) =>
      id === "c_starter" ? founderCoupon(900) : founderCoupon(3000)
    );
    expect((await getFounderOffer(1_000 + 30_000)).planIds).toEqual([]); // still cached
    expect((await getFounderOffer(1_000 + 61_000)).planIds).toEqual(["starter", "pro"]);
    errorSpy.mockRestore();
  });

  it("offers nothing without Stripe or without coupons, and never calls Stripe then", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const { getFounderOffer } = await import("./stripe");

    expect((await getFounderOffer()).planIds).toEqual([]);
    expect(couponRetrieve).not.toHaveBeenCalled();
  });
});

describe("stripePriceMatchesPlan", () => {
  it("accepts only a tax-inclusive euro Price whose amount is the catalog price", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    const { getStripeClient, stripePriceMatchesPlan } = await import("./stripe");
    const stripe = getStripeClient()!;

    priceRetrieve.mockResolvedValue({ currency: "eur", unit_amount: 9900, tax_behavior: "inclusive" });
    expect(await stripePriceMatchesPlan(stripe, "price_pro", "pro")).toBe(true);

    priceRetrieve.mockResolvedValue({ currency: "eur", unit_amount: 17900, tax_behavior: "inclusive" });
    expect(await stripePriceMatchesPlan(stripe, "price_pro_old", "pro")).toBe(false);

    // /pricing shows IVA-inclusive prices: a tax-exclusive Price would add 21 % at checkout.
    priceRetrieve.mockResolvedValue({ currency: "eur", unit_amount: 9900, tax_behavior: "exclusive" });
    expect(await stripePriceMatchesPlan(stripe, "price_pro_excl", "pro")).toBe(false);

    priceRetrieve.mockResolvedValue({ currency: "usd", unit_amount: 2900, tax_behavior: "inclusive" });
    expect(await stripePriceMatchesPlan(stripe, "price_starter_usd", "starter")).toBe(false);
  });
});

describe("getActiveSubscriptionPromo", () => {
  it("returns null when Stripe isn't configured at all", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_COUPON_ID_PRO_FOUNDER = "promo_pro";
    const getActiveSubscriptionPromo = await freshGetActiveSubscriptionPromo();

    const result = await getActiveSubscriptionPromo("sub_1", "pro");

    expect(result).toBeNull();
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("returns null when this plan has no promo coupon configured", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    delete process.env.STRIPE_COUPON_ID_PRO_FOUNDER;
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

  it("returns the founder price when the matching (forever, so end-less) coupon is applied", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.STRIPE_COUPON_ID_PRO_FOUNDER = "promo_pro";
    retrieve.mockResolvedValue({
      discounts: [{ id: "di_1", source: { type: "coupon", coupon: { id: "promo_pro" } }, end: null }]
    });
    const getActiveSubscriptionPromo = await freshGetActiveSubscriptionPromo();

    const result = await getActiveSubscriptionPromo("sub_1", "pro");

    expect(result).toEqual({ promoPrice: 69 });
    expect(retrieve).toHaveBeenCalledWith("sub_1", { expand: ["discounts"] });
  });

  it("matches a coupon returned as a bare string id, not just an expanded object", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.STRIPE_COUPON_ID_STARTER_FOUNDER = "promo_starter";
    retrieve.mockResolvedValue({
      discounts: [{ id: "di_1", source: { type: "coupon", coupon: "promo_starter" }, end: null }]
    });
    const getActiveSubscriptionPromo = await freshGetActiveSubscriptionPromo();

    const result = await getActiveSubscriptionPromo("sub_1", "starter");

    expect(result).toEqual({ promoPrice: 20 });
  });

  it("never mislabels an unrelated discount (e.g. a manual support coupon) as the founder price", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.STRIPE_COUPON_ID_PRO_FOUNDER = "promo_pro";
    retrieve.mockResolvedValue({
      discounts: [{ id: "di_1", source: { type: "coupon", coupon: { id: "support_discount_50" } }, end: 9999999999 }]
    });
    const getActiveSubscriptionPromo = await freshGetActiveSubscriptionPromo();

    const result = await getActiveSubscriptionPromo("sub_1", "pro");

    expect(result).toBeNull();
  });

  it("returns null when there is no discount on the subscription at all", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.STRIPE_COUPON_ID_PRO_FOUNDER = "promo_pro";
    retrieve.mockResolvedValue({ discounts: [] });
    const getActiveSubscriptionPromo = await freshGetActiveSubscriptionPromo();

    const result = await getActiveSubscriptionPromo("sub_1", "pro");

    expect(result).toBeNull();
  });

  it("fails safe (null, logged) when the Stripe API call itself fails", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.STRIPE_COUPON_ID_PRO_FOUNDER = "promo_pro";
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
