"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Ic } from "@/components/ins/ic";
import { useLayer } from "@/components/ins/layer";
import { relativeTime, renderNotification, type NotificationRow, type RenderedNotification } from "@/lib/notifications/render";
import { useSeenNotifications } from "@/lib/notifications/use-seen-notifications";
import { renderAccountNotice, type AccountNotice } from "@/lib/notifications/account-notice";
import { renderNextStep, type NextStepNotice } from "@/lib/notifications/next-step";
import type { WorkspaceNotification } from "@/lib/project-workspace";

/*
 * CONSOLE-INSTRUMENTO-1 F1: campana de la consola. La lógica de carriles
 * (NOTIF-LANES-1, log §297) no cambia: como mucho un aviso de cada tipo y la
 * lectura automática al abrir. Sólo cambia cómo se pinta (`xoBellHtml`).
 */

type Lane = {
  key: string;
  lane: string;
  icon: string;
  tone: "warm" | "blue" | "";
  title: string;
  body: string;
  time?: string;
  href: string | null;
  cta: string;
  target?: string;
};

const ALERT_ICON: Record<string, string> = {
  ai_bot_blocked: "shield",
  page_unreachable: "warn",
  emerging_competitor: "users",
  surfacing_dropped: "arrowdown"
};

type BellValue = { count: number; unread: boolean; open: (anchor: HTMLElement) => void };
const BellCtx = createContext<BellValue | null>(null);

export function BellProvider({
  notifications,
  accountNotice,
  nextStep,
  projects,
  children
}: {
  notifications: WorkspaceNotification[];
  accountNotice: AccountNotice | null;
  nextStep: NextStepNotice | null;
  projects: Array<{ id: string; domain: string }>;
  children: ReactNode;
}) {
  const layer = useLayer();
  const [openedOnce, setOpenedOnce] = useState(false);
  const [popOpen, setPopOpen] = useState(false);
  const { pendingUnreadCount } = useSeenNotifications(notifications, popOpen);

  const domainByProjectId = projects.reduce<Record<string, string>>((acc, p) => {
    acc[p.id] = p.domain;
    return acc;
  }, {});

  const renderedAccount = accountNotice ? renderAccountNotice(accountNotice) : null;
  const renderedNextStep = nextStep ? renderNextStep(nextStep) : null;

  const lanes: Lane[] = [];
  if (renderedAccount) {
    lanes.push({
      key: "account",
      lane: "Tu cuenta",
      icon: accountNotice?.kind === "read_only" ? "c-lock" : "c-clock",
      tone: "warm",
      title: renderedAccount.title,
      body: renderedAccount.body,
      href: renderedAccount.href ?? null,
      cta: renderedAccount.cta
    });
  }
  if (renderedNextStep) {
    lanes.push({
      key: "next",
      lane: "Tu siguiente paso",
      icon: "c-target",
      tone: "blue",
      title: renderedNextStep.title,
      body: renderedNextStep.body,
      href: renderedNextStep.href ?? null,
      cta: "Ver la acción",
      target: renderedNextStep.targetLabel ?? undefined
    });
  }
  for (const n of notifications) {
    const r: RenderedNotification = renderNotification(
      {
        type: n.type,
        severity: n.severity as NotificationRow["severity"],
        payload_json: n.payloadJson,
        project_id: n.projectId
      },
      domainByProjectId
    );
    lanes.push({
      key: n.id,
      lane: "Algo ha cambiado",
      icon: ALERT_ICON[n.type] ?? "c-dot",
      tone: r.tone === "neg" || r.tone === "warm" ? "warm" : "",
      title: r.title,
      body: r.body,
      time: relativeTime(n.createdAt),
      href: r.href ?? null,
      cta: "Ver el detalle",
      target: r.targetLabel ?? undefined
    });
  }

  const accountWantsDot = Boolean(renderedAccount?.urgent) && !openedOnce;
  const unread = pendingUnreadCount > 0 || accountWantsDot;

  const open = useCallback(
    (anchor: HTMLElement) => {
      setOpenedOnce(true);
      setPopOpen(true);
      layer.pop(anchor, <BellPanel lanes={lanes} />, { w: 380, label: "Notificaciones", onClose: () => setPopOpen(false) });
    },
    [layer, notifications, accountNotice, nextStep]
  );

  return <BellCtx.Provider value={{ count: lanes.length, unread, open }}>{children}</BellCtx.Provider>;
}

function BellPanel({ lanes }: { lanes: Lane[] }) {
  const { close } = useLayer();
  return (
    <>
      <div className="xo-h">
        <b>Notificaciones</b>
      </div>
      {lanes.length === 0 ? (
        <div className="xo-empty">
          <Ic n="checkc" />
          <b>Estás al día.</b>
          <span>Te avisaremos cuando haya algo que hacer.</span>
        </div>
      ) : (
        <ol className="xo-lanes">
          {lanes.map((n) => (
            <li key={n.key} className={`xo-ln ${n.tone}`}>
              <div className="k">
                <span className="d" />
                {n.lane}
                {n.time ? <span className="tm">{n.time}</span> : null}
              </div>
              <b>{n.title}</b>
              {n.target ? <span className="mono" style={{ display: "block", fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>{n.target}</span> : null}
              <p>{n.body}</p>
              {n.href ? (
                n.key === "account" ? (
                  <Link href={n.href} className="btn sm line" onClick={close}>
                    {n.cta}
                  </Link>
                ) : (
                  <Link href={n.href} className="xo-go" onClick={close}>
                    {n.cta}
                    <Ic n="arrowr" sm />
                  </Link>
                )
              ) : null}
            </li>
          ))}
        </ol>
      )}
      <div className="xo-f">
        <span>Como mucho un aviso de cada tipo.</span>
        <Link href="/dashboard/settings/notifications" className="xo-lk" onClick={close}>
          Correos
          <Ic n="chevr" sm />
        </Link>
      </div>
    </>
  );
}

function useBell(): BellValue {
  const ctx = useContext(BellCtx);
  if (!ctx) throw new Error("BellButton fuera de BellProvider");
  return ctx;
}

/** Botón de la campana: `.ibox` en escritorio, `.bell` en la cabecera móvil. */
export function BellButton({ variant }: { variant: "desktop" | "mobile" }) {
  const { count, unread, open } = useBell();
  const label = unread ? `Notificaciones, ${count} sin leer` : "Notificaciones";
  if (variant === "desktop") {
    return (
      <button type="button" className="ibox" aria-label={label} aria-haspopup="dialog" onClick={(e) => open(e.currentTarget)}>
        <Ic n="bell" sm />
        {count > 0 ? <span className={`c${unread ? "" : " xo-seen"}`}>{count}</span> : null}
      </button>
    );
  }
  return (
    <button type="button" className="bell" aria-label={label} aria-haspopup="dialog" onClick={(e) => open(e.currentTarget)}>
      {count > 0 ? <span className={`num${unread ? "" : " xo-seen"}`}>{count}</span> : <Ic n="bell" sm />}
    </button>
  );
}
