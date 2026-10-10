import "server-only";
import { NextResponse } from "next/server";
import { getFounderOffer } from "@/lib/stripe";

/**
 * FOUNDER-PRICE-1 (log §237). The founder offer for the public promo strip
 * (`components/landing/session-ctas.tsx`), which is a client island inside a
 * statically prerendered header and cannot read Stripe itself. Same answer
 * `/precios` and checkout get from `getFounderOffer()`: which plans carry the
 * founder price right now and how many slots are left. Cached like `/precios`
 * (ten minutes) so a page view is not a Stripe call. Nothing user-specific.
 */
export const revalidate = 600;

export async function GET() {
  const offer = await getFounderOffer();
  return NextResponse.json(offer);
}
