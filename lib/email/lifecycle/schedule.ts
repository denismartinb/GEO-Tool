/**
 * LIFECYCLE-TRIAL-1 (log §233). Which trial email, if any, an account should
 * get on this firing of the daily cron. Pure on purpose: every rule the
 * founder approved lives here, and every one is tested without a database.
 *
 * Approved sequence (docs/design-reference/lifecycle-emails-1/):
 * - D1 · activation — only if the account has no completed scan yet (the
 *   usual case is that people add a domain and scan at sign-up, and then this
 *   email simply never goes out).
 * - D3 · first action — the top real recommendation, or a no-scan variant.
 * - D5 · two days left — deadline email; it outranks the other two.
 *
 * Global rules: never to a paying, comped or internal account; never after
 * the trial has ended (that is Fase D's job); never to someone who opted out
 * of "consejos y ofertas"; at most one lifecycle email every 48 h (D5
 * excepted, its date will not wait); and the non-urgent ones skip Mondays,
 * which belong to the weekly digest.
 *
 * Windows are expressed in hours from sign-up or to the trial end, each at
 * least 24 h wide, so a daily cron lands in every one of them exactly once
 * (the `email_sends` row stops the second).
 */

export const TRIAL_KINDS = ["trial_d1", "trial_d3", "trial_d5"] as const;
export type TrialEmailKind = (typeof TRIAL_KINDS)[number];

const HOUR_MS = 60 * 60 * 1000;

export const D1_WINDOW_HOURS = { from: 20, to: 72 } as const;
export const D3_WINDOW_HOURS = { from: 72, to: 120 } as const;
/** Hours LEFT until `trial_ends_at`: ~2 days, 24 h wide. */
export const D5_REMAINING_WINDOW_HOURS = { above: 36, atMost: 60 } as const;
export const MIN_HOURS_BETWEEN_LIFECYCLE_EMAILS = 48;

export type TrialAccountState = {
  createdAt: Date;
  trialEndsAt: Date | null;
  hasSubscription: boolean;
  /** Comped allow-list or internal test account. */
  isExcluded: boolean;
  lifecycleOptIn: boolean;
  hasProject: boolean;
  hasCompletedScan: boolean;
};

export type SentState = {
  kinds: ReadonlySet<string>;
  /** Most recent send among the lifecycle kinds (not the product alerts). */
  lastLifecycleSentAt: Date | null;
};

export type TrialEmailDecision =
  | { kind: "trial_d1"; variant: "no_domain" | "no_scan" }
  | { kind: "trial_d3"; variant: "with_scan" | "no_scan" }
  | { kind: "trial_d5" };

function hoursBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / HOUR_MS;
}

/** Monday in Madrid ≈ Monday in UTC at the cron's 07:45 UTC firing. */
function isMonday(now: Date): boolean {
  return now.getUTCDay() === 1;
}

export function decideTrialEmail(account: TrialAccountState, sent: SentState, now: Date): TrialEmailDecision | null {
  if (account.isExcluded || account.hasSubscription || !account.lifecycleOptIn) return null;
  if (!account.trialEndsAt || account.trialEndsAt.getTime() <= now.getTime()) return null;

  const hoursLeft = hoursBetween(now, account.trialEndsAt);
  const age = hoursBetween(account.createdAt, now);

  // D5 first: it carries a real date and cannot be moved.
  if (
    !sent.kinds.has("trial_d5") &&
    hoursLeft > D5_REMAINING_WINDOW_HOURS.above &&
    hoursLeft <= D5_REMAINING_WINDOW_HOURS.atMost
  ) {
    return { kind: "trial_d5" };
  }

  const recentlyEmailed =
    sent.lastLifecycleSentAt !== null &&
    hoursBetween(sent.lastLifecycleSentAt, now) < MIN_HOURS_BETWEEN_LIFECYCLE_EMAILS;
  if (recentlyEmailed || isMonday(now)) return null;

  if (!sent.kinds.has("trial_d3") && age >= D3_WINDOW_HOURS.from && age < D3_WINDOW_HOURS.to) {
    return { kind: "trial_d3", variant: account.hasCompletedScan ? "with_scan" : "no_scan" };
  }

  if (
    !sent.kinds.has("trial_d1") &&
    !account.hasCompletedScan &&
    age >= D1_WINDOW_HOURS.from &&
    age < D1_WINDOW_HOURS.to
  ) {
    return { kind: "trial_d1", variant: account.hasProject ? "no_scan" : "no_domain" };
  }

  return null;
}

/** Whole days of Pro left, as the emails say it ("Te quedan 4 días de Pro"). */
export function trialDaysLeft(trialEndsAt: Date, now: Date): number {
  return Math.max(0, Math.ceil(hoursBetween(now, trialEndsAt) / 24));
}

/**
 * CONFIRM-REMINDER-1 (log §234). One reminder to confirm the email address,
 * to an account that signed up with a password and never clicked the link —
 * the signup that never reaches the product, so every other email in this
 * sequence (which starts after confirmation) misses it.
 *
 * Stateless on purpose: the window is exactly 24 h wide (20 h to 44 h after
 * sign-up), so the daily cron lands in it once and only once — no new
 * `email_sends` kind and no migration for a single email. The cost of that
 * choice, stated: a cron fired twice inside the same day would remind twice.
 * Google sign-ups are confirmed by Google and never match.
 */
export const CONFIRM_REMINDER_WINDOW_HOURS = { from: 20, to: 44 } as const;

