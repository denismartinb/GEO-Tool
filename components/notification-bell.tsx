"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { RecentCompletedRun } from "@/lib/project-workspace";

const LAST_SEEN_KEY = "geo-studio:notifications:last_seen_at";

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.max(0, Math.round(diffMs / 60000));
  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `hace ${diffH} h`;
  const diffD = Math.round(diffH / 24);
  return `hace ${diffD} d`;
}

export function NotificationBell({ recentCompletedRuns }: { recentCompletedRuns: RecentCompletedRun[] }) {
  const [open, setOpen] = useState(false);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLastSeenAt(localStorage.getItem(LAST_SEEN_KEY));
  }, []);

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

  const isUnread = (run: RecentCompletedRun) => !lastSeenAt || run.finishedAt > lastSeenAt;
  const hasUnread = recentCompletedRuns.some(isUnread);

  function markAllRead() {
    const newest = recentCompletedRuns[0]?.finishedAt ?? new Date().toISOString();
    localStorage.setItem(LAST_SEEN_KEY, newest);
    setLastSeenAt(newest);
  }

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
            <span>Notificaciones</span>
            {hasUnread && (
              <button type="button" className="notif-mark-read" onClick={markAllRead}>
                Marcar todas como leídas
              </button>
            )}
          </div>
          {recentCompletedRuns.length === 0 ? (
            <div className="notif-empty">Sin notificaciones todavía.</div>
          ) : (
            <div className="notif-list">
              {recentCompletedRuns.map((run) => (
                <div className="notif-item" key={run.runId}>
                  <span className="notif-item-icon">
                    <Icon name="check" size={13} />
                  </span>
                  <div className="notif-item-body">
                    <div className="notif-item-title">
                      {isUnread(run) && <span className="notif-unread-dot" aria-hidden="true" />}
                      Escaneo completado
                      <span className="notif-item-time">{relativeTime(run.finishedAt)}</span>
                    </div>
                    <p className="notif-item-desc">
                      El escaneo de {run.domain} ha terminado · {run.promptsProcessed} prompts procesados.
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
