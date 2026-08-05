"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { relativeTime, groupByDay, renderNotification, toneClassName, type NotificationRow } from "@/lib/notifications/render";
import { useSeenNotifications } from "@/lib/notifications/use-seen-notifications";
import type { WorkspaceNotification } from "@/lib/project-workspace";

type Tab = "all" | "unread";

export function NotificationsPageClient({
  notifications,
  domainByProjectId
}: {
  notifications: WorkspaceNotification[];
  domainByProjectId: Record<string, string>;
}) {
  const [tab, setTab] = useState<Tab>("all");

  // Landing on this page is seeing them (NOTIF-AUTOREAD-1): they are marked
  // read on render, and keep their dot for the rest of the session.
  const { isVisuallyUnread } = useSeenNotifications(notifications, true);

  const unreadCount = notifications.filter(isVisuallyUnread).length;
  const visible = tab === "unread" ? notifications.filter(isVisuallyUnread) : notifications;
  const groups = groupByDay(visible);

  return (
    <div className="notif-page-card">
      <div className="notif-page-head">
        <h1>Notificaciones</h1>
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
          No leídas{unreadCount > 0 && <span className="notif-tab-count">{unreadCount}</span>}
        </button>
      </div>
      {visible.length === 0 ? (
        <div className="notif-page-empty">
          {tab === "unread" ? "No tienes notificaciones sin leer." : "Sin notificaciones todavía."}
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.label}>
            <div className="notif-day-label">{group.label}</div>
            {group.items.map((n) => (
              <NotificationRowItem
                key={n.id}
                notification={n}
                domainByProjectId={domainByProjectId}
                unread={isVisuallyUnread(n)}
              />
            ))}
          </div>
        ))
      )}
    </div>
  );
}

function NotificationRowItem({
  notification,
  domainByProjectId,
  unread
}: {
  notification: WorkspaceNotification;
  domainByProjectId: Record<string, string>;
  unread: boolean;
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
      <span className={`notif-row-icon ${toneClassName(rendered.tone)}`}>
        <Icon name={rendered.icon} size={16} />
      </span>
      <div className="notif-row-body">
        <div className="notif-row-title">
          {unread && <span className="notif-row-unread-dot" aria-hidden="true" />}
          {rendered.title}
          <span className="notif-row-time">{relativeTime(notification.createdAt)}</span>
        </div>
        {rendered.targetLabel && <div className="notif-row-target">{rendered.targetLabel}</div>}
        <p className="notif-row-desc">{rendered.body}</p>
      </div>
    </>
  );

  if (rendered.href) {
    return (
      <Link href={rendered.href} className="notif-row">
        {content}
      </Link>
    );
  }

  return <div className="notif-row">{content}</div>;
}
