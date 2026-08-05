"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { relativeTime, groupByDay, renderNotification, toneClassName, type NotificationRow } from "@/lib/notifications/render";
import { useSeenNotifications } from "@/lib/notifications/use-seen-notifications";
import { NOTIFICATIONS_BELL_LIMIT } from "@/lib/notifications/types";
import type { WorkspaceNotification, WorkspaceProjectSummary } from "@/lib/project-workspace";

type Tab = "all" | "unread";

export function NotificationBell({
  notifications,
  projects
}: {
  notifications: WorkspaceNotification[];
  projects: WorkspaceProjectSummary[];
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Opening the panel is what marks these read (NOTIF-AUTOREAD-1) — there is
  // no button to press, and the dot stops lying about work the user already did.
  const { isVisuallyUnread, pendingUnreadCount } = useSeenNotifications(notifications, open);

  const domainByProjectId = projects.reduce<Record<string, string>>((acc, p) => {
    acc[p.id] = p.domain;
    return acc;
  }, {});

  const hasPendingUnread = pendingUnreadCount > 0;
  // Rows keep their dot for the rest of the session even after the write lands,
  // so the tab and its counter describe the list the user is looking at, not
  // the badge that already went out.
  const sessionUnreadCount = notifications.filter(isVisuallyUnread).length;
  // NOTIFICATIONS_BELL_LIMIT rows load at most, so an unread count that hits
  // that limit can't be distinguished from "more than that" — shown as "15+"
  // rather than a number that would silently understate the truth.
  const unreadBadge =
    sessionUnreadCount >= NOTIFICATIONS_BELL_LIMIT ? `${NOTIFICATIONS_BELL_LIMIT}+` : String(sessionUnreadCount);

  const visible = tab === "unread" ? notifications.filter(isVisuallyUnread) : notifications;
  const groups = groupByDay(visible);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div className="notif-bell-wrap" ref={panelRef}>
      <button
        type="button"
        className="header-bell"
        aria-label="Notificaciones"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="bell" size={16} />
        {hasPendingUnread && <span className="notif-dot" aria-hidden="true" />}
      </button>
      {open && (
        <div className="notif-panel">
          <div className="notif-panel-head">
            <span className="notif-panel-title">Notificaciones</span>
          </div>
          <div className="notif-tabs">
            <button
              type="button"
              className={`notif-tab${tab === "all" ? " active" : ""}`}
              onClick={() => setTab("all")}
            >
              Todas
            </button>
            <button
              type="button"
              className={`notif-tab${tab === "unread" ? " active" : ""}`}
              onClick={() => setTab("unread")}
            >
              No leídas{sessionUnreadCount > 0 && <span className="notif-tab-count">{unreadBadge}</span>}
            </button>
          </div>
          {visible.length === 0 ? (
            <div className="notif-empty">
              {tab === "unread" ? "No tienes notificaciones sin leer." : "Sin notificaciones todavía."}
            </div>
          ) : (
            <div className="notif-list">
              {groups.map((group) => (
                <div key={group.label}>
                  <div className="notif-day-label">{group.label}</div>
                  {group.items.map((n) => (
                    <NotificationItem
                      key={n.id}
                      notification={n}
                      domainByProjectId={domainByProjectId}
                      unread={isVisuallyUnread(n)}
                      onNavigate={() => setOpen(false)}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
          <div className="notif-panel-foot">
            <Link href="/dashboard/notifications" onClick={() => setOpen(false)}>
              Ver todas las notificaciones
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationItem({
  notification,
  domainByProjectId,
  unread,
  onNavigate
}: {
  notification: WorkspaceNotification;
  domainByProjectId: Record<string, string>;
  unread: boolean;
  onNavigate: () => void;
}) {
  const rendered = renderNotification(
    {
      type: notification.type,
      severity: notification.severity as NotificationRow["severity"],
      payload_json: notification.payloadJson,
      project_id: notification.projectId
    },
    domainByProjectId
  );

  const content = (
    <>
      <span className={`notif-item-icon ${toneClassName(rendered.tone)}`}>
        <Icon name={rendered.icon} size={14} />
      </span>
      <div className="notif-item-body">
        <div className="notif-item-title">
          {unread && <span className="notif-unread-dot" aria-hidden="true" />}
          {rendered.title}
          <span className="notif-item-time">{relativeTime(notification.createdAt)}</span>
        </div>
        {rendered.targetLabel && <div className="notif-item-target">{rendered.targetLabel}</div>}
        <p className="notif-item-desc">{rendered.body}</p>
      </div>
    </>
  );

  if (rendered.href) {
    return (
      <Link href={rendered.href} className="notif-item notif-item-link" onClick={onNavigate}>
        {content}
      </Link>
    );
  }

  return <div className="notif-item">{content}</div>;
}
