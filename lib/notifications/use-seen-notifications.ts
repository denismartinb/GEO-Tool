"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { markNotificationsRead } from "@/app/dashboard/notifications/actions";
import {
  isPendingUnread,
  isVisuallyUnread,
  unsentUnreadIds,
  type SeenNotification
} from "@/lib/notifications/seen";

/**
 * Marks notifications as read the moment the user actually sees them
 * (NOTIF-AUTOREAD-1) — the bell panel opening, or the notifications page
 * rendering. Shared by both surfaces so they cannot drift apart.
 *
 * Splits what used to be one question into two (see `lib/notifications/seen.ts`):
 * `isPendingUnread` drives the bell dot and goes dark on open; `isVisuallyUnread`
 * keeps each row's dot for the rest of the session so the list does not blank
 * out from under the person reading it.
 */
export function useSeenNotifications(
  notifications: readonly SeenNotification[],
  active: boolean
): {
  isPendingUnread: (n: SeenNotification) => boolean;
  isVisuallyUnread: (n: SeenNotification) => boolean;
  pendingUnreadCount: number;
} {
  // Ids already sent to the server. A ref, not state: it must not re-trigger
  // the effect that fills it.
  const dispatchedRef = useRef<Set<string>>(new Set());
  // Ids that were unread when this session first saw them — state, so the rows
  // re-render with their dot intact once the revalidation lands with `read_at`.
  const [seenUnread, setSeenUnread] = useState<Set<string>>(new Set());
  // Bumps only to force a re-render after `dispatchedRef` changes.
  const [, setDispatchedTick] = useState(0);

  // A stable dependency: the effect must react to new unread rows arriving,
  // not to the array identity the server sends on every revalidation.
  const unreadKey = notifications
    .filter((n) => !n.readAt)
    .map((n) => n.id)
    .join(",");

  useEffect(() => {
    if (!active) return;
    const unread = unreadKey ? unreadKey.split(",").map((id) => ({ id, readAt: null })) : [];
    const pending = unsentUnreadIds(unread, dispatchedRef.current);
    if (pending.length === 0) return;

    for (const id of pending) dispatchedRef.current.add(id);
    setDispatchedTick((v) => v + 1);
    setSeenUnread((prev) => {
      const next = new Set(prev);
      for (const id of pending) next.add(id);
      return next;
    });

    let cancelled = false;
    void markNotificationsRead(pending).then((result) => {
      if (cancelled || result.success) return;
      // The write failed: forget the claim so reopening retries it. The dots
      // stay — they describe what the user saw, not what the database stored.
      for (const id of pending) dispatchedRef.current.delete(id);
      setDispatchedTick((v) => v + 1);
    });

    return () => {
      cancelled = true;
    };
  }, [active, unreadKey]);

  const pending = useCallback((n: SeenNotification) => isPendingUnread(n, dispatchedRef.current), []);
  const visual = useCallback((n: SeenNotification) => isVisuallyUnread(n, seenUnread), [seenUnread]);

  const pendingUnreadCount = notifications.filter((n) => pending(n)).length;

  return { isPendingUnread: pending, isVisuallyUnread: visual, pendingUnreadCount };
}
