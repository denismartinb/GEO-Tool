"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { relativeTime, groupByDay, renderNotification, toneClassName, type NotificationRow } from "@/lib/notifications/render";
import { markAllNotificationsRead } from "@/app/dashboard/notifications/actions";
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
  const [locallyRead, setLocallyRead] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement | null>(null);

  const domainByProjectId = projects.reduce<Record<string, string>>((acc, p) => {
    acc[p.id] = p.domain;
    return acc;
  }, {});

  function isUnread(n: WorkspaceNotification): boolean {
    return !n.readAt && !locallyRead.has(n.id);
  }

  const unreadCount = notifications.filter(isUnread).length;
  const hasUnread = unreadCount > 0;
  // NOTIFICATIONS_BELL_LIMIT rows load at most, so an unread count that hits
  // that limit can't be distinguished from "more than that" — shown as "15+"
  // rather than a number that would silently understate the truth.
  const unreadBadge = unreadCount >= NOTIFICATIONS_BELL_LIMIT ? `${NOTIFICATIONS_BELL_LIMIT}+` : String(unreadCount);

  const visible = tab === "unread" ? notifications.filter(isUnread) : notifications;
  const groups = groupByDay(visible);

  function markAllRead() {
    // Optimistic: hide the badge immediately: markAllNotificationsRead's
    // revalidatePath refreshes the real `readAt` values shortly after, this
    // just avoids a visible delay on a mobile connection.
    setLocallyRead(new Set(notifications.map((n) => n.id)));
    startTransition(async () => {
      await markAllNotificationsRead();
    });
  }

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
        {hasUnread && <span className="notif-dot" aria-hidden="true" />}
      </button>
      {open && (
        <div className="notif-panel">
          <div className="notif-panel-head">
            <span className="notif-panel-title">Notificaciones</span>
            {hasUnread && (
              <button type="button" className="notif-mark-read" onClick={markAllRead}>
                Marcar leídas
              </button>
            )}
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
              No leídas{hasUnread && <span className="notif-tab-count">{unreadBadge}</span>}
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
                      unread={isUnread(n)}
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
