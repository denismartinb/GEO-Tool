"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BellButton, BellProvider } from "@/components/ins/bell";
import { CommandPaletteProvider, useCommandPalette } from "@/components/ins/command-palette";
import { Ic } from "@/components/ins/ic";
import { InsLayerProvider, useLayer } from "@/components/ins/layer";
import { AccountPanel, HelpPanel } from "@/components/ins/menus";
import { DomainSwitcherPanel } from "@/components/ins/domain-switcher";
import { ProjectFav } from "@/components/ins/project-fav";
import { avatarStyle, initialsOf, planLabel, ShellDataProvider, useShellData, type ShellDataInput } from "@/components/ins/shell-context";
import { InsSprite } from "@/components/ins/sprite";
import { TrialEndedDock, TrialEndedFirstEntry, TrialEndedPlanCard, TrialEndedStrip } from "@/components/ins/trial-ended";
import { ToastProvider } from "@/components/ins/toasts";
import { crumbForPath, INS_NAV, isNavActive, navHref, type InsNavItem } from "@/lib/ins/nav";
import type { AccountNotice } from "@/lib/notifications/account-notice";
import type { NextStepNotice } from "@/lib/notifications/next-step";
import type { WorkspaceNotification } from "@/lib/project-workspace";

/*
 * CONSOLE-INSTRUMENTO-1 F1: el marco de la consola «Instrumento» v51 (menú
 * lateral, cabecera de escritorio, cabecera móvil de 64 px, cajón y desenfoque
 * progresivo). Solo cambia el aspecto: los datos son los de siempre.
 */

export type InsShellProps = {
  data: ShellDataInput;
  notifications: WorkspaceNotification[];
  accountNotice: AccountNotice | null;
  nextStep: NextStepNotice | null;
  banner?: ReactNode;
  children: ReactNode;
};

export function InsShell({ data, notifications, accountNotice, nextStep, banner, children }: InsShellProps) {
  return (
    <ShellDataProvider value={data}>
      <InsLayerProvider>
        <ToastProvider>
          <CommandPaletteProvider>
            <BellProvider notifications={notifications} accountNotice={accountNotice} nextStep={nextStep} projects={data.projects}>
              <Frame banner={banner}>{children}</Frame>
            </BellProvider>
          </CommandPaletteProvider>
        </ToastProvider>
      </InsLayerProvider>
    </ShellDataProvider>
  );
}

/** `?bloque=` de la URL: dos entradas del menú comparten la ruta de la auditoría técnica. */
function useAuditBlock(): "geo" | "seo" {
  return useSearchParams().get("bloque") === "seo" ? "seo" : "geo";
}

function Frame({ banner, children }: { banner?: ReactNode; children: ReactNode }) {
  const d = useShellData();
  const pathname = usePathname();
  const block = useAuditBlock();
  const [drawer, setDrawer] = useState(false);
  const scRef = useRef<HTMLDivElement | null>(null);
  const [edgeTop, setEdgeTop] = useState(false);
  const [edgeBottom, setEdgeBottom] = useState(false);
  const hbRef = useRef<HTMLButtonElement | null>(null);

  const edges = useCallback(() => {
    const sc = scRef.current;
    if (!sc) return;
    setEdgeTop(sc.scrollTop > 4);
    setEdgeBottom(sc.scrollTop + sc.clientHeight < sc.scrollHeight - 4);
  }, []);

  useEffect(() => {
    setDrawer(false);
    scRef.current?.scrollTo({ top: 0 });
    const t = setTimeout(edges, 50);
    return () => clearTimeout(t);
  }, [pathname, edges]);

  useEffect(() => {
    const sc = scRef.current;
    if (!sc) return;
    sc.addEventListener("scroll", edges, { passive: true });
    window.addEventListener("resize", edges);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(edges) : null;
    ro?.observe(sc);
    if (sc.firstElementChild) ro?.observe(sc.firstElementChild);
    edges();
    return () => {
      sc.removeEventListener("scroll", edges);
      window.removeEventListener("resize", edges);
      ro?.disconnect();
    };
  }, [edges]);

  useEffect(() => {
    if (!drawer) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setDrawer(false);
        hbRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawer]);

  return (
    <div className="ins-shell">
      <InsSprite />
      <div className="app">
        <Sidebar open={drawer} onNavigate={() => setDrawer(false)} />
        <div className={`ins-scrim${drawer ? " on" : ""}`} onClick={() => setDrawer(false)} aria-hidden="true" />
        <main className="main">
          <header className="ins top">
            <div className="crumb">
              {d.project ? (
                <>
                  <span>{d.project.name}</span>
                  <span>/</span>
                </>
              ) : null}
              <b>{crumbForPath(pathname, block)}</b>
            </div>
            <span className="sp" />
            <PaletteButton />
            <BellButton variant="desktop" />
            <AccountAvatar />
          </header>
          <header className="ins mtop">
            <button type="button" className="hb" ref={hbRef} aria-label="Abrir menú" aria-expanded={drawer} onClick={() => setDrawer(true)}>
              <Ic n="menu" />
            </button>
            <ProjectButton mobile />
            <span className="sp" />
            <BellButton variant="mobile" />
            <AccountAvatar />
          </header>
          <TrialEndedStrip />
          <TrialEndedFirstEntry />
          <TrialEndedDock />
          <div className="scroller dash-content" id="sc" ref={scRef}>
            {banner}
            {children}
          </div>
          <div className={`pblur t${edgeTop ? " show" : ""}`} aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className={`pblur b${edgeBottom ? " show" : ""}`} aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
        </main>
      </div>
    </div>
  );
}


