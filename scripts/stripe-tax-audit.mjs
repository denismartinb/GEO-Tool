#!/usr/bin/env node
/**
 * Read-only Stripe TEST-mode audit of how prices are taxed — run it by hand:
 *
 *   STRIPE_SECRET_KEY=sk_test_... STRIPE_PRICE_ID_STARTER=price_... \
 *   STRIPE_PRICE_ID_PRO=price_... [STRIPE_COUPON_ID_*_PROMO=...] \
 *   node scripts/stripe-tax-audit.mjs
 *
 * (Take the key from your vault; never paste it in chat.)
 *
 * It only issues GET requests plus `invoices.createPreview`, which computes a
 * hypothetical invoice and persists NOTHING. It refuses any key that isn't a
 * test key. It answers, for a buyer in Spain: is the Price tax-inclusive, what
 * tax code is on the product, are there tax registrations, and what total does
 * Stripe compute at sign-up, with and without the promo coupon.
 *
 * NOT covered, on purpose: renewal and proration. Both need a real
 * subscription, and creating one (even in test mode) is a change this script
 * never makes. Renewal after the coupon ends equals the "sin cupón" line below.
 */
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY ?? "";
if (!/^(sk|rk)_test_/.test(key)) {
  console.error("Refusing to run: STRIPE_SECRET_KEY must be a TEST key (sk_test_… / rk_test_…).");
  process.exit(1);
}
const stripe = new Stripe(key);

const eur = (cents, cur = "eur") => (cents == null ? "n/a" : `${(cents / 100).toFixed(2)} ${cur.toUpperCase()}`);
const plans = [
  ["starter", process.env.STRIPE_PRICE_ID_STARTER, process.env.STRIPE_COUPON_ID_STARTER_PROMO],
  ["pro", process.env.STRIPE_PRICE_ID_PRO, process.env.STRIPE_COUPON_ID_PRO_PROMO]
];

async function section(title, fn) {
  console.log(`\n=== ${title}`);
  try {
    await fn();
  } catch (e) {
    console.log(`  ERROR: ${e.code ?? e.type ?? "unknown"} — ${e.message}`);
  }
}

await section("Tax settings (Dashboard → Tax → Settings)", async () => {
  const s = await stripe.tax.settings.retrieve();
  console.log("  status:", s.status);
  console.log("  defaults.tax_behavior:", s.defaults?.tax_behavior ?? "(unset)");
  console.log("  defaults.tax_code:", s.defaults?.tax_code ?? "(unset)");
  console.log("  head_office country:", s.head_office?.address?.country ?? "(unset)");
});

await section("Tax registrations", async () => {
  const regs = await stripe.tax.registrations.list({ limit: 100 });
  if (!regs.data.length) console.log("  none registered");
  for (const r of regs.data) console.log(`  ${r.country} ${r.country_options ? Object.keys(r.country_options).join(",") : ""} status=${r.status}`);
});

for (const [plan, priceId, couponId] of plans) {
  await section(`Plan ${plan}`, async () => {
    if (!priceId) return console.log("  price id env var not set — skipped");
    const price = await stripe.prices.retrieve(priceId, { expand: ["product"] });
    const product = price.product;
    console.log(`  price ${price.id} active=${price.active} ${eur(price.unit_amount, price.currency)} / ${price.recurring?.interval ?? "one-time"}`);
    console.log(`  tax_behavior: ${price.tax_behavior}   (inclusive = el total NO sube con IVA; exclusive = IVA se suma)`);
    console.log(`  product ${product.id} "${product.name}" tax_code=${product.tax_code ?? "(unset → settings default)"}`);

    let coupon = null;
    if (couponId) {
      coupon = await stripe.coupons.retrieve(couponId);
      console.log(
        `  coupon ${coupon.id}: ${coupon.amount_off != null ? `amount_off ${eur(coupon.amount_off, coupon.currency)}` : `${coupon.percent_off}% off`}, ${coupon.duration}${coupon.duration_in_months ? ` ${coupon.duration_in_months}m` : ""}, redeem_by=${coupon.redeem_by ? new Date(coupon.redeem_by * 1000).toISOString() : "none"}, valid=${coupon.valid}`
      );
    }

    for (const withCoupon of coupon ? [false, true] : [false]) {
      const label = withCoupon ? "alta CON cupón (comprador en España)" : "alta SIN cupón (= renovación tras el cupón)";
      try {
        const inv = await stripe.invoices.createPreview({
          currency: price.currency,
          customer_details: { address: { country: "ES", postal_code: "28001" }, tax_exempt: "none" },
          automatic_tax: { enabled: true },
          subscription_details: { items: [{ price: price.id, quantity: 1 }] },
          ...(withCoupon ? { discounts: [{ coupon: coupon.id }] } : {})
        });
        const taxes = (inv.total_taxes ?? []).map((t) => `${eur(t.amount, inv.currency)} (${t.tax_behavior}, ${t.taxability_reason})`);
        console.log(`  ▸ ${label}: subtotal ${eur(inv.subtotal, inv.currency)} · impuestos ${taxes.join("; ") || "0"} · TOTAL ${eur(inv.total, inv.currency)} · auto_tax=${inv.automatic_tax?.status}`);
      } catch (e) {
        console.log(`  ▸ ${label}: preview failed — ${e.code ?? e.type}: ${e.message}`);
      }
    }
  });
}

console.log("\nNo cubierto: prorrateo y renovación real (requieren una suscripción de test; este script no crea nada).");