export function shouldRemindConfirmation(
  account: { createdAt: Date; emailConfirmedAt: Date | null; isExcluded: boolean },
  now: Date
): boolean {
  if (account.emailConfirmedAt || account.isExcluded) return false;
  const age = hoursBetween(account.createdAt, now);
  return age >= CONFIRM_REMINDER_WINDOW_HOURS.from && age < CONFIRM_REMINDER_WINDOW_HOURS.to;
}

/* ------------------------------------------------- fin de prueba y recuperación */

/**
 * LIFECYCLE-WINBACK-1 (Fase D, log §236). What happens after the trial ends,
 * as the founder approved it on 2026-09-28
 * (`docs/design-reference/lifecycle-emails-1/`, "Después de la prueba"):
 *
 * - Fin de prueba (`trial_ended`): sent by the server the day the trial ends,
 *   instead of only when the customer happens to open the console again
 *   (`applyTrialExpiry`, lazy). Whoever never comes back used to get nothing.
 * - Fin de prueba «tardía» (`trial_ended_late`): the same email, once, for a
 *   trial that ended more than 48 h ago and was never told. It says so.
 * - D+3 (`winback_d3`): the competitor gap of the last scan, 3 days after
 *   either of the two above.
 * - D+10 (`winback_d10`): the launch price's deadline, 7 days after D+3.
 *   Only while the promo can really be redeemed: the no-promo variant of the
 *   approved design (a personal "¿qué te faltó?" signed by the founder) is
 *   deliberately not built — the founder asked on 2026-10-09 to avoid
 *   personal contact, and with no promo there is nothing else to say.
 */
export const TRIAL_END_KINDS = ["trial_ended", "trial_ended_late"] as const;
export type TrialEndKind = (typeof TRIAL_END_KINDS)[number];
export const WINBACK_KINDS = ["winback_d3", "winback_d10"] as const;
export type WinbackKind = (typeof WINBACK_KINDS)[number];

/** Every kind that counts towards "one lifecycle email every 48 h". */
export const LIFECYCLE_SPACED_KINDS: readonly string[] = [...TRIAL_KINDS, ...TRIAL_END_KINDS, ...WINBACK_KINDS];

/** A trial that ended longer ago than this, unannounced, gets the «tardía» version. */
export const TRIAL_END_LATE_AFTER_HOURS = 48;
/** D+3 opens 72 h after the end email and closes when D+10 would open. */
export const WINBACK_D3_WINDOW_HOURS = { from: 72, to: 240 } as const;
/** D+10 is measured from D+3 (7 days), or from the end email when D+3 never went out. */
export const WINBACK_D10_AFTER_D3_HOURS = 168;
export const WINBACK_D10_AFTER_END_HOURS = 240;
/** Past this, a lapsed customer is not written to again: the sequence is over. */
export const WINBACK_MAX_AGE_HOURS = 30 * 24;

export type TrialEndAccountState = {
  trialEndsAt: Date | null;
  hasSubscription: boolean;
  isExcluded: boolean;
};

/**
 * Which end-of-trial email, if any. Pure: the caller has already loaded what
 * was sent. Opting out of "consejos y ofertas" does NOT stop this decision —
 * the end of a trial is account news; the caller sends the plain service
 * version without an offer instead (category rule, log §232).
 */
export function decideTrialEndEmail(
  account: TrialEndAccountState,
  sentKinds: ReadonlySet<string>,
  now: Date
): { kind: TrialEndKind } | null {
  if (account.isExcluded || account.hasSubscription || !account.trialEndsAt) return null;
  if (account.trialEndsAt.getTime() > now.getTime()) return null;
  if (TRIAL_END_KINDS.some((kind) => sentKinds.has(kind))) return null;
  const hoursSinceEnd = hoursBetween(account.trialEndsAt, now);
  return { kind: hoursSinceEnd > TRIAL_END_LATE_AFTER_HOURS ? "trial_ended_late" : "trial_ended" };
}

export type WinbackAccountState = {
  hasSubscription: boolean;
  isExcluded: boolean;
  lifecycleOptIn: boolean;
  /** When the end-of-trial email (either version) was sent. `null`: none yet. */
  endEmailSentAt: Date | null;
};

export type WinbackSentState = {
  kinds: ReadonlySet<string>;
  /** `sent_at` of D+3, when it went out. */
  d3SentAt: Date | null;
  lastLifecycleSentAt: Date | null;
};

export function decideWinbackEmail(
  account: WinbackAccountState,
  sent: WinbackSentState,
  promoActive: boolean,
  now: Date
): { kind: WinbackKind } | null {
  if (account.isExcluded || account.hasSubscription || !account.lifecycleOptIn || !account.endEmailSentAt) return null;

  const sinceEnd = hoursBetween(account.endEmailSentAt, now);
  if (sinceEnd > WINBACK_MAX_AGE_HOURS) return null;

  const recentlyEmailed =
    sent.lastLifecycleSentAt !== null &&
    hoursBetween(sent.lastLifecycleSentAt, now) < MIN_HOURS_BETWEEN_LIFECYCLE_EMAILS;
  if (recentlyEmailed || isMonday(now)) return null;

  if (!sent.kinds.has("winback_d10") && promoActive) {
    const d10Due = sent.d3SentAt
      ? hoursBetween(sent.d3SentAt, now) >= WINBACK_D10_AFTER_D3_HOURS
      : sinceEnd >= WINBACK_D10_AFTER_END_HOURS;
    if (d10Due) return { kind: "winback_d10" };
  }

  if (!sent.kinds.has("winback_d3") && sinceEnd >= WINBACK_D3_WINDOW_HOURS.from && sinceEnd < WINBACK_D3_WINDOW_HOURS.to) {
    return { kind: "winback_d3" };
  }

  return null;
}
