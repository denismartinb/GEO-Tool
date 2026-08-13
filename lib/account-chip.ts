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
