/**
 * The account chip's derived bits, shared by the console sidebar
 * (`components/sidebar.tsx`) and the public header
 * (`components/marketing/public-header.tsx`).
 *
 * GENSCORE-HEADER-2: the founder asked for the public header's logged-in state
 * to be the console's chip, not a lookalike. Both surfaces therefore render the
 * same classes (`.user-chip`, `.avatar`, `.sb-plan-badge`) and derive the
 * initials here — restating `email.slice(0, 2)` in the second caller is exactly
 * how "the same chip" quietly becomes two chips.
 */

/** Two-letter monogram for the avatar circle. Empty string in, empty out — the caller renders an empty circle rather than a stray character. */
export function avatarInitials(email: string): string {
  return email.slice(0, 2).toUpperCase();
}

/**
 * Whether the plan badge renders at all. Free shows no badge — founder
 * decision 2026-07-31, already in force in the sidebar; the public header
 * inherits it rather than deciding again.
 */
export function showsPlanBadge(planId: string): boolean {
  return planId !== "free";
}

/**
 * Whether the home page's "7 días de Pro · Sin tarjeta" strip renders.
 *
 * Founder, 2026-08-12: *"la franja de 7 días tiene que salir a usuarios no
 * logados o plan free"*. It is an acquisition offer, so a paying customer
 * being told about a free trial reads as a product that doesn't know who is
 * looking at it — the same complaint that started GENSCORE-HEADER-2. But
 * "hide it when there's a session" would be wrong in the other direction: to a
 * logged-in Free account the offer is still a real, useful upsell.
 *
 * `undefined` means anonymous or not resolved yet, and shows the strip. That
 * matches the header's own optimism (`lib/use-session-user.ts`): the visitor
 * the strip is written for sees it with no flicker, and a paying customer sees
 * it for the moment the identity takes to arrive.
 */
export function showsPromoStrip(planId: string | undefined): boolean {
  return planId === undefined || planId === "free";
}
