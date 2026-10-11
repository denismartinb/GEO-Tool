/**
 * NOTIF-LANES-1 (log §297): the bell shows at most one notification per lane,
 * three lanes, so never more than three at once (founder, 2026-10-11: «si son
 * demasiadas ya no se leen; como mucho se acumulan unas 3»).
 *
 * - `account`   — trial days left / read-only account. Never a stored row: it is
 *                 computed on every load from the trial date
 *                 (`account-notice.ts`), so it can never show a stale count.
 * - `next_step` — the one thing worth doing next.
 * - `alert`     — only what asks the user to act.
 *
 * Every other stored type (scan completed, scan failed, gap resolved, minor
 * audit regressions) is still written by its emitter — that history is cheap
 * and Fase 2 reads it — but it never reaches the bell or the notifications
 * page. Pure on purpose: no Supabase, no clock.
 */
import type { NotificationType } from "@/lib/notifications/types";

export type NotificationLane = "account" | "next_step" | "alert";

/**
 * Inside the alert lane the most serious one wins, not the newest: a website
 * blocking an AI crawler outranks everything until it is fixed. Index =
 * priority (0 is highest).
 */
const ALERT_PRIORITY: readonly NotificationType[] = [
  "ai_bot_blocked",
  "page_unreachable",
  "emerging_competitor",
  "surfacing_dropped"
];

const NEXT_STEP_TYPES: readonly NotificationType[] = ["gap_pending"];

/** Types the bell and the notifications page read. Used as the query filter. */
export const LANE_NOTIFICATION_TYPES: readonly NotificationType[] = [...NEXT_STEP_TYPES, ...ALERT_PRIORITY];

/**
 * A lane notice older than this no longer describes the present: two weeks
 * covers a paid Pro's cadence several times over, and an alert that nothing
 * re-raised in that time is not the thing to act on today.
 */
export const LANE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export function laneForType(type: string): NotificationLane | null {
  if ((NEXT_STEP_TYPES as readonly string[]).includes(type)) return "next_step";
  if ((ALERT_PRIORITY as readonly string[]).includes(type)) return "alert";
  return null;
}

type LaneCandidate = { type: string; createdAt: string };

function newestFirst<T extends LaneCandidate>(a: T, b: T): number {
  return Date.parse(b.createdAt) - Date.parse(a.createdAt);
}

/**
 * Picks at most one stored notification per lane, in display order
 * (next step, then alert — the account notice goes above both and is added by
 * the caller). Rows with an unknown type or older than `LANE_MAX_AGE_MS` are
 * dropped.
 */
export function selectLaneNotifications<T extends LaneCandidate>(rows: readonly T[], now: number): T[] {
  const fresh = rows.filter((row) => {
    const created = Date.parse(row.createdAt);
    return laneForType(row.type) !== null && Number.isFinite(created) && now - created <= LANE_MAX_AGE_MS;
  });

  const nextStep = fresh.filter((row) => laneForType(row.type) === "next_step").sort(newestFirst)[0];
  const alert = fresh
    .filter((row) => laneForType(row.type) === "alert")
    .sort(
      (a, b) =>
        ALERT_PRIORITY.indexOf(a.type as NotificationType) - ALERT_PRIORITY.indexOf(b.type as NotificationType) ||
        newestFirst(a, b)
    )[0];

  return [nextStep, alert].filter((row): row is T => Boolean(row));
}
