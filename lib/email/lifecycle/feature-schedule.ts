/**
 * FEATURE-EMAILS-1 (log §417). Which feature email, if any, an account gets
 * on this firing of the daily lifecycle cron. Pure, so every rule the founder
 * approved on 2026-11-01 is tested without a database.
 *
 * - Search Console: a completed scan, no domain connected, Search Console
 *   configured in this deployment, 3 to 14 days after sign-up.
 * - Agentic audit, result: Pro, Agencia or the trial, the day after the
 *   account's first review that found something the site sells and scored it.
 * - Agentic audit, upgrade: Starter with a completed scan.
 * - Chrome extension: a completed scan, 7 days or more after sign-up (after
 *   the trial emails), older accounts included.
 *
 * Global rules: never to a comped or internal account, never to a read-only
 * account (`free`) or an unknown plan, never to someone who opted out of
 * «consejos y ofertas»; one lifecycle email every 48 h and none on Mondays,
 * like the rest of the sequence; at most one feature email per pass, in the
 * order Search Console, agentic audit, extension. Each goes once per account
 * (the unique `email_sends` row).
 */

export const FEATURE_KINDS = ["feature_gsc", "feature_extension", "feature_agentic"] as const;
export type FeatureEmailKind = (typeof FEATURE_KINDS)[number];

const HOUR_MS = 60 * 60 * 1000;

export const GSC_WINDOW_HOURS = { from: 72, to: 14 * 24 } as const;
export const EXTENSION_FROM_HOURS = 7 * 24;
/** «El día después del primer resultado»: 20 h, so a daily cron lands on it. */
export const AGENTIC_AFTER_RESULT_HOURS = 20;
export const FEATURE_MIN_HOURS_BETWEEN_EMAILS = 48;

export type FeatureAccountState = {
  createdAt: Date;
  /** Effective system plan (`resolveSystemPlanId`). */
  planId: string | null | undefined;
  isExcluded: boolean;
  lifecycleOptIn: boolean;
  hasCompletedScan: boolean;
  /** Search Console configured here AND its table readable. */
  gscAvailable: boolean;
  /** Any domain of the account with an active Search Console connection. */
  gscConnected: boolean;
  /** The account's first review that scored something the site sells. */
  firstAgenticResultAt: Date | null;
};

export type FeatureSentState = {
  kinds: ReadonlySet<string>;
  /** Latest send among every spaced lifecycle kind, feature kinds included. */
  lastLifecycleSentAt: Date | null;
};

export type FeatureEmailDecision =
  | { kind: "feature_gsc" }
  | { kind: "feature_agentic"; variant: "result" | "upgrade" }
  | { kind: "feature_extension" };

const PLANS_WITH_EMAILS = new Set(["starter", "pro", "agency"]);

function hoursBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / HOUR_MS;
}

export function decideFeatureEmail(
  account: FeatureAccountState,
  sent: FeatureSentState,
  now: Date
): FeatureEmailDecision | null {
  if (account.isExcluded || !account.lifecycleOptIn) return null;
  if (!account.planId || !PLANS_WITH_EMAILS.has(account.planId)) return null;
  if (now.getUTCDay() === 1) return null;
  if (
    sent.lastLifecycleSentAt !== null &&
    hoursBetween(sent.lastLifecycleSentAt, now) < FEATURE_MIN_HOURS_BETWEEN_EMAILS
  ) {
    return null;
  }

  const age = hoursBetween(account.createdAt, now);

  if (
    !sent.kinds.has("feature_gsc") &&
    account.hasCompletedScan &&
    account.gscAvailable &&
    !account.gscConnected &&
    age >= GSC_WINDOW_HOURS.from &&
    age < GSC_WINDOW_HOURS.to
  ) {
    return { kind: "feature_gsc" };
  }

  if (!sent.kinds.has("feature_agentic")) {
    if (account.planId === "starter" && account.hasCompletedScan) {
      return { kind: "feature_agentic", variant: "upgrade" };
    }
    if (
      account.planId !== "starter" &&
      account.firstAgenticResultAt !== null &&
      hoursBetween(account.firstAgenticResultAt, now) >= AGENTIC_AFTER_RESULT_HOURS
    ) {
      return { kind: "feature_agentic", variant: "result" };
    }
  }

  if (!sent.kinds.has("feature_extension") && account.hasCompletedScan && age >= EXTENSION_FROM_HOURS) {
    return { kind: "feature_extension" };
  }

  return null;
}
