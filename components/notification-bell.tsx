"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { RecentCompletedRun, RecentPromptsAdded } from "@/lib/project-workspace";

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

type NotificationItem =
  | { kind: "scan_completed"; id: string; at: string; domain: string; promptsProcessed: number }
  | { kind: "prompts_added"; id: string; at: string; domain: string; count: number };

function buildItems(
  recentCompletedRuns: RecentCompletedRun[],
  recentPromptsAdded: RecentPromptsAdded[]
): NotificationItem[] {
  const scanItems: NotificationItem[] = recentCompletedRuns.map((run) => ({
    kind: "scan_completed",
    id: run.runId,
    at: run.finishedAt,
    domain: run.domain,
    promptsProcessed: run.promptsProcessed
  }));

  const promptItems: NotificationItem[] = recentPromptsAdded.map((batch) => ({
    kind: "prompts_added",
    id: `${batch.projectId}-${batch.addedAt}`,
    at: batch.addedAt,
    domain: batch.domain,
    count: batch.count
  }));

  return [...scanItems, ...promptItems].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 5);
}

export function NotificationBell({
  recentCompletedRuns,
  recentPromptsAdded
}: {
  recentCompletedRuns: RecentCompletedRun[];
  recentPromptsAdded: RecentPromptsAdded[];
}) {
  const [open, setOpen] = useState(false);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const items = buildItems(recentCompletedRuns, recentPromptsAdded);

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

  const isUnread = (item: NotificationItem) => !lastSeenAt || item.at > lastSeenAt;
  const hasUnread = items.some(isUnread);

  function markAllRead() {
    const newest = items[0]?.at ?? new Date().toISOString();
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
          {items.length === 0 ? (
            <div className="notif-empty">Sin notificaciones todavía.</div>
          ) : (
            <div className="notif-list">
              {items.map((item) => (
                <div className="notif-item" key={item.id}>
                  <span className="notif-item-icon">
                    <Icon name={item.kind === "scan_completed" ? "check" : "plus"} size={13} />
                  </span>
                  <div className="notif-item-body">
                    <div className="notif-item-title">
                      {isUnread(item) && <span className="notif-unread-dot" aria-hidden="true" />}
                      {item.kind === "scan_completed" ? "Escaneo completado" : "Prompts añadidos"}
                      <span className="notif-item-time">{relativeTime(item.at)}</span>
                    </div>
                    <p className="notif-item-desc">
                      {item.kind === "scan_completed"
                        ? `El escaneo de ${item.domain} ha terminado · ${item.promptsProcessed} prompts procesados.`
                        : `Se ${item.count === 1 ? "ha añadido 1 prompt nuevo" : `han añadido ${item.count} prompts nuevos`} en ${item.domain}.`}
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