function PaletteButton() {
  const { open } = useCommandPalette();
  return (
    <button type="button" className="kbtn" onClick={open}>
      <Ic n="search" sm />
      Buscar o ir a…
      <kbd>⌘K</kbd>
    </button>
  );
}

function ProjectButton({ mobile }: { mobile?: boolean }) {
  const d = useShellData();
  const { pop } = useLayer();
  const p = d.project;
  const openIt = (el: HTMLElement) => pop(el, <DomainSwitcherPanel />, { w: 380, align: "start", label: "Cambiar de dominio" });
  if (!p) {
    return (
      <Link href="/dashboard/projects/new" className={mobile ? "pj" : "proj"}>
        Crear dominio
      </Link>
    );
  }
  if (mobile) {
    return (
      <button type="button" className="pj" aria-haspopup="dialog" aria-label={`${p.name}. Cambiar de dominio`} onClick={(e) => openIt(e.currentTarget)}>
        <ProjectFav domain={p.domain} name={p.name} size={22} />
        {p.name}
        <Ic n="chevd" sm />
      </button>
    );
  }
  return (
    <button type="button" className="proj" aria-haspopup="dialog" aria-label="Cambiar de dominio" onClick={(e) => openIt(e.currentTarget)}>
      <ProjectFav domain={p.domain} name={p.name} size={22} />
      <span className="t">
        <b>{p.name}</b>
        <span className="d">{p.domain}</span>
      </span>
      <Ic n="updown" sm />
    </button>
  );
}

function AccountAvatar() {
  const d = useShellData();
  const { pop } = useLayer();
  return (
    <span
      className={`av${d.avatarUrl ? " xo-avimg" : ""}`}
      role="button"
      tabIndex={0}
      aria-haspopup="dialog"
      aria-label="Tu cuenta"
      style={{ cursor: "pointer", ...avatarStyle(d.avatarUrl) }}
      onClick={(e) => pop(e.currentTarget, <AccountPanel helpAnchor={() => e.currentTarget} />, { w: 280, label: "Tu cuenta" })}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.currentTarget.click();
        }
      }}
    >
      {d.avatarUrl ? null : initialsOf(d.userEmail)}
    </span>
  );
}

function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const d = useShellData();
  const pathname = usePathname();
  const block = useAuditBlock();
  const { open: openPalette } = useCommandPalette();
  const { pop } = useLayer();
  const asideRef = useRef<HTMLElement | null>(null);
  const helpRef = useRef<HTMLButtonElement | null>(null);
  const footRef = useRef<HTMLDivElement | null>(null);
  const p = d.project;

  useEffect(() => {
    if (open) asideRef.current?.focus();
  }, [open]);

  function count(item: InsNavItem): number {
    if (!p || !item.countKey) return 0;
    const map = { prompts: d.promptCountByProject, competitors: d.competitorCountByProject, recs: d.recommendationCountByProject }[item.countKey];
    return map[p.id] ?? 0;
  }

  return (
    <aside className={`ins side${open ? " on" : ""}`} id="side" aria-label="Menú" ref={asideRef} tabIndex={-1}>
      <div className="brand">
        <svg aria-hidden="true">
          <use href="#e-gs" />
        </svg>
        GenScore
      </div>
      <ProjectButton />
      <button type="button" className="kbtn" onClick={() => { onNavigate(); openPalette(); }}>
        <Ic n="search" sm />
        Buscar o ir a…
        <kbd>⌘K</kbd>
      </button>
      <nav id="nav">
        {INS_NAV.map((g, gi) => (
          <div className="grp" key={g.label ?? gi} style={{ marginTop: g.label ? 14 : 0 }}>
            {g.label ? (
              <div className="lbl">
                {g.label}
                {g.isNew ? <span className="new">Nuevo</span> : null}
              </div>
            ) : null}
            {g.items.map((item) => {
              const n = count(item);
              if (!p) {
                return (
                  <span key={item.label} className="nav off" aria-disabled="true">
                    <Ic n={item.icon} />
                    <span>{item.label}</span>
                  </span>
                );
              }
              const active = isNavActive(pathname, p.id, item, block);
              return (
                <Link
                  key={item.label}
                  href={navHref(p.id, item)}
                  className={`nav${active ? " on" : ""}`}
                  aria-current={active ? "page" : undefined}
                  onClick={onNavigate}
                >
                  <Ic n={item.icon} />
                  <span>{item.label}</span>
                  {n > 0 ? <span className="cnt num">{n}</span> : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <TrialEndedPlanCard onNavigate={onNavigate} />
      <div className="xo-bot">
        <button
          type="button"
          className="xo-help"
          ref={helpRef}
          aria-haspopup="dialog"
          aria-label="¿Cómo funciona?"
          title="¿Cómo funciona?"
          onClick={(e) => pop(e.currentTarget, <HelpPanel />, { w: 320, align: "start", label: "¿Cómo funciona?" })}
        >
          <Ic n="c-help" />
          <span>¿Cómo funciona?</span>
        </button>
        <div
          className="foot xo-foot"
          role="button"
          tabIndex={0}
          aria-haspopup="dialog"
          aria-label="Tu cuenta"
          ref={footRef}
          onClick={(e) => pop(e.currentTarget, <AccountPanel helpAnchor={() => helpRef.current ?? footRef.current} />, { w: 280, align: "start", label: "Tu cuenta" })}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.currentTarget.click();
            }
          }}
        >
          <span className={`av${d.avatarUrl ? " xo-avimg" : ""}`} style={avatarStyle(d.avatarUrl)}>
            {d.avatarUrl ? null : initialsOf(d.userEmail)}
          </span>
          <div>
            <b>{d.userEmail}</b>
            <span>{planLabel(d)}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
