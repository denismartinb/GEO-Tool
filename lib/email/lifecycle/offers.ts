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

/** What really changes from Pro to Free, from each plan's own meter. */
export function proVsFreeRows(): Array<{ label: string; pro: string; free: string }> {
  const pro = plan("pro").meter;
  const free = plan("free").meter;
  return [
    { label: "Motores de IA", pro: String(pro.engines), free: String(free.engines) },
    { label: "Prompts monitorizados", pro: `~${pro.prompts}`, free: `~${free.prompts}` },
    { label: "Escaneo", pro: pro.refresh, free: free.refresh },
    { label: "Dominios", pro: String(pro.projects), free: String(free.projects) }
  ];
}
