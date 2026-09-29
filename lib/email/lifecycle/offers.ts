import "server-only";

import { PLANS, PROMO_DURATION_MONTHS, PROMO_ENDS_AT, type Plan } from "@/app/pricing/plans-data";
import { getActivePromoPlanIds } from "@/lib/stripe";
import { formatDateLong, type PlanOffer } from "@/lib/email/lifecycle/templates";

/**
 * LIFECYCLE-TRIAL-1 (log §233). Prices and caps quoted by the trial emails,
 * read at send time from the same sources every other price surface uses
 * (TRUST-PROMISES-1, log §182): `PLANS`, and the promo only while
 * `getActivePromoPlanIds()` says checkout would really apply it (date AND a
 * configured Stripe coupon). Nothing here is typed by hand.
 */
function plan(id: Plan["id"]): Plan {
  const found = PLANS.find((p) => p.id === id);
  if (!found) throw new Error(`plan ${id} missing from PLANS`);
  return found;
}

export function resolvePlanOffer(id: "pro" | "starter"): PlanOffer {
  const p = plan(id);
  const promoActive = getActivePromoPlanIds().includes(id) && typeof p.promoPrice === "number";
  return {
    planName: p.name,
    price: p.price,
    promo: promoActive
      ? { price: p.promoPrice as number, months: PROMO_DURATION_MONTHS, endsLabel: formatDateLong(new Date(PROMO_ENDS_AT)) }
      : null
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
