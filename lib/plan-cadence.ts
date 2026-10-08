/**
 * Recurring-scan cadence by plan — the single place it is decided.
 *
 * Pure and dependency-free on purpose (no `server-only`, no env): the cron
 * sweep, the watchdog, the data-maturity banner and the copy that quotes a
 * cadence all read it, and some of those run in client components. Before this
 * module the table lived inside `lib/scan/cron.ts` and three other files
 * restated it as `planId === "starter"` or as the word "diario", so the day
 * the cadence of a plan changed each copy had to be found by hand.
 *
 * CONTRACT-99 (log §237): `pro` is the single paid plan and scans WEEKLY. The
 * daily cadence survives only for `agency` (legacy, not sold) and for `free`,
 * whose interval is never reached in practice (a free project cannot enable
 * recurring scans, see `lib/scan/cron.ts`).
 */
export const RECURRING_INTERVAL_DAYS_BY_PLAN: Record<string, number> = {
  free: 1,
  starter: 7,
  pro: 7,
  agency: 1
};

/** Days between automatic scans for a plan. Unknown ids keep the historical daily default. */
export function recurringIntervalDays(planId: string): number {
  return RECURRING_INTERVAL_DAYS_BY_PLAN[planId] ?? 1;
}

/** True when the plan's automatic scans run once a week. */
export function isWeeklyCadence(planId: string): boolean {
  return recurringIntervalDays(planId) === 7;
}

/** "semanal" / "diario" — for copy that must say the truth about the plan it describes. */
export function cadenceAdjective(planId: string): "semanal" | "diario" {
  return isWeeklyCadence(planId) ? "semanal" : "diario";
}
