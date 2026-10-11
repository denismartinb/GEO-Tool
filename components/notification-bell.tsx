"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { relativeTime, renderNotification, toneClassName, type NotificationRow } from "@/lib/notifications/render";
import { useSeenNotifications } from "@/lib/notifications/use-seen-notifications";
import { laneForType, type NotificationLane } from "@/lib/notifications/lanes";
import { renderAccountNotice, type AccountNotice } from "@/lib/notifications/account-notice";
import { renderNextStep, type NextStepNotice } from "@/lib/notifications/next-step";
import type { WorkspaceNotification, WorkspaceProjectSummary } from "@/lib/project-workspace";

const LANE_LABEL: Record<NotificationLane, string> = {
  account: "Tu cuenta",
  next_step: "Tu siguiente paso",
  alert: "Algo ha cambiado"
};

export function NotificationBell({
  notifications,
  accountNotice,
  nextStep,
  projects
}: {
  /** Already reduced by `selectLaneNotifications`: one alert at most. */
  notifications: WorkspaceNotification[];
  accountNotice: AccountNotice | null;
  /** First action of the active project's Recomendaciones plan. */
  nextStep: NextStepNotice | null;
  projects: WorkspaceProjectSummary[];
}) {
  const [open, setOpen] = useState(false);
  const [openedOnce, setOpenedOnce] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Opening the panel is what marks these read (NOTIF-AUTOREAD-1) — there is
  // no button to press, and the dot stops lying about work the user already did.
  const { isVisuallyUnread, pendingUnreadCount } = useSeenNotifications(notifications, open);

  const domainByProjectId = projects.reduce<Record<string, string>>((acc, p) => {
    acc[p.id] = p.domain;
    return acc;
  }, {});

  // NOTIF-LANES-1 (log §297): the account notice is not a stored row, so it
  // has no read state. It lights the dot only on the last trial day, until the
  // panel is opened in this session.
  const renderedAccount = accountNotice ? renderAccountNotice(accountNotice) : null;
  const accountWantsDot = Boolean(renderedAccount?.urgent) && !openedOnce;
  const hasPendingUnread = pendingUnreadCount > 0 || accountWantsDot;
  // The next step has no read state and never lights the dot: it is always
  // there while the plan has actions, so a dot for it would never go out.
  const renderedNextStep = nextStep ? renderNextStep(nextStep) : null;
  const isEmpty = notifications.length === 0 && !renderedAccount && !renderedNextStep;

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
        onClick={() => {
          setOpen((v) => !v);
          setOpenedOnce(true);
        }}
      >
        <Icon name="bell" size={16} />
        {hasPendingUnread && <span className="notif-dot" aria-hidden="true" />}
      </button>
      {open && (
        <div className="notif-panel">
          <div className="notif-panel-head">
            <span className="notif-panel-title">Notificaciones</span>
          </div>
          {isEmpty ? (
            <div className="notif-empty">Estás al día. Te avisaremos cuando haya algo que hacer.</div>
          ) : (
            <div className="notif-list">
              {renderedAccount && (
                <Link href={renderedAccount.href ?? "#"} className="notif-item notif-item-link" onClick={() => setOpen(false)}>
                  <span className={`notif-item-icon ${toneClassName(renderedAccount.tone)}`}>
                    <Icon name={renderedAccount.icon} size={14} />
                  </span>
                  <div className="notif-item-body">
                    <div className="notif-item-lane">{LANE_LABEL.account}</div>
                    <div className="notif-item-title">{renderedAccount.title}</div>
                    <p className="notif-item-desc">{renderedAccount.body}</p>
                    <span className={`notif-item-cta${renderedAccount.urgent ? " is-urgent" : ""}`}>{renderedAccount.cta}</span>
                  </div>
                </Link>
              )}
              {renderedNextStep && (
                <Link href={renderedNextStep.href ?? "#"} className="notif-item notif-item-link" onClick={() => setOpen(false)}>
                  <span className={`notif-item-icon ${toneClassName(renderedNextStep.tone)}`}>
                    <Icon name={renderedNextStep.icon} size={14} />
                  </span>
                  <div className="notif-item-body">
                    <div className="notif-item-lane">{LANE_LABEL.next_step}</div>
                    <div className="notif-item-title">{renderedNextStep.title}</div>
                    {renderedNextStep.targetLabel && <div className="notif-item-target">{renderedNextStep.targetLabel}</div>}
                    <p className="notif-item-desc">{renderedNextStep.body}</p>
                  </div>
                </Link>
              )}
              {notifications.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  domainByProjectId={domainByProjectId}
                  unread={isVisuallyUnread(n)}
                  onNavigate={() => setOpen(false)}
                />
              ))}
            </div>
          )}
          <div className="notif-panel-foot">
            <Link href="/dashboard/notifications" onClick={() => setOpen(false)}>
              Ver historial
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

  const lane = laneForType(notification.type);

  const content = (
    <>
      <span className={`notif-item-icon ${toneClassName(rendered.tone)}`}>
        <Icon name={rendered.icon} size={14} />
      </span>
      <div className="notif-item-body">
        {lane && <div className="notif-item-lane">{LANE_LABEL[lane]}</div>}
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
