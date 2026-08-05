/**
 * Pure decision logic behind "seen means read" (NOTIF-AUTOREAD-1). Kept out of
 * the React hook (`use-seen-notifications.ts`) so it can be tested in the node
 * environment the suite runs in — the hook is the wiring, this is the rule.
 */
export type SeenNotification = { id: string; readAt: string | null };

/**
 * The ids this surface should send on being seen: the ones the server still
 * has as unread, minus the ones already sent in this session.
 *
 * Only ids that were passed in — i.e. rendered — are ever returned. The bell
 * holds at most NOTIFICATIONS_BELL_LIMIT rows, so "mark everything unread"
 * would clear notifications that never reached a screen.
 */
export function unsentUnreadIds(
  notifications: readonly SeenNotification[],
  dispatched: ReadonlySet<string>
): string[] {
  return notifications.filter((n) => !n.readAt && !dispatched.has(n.id)).map((n) => n.id);
}

/**
 * Is this notification still waiting to be seen? Drives the bell dot, which
 * must go dark the moment the panel opens — before the server round-trip
 * lands, hence `dispatched` rather than `readAt` alone.
 */
export function isPendingUnread(n: SeenNotification, dispatched: ReadonlySet<string>): boolean {
  return !n.readAt && !dispatched.has(n.id);
}

/**
 * Should this row still show its unread dot? Yes for the rest of the session,
 * even once `readAt` comes back set: marking read on open must not blank the
 * list out while the user is reading it.
 */
export function isVisuallyUnread(n: SeenNotification, seenUnread: ReadonlySet<string>): boolean {
  return !n.readAt || seenUnread.has(n.id);
}
