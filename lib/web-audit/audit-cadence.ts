/**
 * AUDIT-WEEKLY-1 (log §474). Every automatic audit runs at most once a week
 * per project: coverage (Gemini), technical health and the agentic review.
 *
 * Founder, 2026-11-22: «las auditorías deben ser una vez por semana». What
 * they measure changes when the customer changes the site, not with each
 * scan, and a daily scan used to re-audit everything every day.
 *
 * Seven days less a twelve-hour slack: the daily cron does not fire at the
 * exact same minute, so a strict 7 × 24 h would push the weekly audit to day
 * 8 every other week.
 *
 * Only the automatic path reads this. What the customer asks for by hand
 * («Elegir otra página») keeps its own daily limit.
 */
export const AUTOMATIC_AUDIT_INTERVAL_MS = 7 * 24 * 60 * 60_000 - 12 * 60 * 60_000;
