import "server-only";

import { PLANS, type Plan } from "@/app/pricing/plans-data";
import { getFounderOffer } from "@/lib/stripe";
import type { PlanOffer } from "@/lib/email/lifecycle/templates";

/**
 * LIFECYCLE-TRIAL-1 (log §233). Prices and caps quoted by the trial emails,
 * read at send time from the same sources every other price surface uses
 * (TRUST-PROMISES-1, log §182): `PLANS`, and the founder price only while
 * `getFounderOffer()` says checkout would really apply it (a matching Stripe
 * coupon and slots left — FOUNDER-PRICE-1, log §237). Nothing here is typed
 * by hand.
 */
function plan(id: Plan["id"]): Plan {
  const found = PLANS.find((p) => p.id === id);
  if (!found) throw new Error(`plan ${id} missing from PLANS`);
  return found;
}

export async function resolvePlanOffer(id: "pro" | "starter"): Promise<PlanOffer> {
  const p = plan(id);
  const founder = await getFounderOffer();
  const promoActive = founder.planIds.includes(id) && typeof p.promoPrice === "number";
  return {
    planName: p.name,
    price: p.price,
    promo: promoActive ? { price: p.promoPrice as number, remaining: founder.remaining, total: founder.total } : null
  };
}

/**
 * What really changes when the Pro trial ends. TRIAL-ONLY-1: the account no
 * longer drops to a smaller plan — it goes read-only (no scans at all, no new
 * domains, every existing datum kept), so the right column states that, not a
 * reduced meter. The Pro side still reads from `PLANS`.
 */
export function proVsFreeRows(): Array<{ label: string; pro: string; free: string }> {
  const pro = plan("pro").meter;
  return [
    { label: "Escaneos", pro: pro.refresh, free: "Ninguno" },
    { label: "Motores de IA", pro: String(pro.engines), free: "—" },
    { label: "Dominios", pro: String(pro.projects), free: "Sin añadir nuevos" },
    { label: "Tus datos", pro: "Al día", free: "Solo lectura" }
  ];
}
