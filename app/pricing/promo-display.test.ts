import { describe, expect, it } from "vitest";
import { PLANS, resolveShownPromoPrice } from "./plans-data";

const pro = PLANS.find((p) => p.id === "pro")!;
const free = PLANS.find((p) => p.id === "free")!;

/**
 * PROMO-CONSOLE-PARITY-1 (2026-08-27, log §170).
 *
 * The bug this fixes was not a wrong number — it was two screens of the same
 * product quoting different ones at the same instant, because only one of them
 * knew that "promo" has two meanings. These tests fix both meanings and, above
 * all, that they never collapse into each other.
 */
describe("resolveShownPromoPrice", () => {
  const promoPlanIds = ["starter", "pro"];

  it("quotes the launch price to someone on the free Pro trial — the reported bug", () => {
    // No Stripe subscription yet, so no `subscriptionPromo`. The console showed
    // 179 €/mes while `/precios` and the change-plan modal showed 59 €.
    expect(resolveShownPromoPrice({ plan: pro, activePromoPrice: undefined, promoPlanIds })).toEqual({
      price: 59,
      kind: "offered"
    });
  });

  it("prefers the CONTRACTED price, and says which it is", () => {
    // A real subscriber's own coupon wins over the campaign: it is what they
    // are actually being charged, and its end date is read off the
    // subscription itself (§152), not off `PROMO_ENDS_AT`.
    expect(resolveShownPromoPrice({ plan: pro, activePromoPrice: 59, promoPlanIds })).toEqual({
      price: 59,
      kind: "contracted"
    });
  });

  it("never labels an offer as contracted — the two drive different copy", () => {
    // Telling a trial user they are already paying 59 € is exactly the
    // fake-figure failure this repo keeps writing rules about.
    const offered = resolveShownPromoPrice({ plan: pro, activePromoPrice: null, promoPlanIds });
    expect(offered?.kind).toBe("offered");
  });

  it("stays silent when the campaign is closed or the Stripe coupon is missing", () => {
    // `promoPlanIds` comes from `getActivePromoPlanIds()`, which demands the
    // date AND a configured coupon — so an empty list is the one signal that
    // must silence every screen at once.
    expect(resolveShownPromoPrice({ plan: pro, activePromoPrice: undefined, promoPlanIds: [] })).toBeNull();
  });

  it("stays silent for a plan that has no promo price at all", () => {
    expect(resolveShownPromoPrice({ plan: free, activePromoPrice: undefined, promoPlanIds })).toBeNull();
    expect(resolveShownPromoPrice({ plan: null, activePromoPrice: undefined, promoPlanIds })).toBeNull();
  });

  it("still honours a contracted coupon after the campaign has closed", () => {
    // A subscriber who redeemed before `PROMO_ENDS_AT` keeps their 6 months
    // running well past it (`getActiveSubscriptionPromo`). An empty
    // `promoPlanIds` must not wipe the price they are really paying.
    expect(resolveShownPromoPrice({ plan: pro, activePromoPrice: 59, promoPlanIds: [] })).toEqual({
      price: 59,
      kind: "contracted"
    });
  });
});
