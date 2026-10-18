/**
 * SEO-TRACK-1 (log §341): how much keyword tracking each plan gets. Read with
 * the EFFECTIVE plan (`resolveSystemPlanId` from system code, the user's own
 * plan read from a request), never `current_plan` raw: an expired trial must
 * stop costing DataForSEO calls the day it expires (log §229).
 *
 * The trial is `pro` until it elapses, so it gets Pro's caps. `free` (a
 * read-only account, log §243) and anything unrecognized get nothing: a cap
 * that falls back toward "yes" would spend money for an account nobody pays.
 *
 * Measured cost (SEO-DIAG-0, 2026-10-18): one weekly Top 20 is 0.004 $, so
 * Pro at its cap is ~0.86 $/month and Agency ~2.6 $ per domain.
 */
export type SeoTrackingCaps = { keywords: number; competitors: number };

export const SEO_TRACKING_CAPS: Record<string, SeoTrackingCaps> = {
  starter: { keywords: 15, competitors: 1 },
  pro: { keywords: 50, competitors: 3 },
  agency: { keywords: 150, competitors: 3 }
};

const NONE: SeoTrackingCaps = { keywords: 0, competitors: 0 };

export function seoTrackingCapsFor(planId: string | null | undefined): SeoTrackingCaps {
  return (planId && SEO_TRACKING_CAPS[planId]) || NONE;
}

/**
 * Splits keywords a customer wants to add into the ones that fit under the
 * cap and the ones that do not, keeping their order. `existing` is how many
 * keywords the project already tracks.
 */
export function fitUnderCap<T>(existing: number, cap: number, incoming: T[]): { accepted: T[]; rejected: T[] } {
  const room = Math.max(0, cap - existing);
  return { accepted: incoming.slice(0, room), rejected: incoming.slice(room) };
}
