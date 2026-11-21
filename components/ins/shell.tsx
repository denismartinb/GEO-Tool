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
import { TrialEndedFirstEntry, TrialEndedPlanCard, TrialEndedStrip } from "@/components/ins/trial-ended";
import { ToastProvider } from "@/components/ins/toasts";
import "@/app/ins/dark.css";
import {
  crumbForPath,
  INS_NAV,
  INS_TABS,
  isNavActive,
  navHref,
  tabForPath,
  tabSubItems,
  tabTarget,
  type InsNavItem,
  type InsTabKey
} from "@/lib/ins/nav";
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
  const scRef = useRef<HTMLDivElement | null>(null);
  const [edgeTop, setEdgeTop] = useState(false);
  const [edgeBottom, setEdgeBottom] = useState(false);

  const edges = useCallback(() => {
    const sc = scRef.current;
    if (!sc) return;
    setEdgeTop(sc.scrollTop > 4);
    setEdgeBottom(sc.scrollTop + sc.clientHeight < sc.scrollHeight - 4);
  }, []);

  useEffect(() => {
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

  return (
    <div className="ins-shell" data-app={d.inApp ? "android" : undefined}>
      <InsSprite />
      <div className="app">
        <Sidebar />
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
            <ProjectButton mobile />
            <span className="sp" />
            <MobileSearchButton />
            <BellButton variant="mobile" />
            <AccountAvatar />
          </header>
          <TrialEndedStrip />
          <TrialEndedFirstEntry />
          <div className="scroller dash-content" id="sc" ref={scRef}>
            <TabSub />
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
      <TabBar />
    </div>
  );
}


function MobileSearchButton() {
  const { open } = useCommandPalette();
  return (
    <button type="button" className="msearch" aria-label="Buscar o ir a" onClick={open}>
      <Ic n="search" sm />
    </button>
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

function Sidebar() {
  const d = useShellData();
  const pathname = usePathname();
  const block = useAuditBlock();
  const { open: openPalette } = useCommandPalette();
  const { pop } = useLayer();
  const helpRef = useRef<HTMLButtonElement | null>(null);
  const footRef = useRef<HTMLDivElement | null>(null);
  const p = d.project;

  function count(item: InsNavItem): number {
    if (!p || !item.countKey) return 0;
    const map = { prompts: d.promptCountByProject, competitors: d.competitorCountByProject, recs: d.recommendationCountByProject }[item.countKey];
    return map[p.id] ?? 0;
  }

  return (
    <aside className="ins side" id="side" aria-label="Menú">
      <div className="brand">
        <svg aria-hidden="true">
          <use href="#e-gs" />
        </svg>
        GenScore
      </div>
      <ProjectButton />
      <button type="button" className="kbtn" onClick={openPalette}>
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
      <TrialEndedPlanCard />
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

/*
 * MOBILE-TABBAR-1: barra inferior flotante (≤760 px). Seis pestañas (log §393); cada una
 * recuerda la última pantalla vista de su familia. Memoria en un ref: el marco
 * no se desmonta al navegar, así que dura toda la visita.
 */
function useTab() {
  const d = useShellData();
  const pathname = usePathname();
  const last = useRef<Partial<Record<InsTabKey, string>>>({});
  const p = d.project;
  const tab = p ? tabForPath(pathname, p.id) : null;
  if (p && tab) {
    const seg = tab.segments.find((s) => {
      const item = navItemBySegment(s);
      return item ? isNavActive(pathname, p.id, item) : false;
    });
    if (seg !== undefined) last.current[tab.key] = seg;
  }
  return { d, p, tab, last: last.current, pathname };
}

function navItemBySegment(segment: string): InsNavItem | undefined {
  return INS_NAV.flatMap((g) => g.items).find((n) => n.segment === segment);
}

function TabBar() {
  const { d, p, tab, last } = useTab();
  if (!p) return null;
  return (
    <nav className="ins tabbar" aria-label="Secciones">
      {INS_TABS.map((t) => {
        const on = tab?.key === t.key;
        const recs = t.key === "recs" ? (d.recommendationCountByProject[p.id] ?? 0) : 0;
        return (
          <Link
            key={t.key}
            href={`/dashboard/projects/${p.id}${tabTarget(t, last)}`}
            className={on ? "on" : undefined}
            aria-current={on ? "page" : undefined}
            aria-label={recs > 0 ? `${t.label}, ${recs} recomendaciones` : t.label}
          >
            <Ic n={t.icon} />
            <span>{t.short}</span>
            {recs > 0 ? <span className="b num">{recs}</span> : null}
            {t.isNew ? <span className="nw">Nuevo</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

function TabSub() {
  const { p, tab, pathname } = useTab();
  const block = useAuditBlock();
  if (!p || !tab) return null;
  const items = tabSubItems(tab);
  if (items.length === 0) return null;
  return (
    <nav className="ins tabsub" aria-label={tab.label}>
      {items.map((item) => {
        const active = isNavActive(pathname, p.id, item, block);
        return (
          <Link key={`${item.segment}${item.block ?? ""}`} href={navHref(p.id, item)} className={active ? "on" : undefined} aria-current={active ? "page" : undefined}>
            {item.pin ?? item.label}
          </Link>
        );
      })}
    </nav>
  );
}
