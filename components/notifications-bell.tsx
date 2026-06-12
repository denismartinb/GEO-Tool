"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import type { RecentCompletedRun } from "@/lib/project-workspace";

const SEEN_KEY = "lumira:notifications:seenAt";

export function NotificationsBell({ notifications }: { notifications: RecentCompletedRun[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSeenAt(localStorage.getItem(SEEN_KEY));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  function isUnread(n: RecentCompletedRun) {
    return !seenAt || new Date(n.finishedAt) > new Date(seenAt);
  }

  const hasUnread = hydrated && notifications.some(isUnread);

  function markAllRead() {
    const now = new Date().toISOString();
    localStorage.setItem(SEEN_KEY, now);
    setSeenAt(now);
  }

  function handleSelect(projectId: string) {
    setOpen(false);
    router.push(`/dashboard/projects/${projectId}`);
  }

  return (
    <div className="notif-bell-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`header-bell${hasUnread ? " has-unread" : ""}`}
        aria-label="Notificaciones"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <Icon name="bell" size={16} />
      </button>
      {open ? (
        <div className="notif-panel">
          <div className="notif-panel-head">
            <span>Notificaciones</span>
            {hasUnread ? (
              <button type="button" className="notif-mark-read" onClick={markAllRead}>
                Marcar todas como leídas
              </button>
            ) : null}
          </div>
          {notifications.length ? (
            <div className="notif-list">
              {notifications.map((n) => (
                <button
                  key={n.runId}
                  type="button"
                  className={`notif-item${isUnread(n) ? " unread" : ""}`}
                  onClick={() => handleSelect(n.projectId)}
                >
                  <span className="notif-item-icon ok">
                    <Icon name="check" size={12} />
                  </span>
                  <span className="notif-item-body">
                    <span className="notif-item-row">
                      {isUnread(n) ? <span className="notif-dot" /> : null}
                      <span className="notif-item-title">Escaneo completado</span>
                      <span className="notif-item-time">{formatRelative(n.finishedAt)}</span>
                    </span>
                    <span className="notif-item-desc">
                      El escaneo de <code>{n.projectDomain}</code> ha terminado · {n.totalPrompts} prompts
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="notif-empty">Sin notificaciones todavía.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function formatRelative(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const isSameDay = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isSameDay) {
    if (diffMin < 1) return "Hace un momento";
    if (diffMin < 60) return `Hace ${diffMin} min`;
    return `Hace ${diffHours} h`;
  }
  if (isYesterday) return "Ayer";
  const diffDays = Math.floor(diffMs / 86400000);
  return `Hace ${diffDays} días`;
}
