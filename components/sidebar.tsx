"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { Icon } from "@/components/ui/icon";
import { BrandLogo } from "@/components/ui/brand-logo";
import { useMobileShell } from "@/components/mobile-shell";
import { useTour } from "@/components/tour-provider";
import { FaviconImg } from "@/components/ui/favicon-img";
import { avatarInitials as deriveAvatarInitials, showsPlanBadge } from "@/lib/account-chip";
import { resolveSelectedProject } from "@/lib/active-project-cookie";

type WorkspaceProject = {
  id: string;
  name: string;
  domain: string;
  country: string;
  language: string;
};

// "Dominios" (/dashboard/domains) deliberately has no entry here, and neither
// had "Escaneos" before it (founder-approved 2026-07-18, reaffirmed 2026-08-05):
// the domain block at the top of the sidebar (`proj-switch`) already links
// straight to it — a second link would just duplicate that entry point. A brief
// version of this phase DID add one and the founder had it removed: pinchar el
// propio dominio es el gesto que ya existía y el que la gente conoce.
// The operational half (/debug) has no entry at all, by design.
const analyzeLinks = [
  { segment: "", label: "Visión general", icon: "overview", countKey: null as null | string },
  { segment: "/prompts", label: "Prompts", icon: "prompts", countKey: "prompts" },
  { segment: "/competitors", label: "Competidores", icon: "competitors", countKey: "competitors" },
  { segment: "/citations", label: "Páginas citadas", icon: "cite", countKey: null as null | string },
  { segment: "/web-audit", label: "Auditoría web", icon: "search", countKey: null as null | string },
];

const actLinks = [
  { segment: "/recommendations", label: "Recomendaciones", icon: "recs", countKey: "recs" as null | string },
];

function getProjectId(pathname: string) {
  return pathname.match(/^\/dashboard\/projects\/([^/]+)/)?.[1] ?? null;
}

export function Sidebar({
  projects,
  preferredProjectId,
  promptCountByProject,
  competitorCountByProject,
  recommendationCountByProject,
  userEmail,
  planId,
  planName,
  signOutAction
}: {
  projects: WorkspaceProject[];
  /** DOMAINS-LIVE-SELECT-1 — `geo_active_project` cookie value from the layout, read server-side. Fallback below the pathname, above `projects[0]`. */
  preferredProjectId: string | null;
  promptCountByProject: Record<string, number>;
  competitorCountByProject: Record<string, number>;
  recommendationCountByProject: Record<string, number>;
  userEmail: string;
  /** Effective plan (post reverse-trial-expiry check, see lib/billing.ts:getPlanForUser) — "free" renders no badge, founder decision 2026-07-31. */
  planId: string;
  planName: string;
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeProjectId = getProjectId(pathname);
  // DOMAINS-LIVE-SELECT-1 — selecting a card on /dashboard/domains changes
  // `?active=` without changing the pathname, and this Sidebar instance stays
  // mounted across that client-side navigation (same layout segment), so
  // `preferredProjectId` — read once, server-side, when the layout itself
  // last rendered — does NOT pick up the change on its own; that cookie
  // update needs a real page load elsewhere to be reflected here. `useSearchParams()`
  // is reactive to every client-side navigation regardless, so reading the
  // live query string is what makes the sidebar update the instant a card is
  // clicked, with no round trip. Confirmed the hard way: the read-only pilot
  // journey added for this feature failed on the first push without this —
  // the hero updated (it's a fresh Server Component render) but the sidebar
  // didn't (see docs/brand/design-decisions-log.md §122).
  const domainsQueryProjectId = pathname === "/dashboard/domains" ? searchParams.get("active") : null;
  // Outside a project's own routes (Billing, Settings, the dashboard root)
  // the URL carries no projectId at all — fall back to the cookie-remembered
  // selection, then to the most recent active project, so "Analizar"/"Actuar"
  // still link somewhere instead of going fully disabled whenever the
  // account isn't currently inside a project.
  const project =
    resolveSelectedProject(projects, activeProjectId ?? domainsQueryProjectId, preferredProjectId) ?? null;
  const { mobileNavOpen, closeAll, navTriggerRef } = useMobileShell();
  const { open: openTour } = useTour();
  const asideRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (mobileNavOpen) {
      asideRef.current?.focus();
    }
  }, [mobileNavOpen]);

  function handleNavSelect() {
    closeAll();
  }

  function handleClose() {
    closeAll();
    navTriggerRef.current?.focus();
  }

  function getCount(projectId: string, key: string | null): number {
    if (!key) return 0;
    if (key === "prompts") return promptCountByProject[projectId] ?? 0;
    if (key === "competitors") return competitorCountByProject[projectId] ?? 0;
    if (key === "recs") return recommendationCountByProject[projectId] ?? 0;
    return 0;
  }

  const avatarInitials = deriveAvatarInitials(userEmail);

  return (
    <>
      {mobileNavOpen && (
        <div className="mob-scrim" onClick={handleClose} aria-hidden="true" />
      )}
      <aside className="sb" ref={asideRef} tabIndex={-1}>
        <div className="sb-brand">
          <div>
            <BrandLogo size={22} />
            <div className="brand-sub">Espacio de visibilidad en IA</div>
          </div>
          <button type="button" className="sb-close" onClick={handleClose} aria-label="Cerrar menú">
            <Icon name="x" size={18} />
          </button>
        </div>

      {project ? (
        <Link
          className="proj-switch"
          href="/dashboard/domains"
          title="Cambiar de dominio"
          onClick={handleNavSelect}
        >
          {/* key por dominio: sin él el conmutador se queda con el icono del
              proyecto anterior mientras carga el nuevo. */}
          <FaviconImg
            key={project.domain}
            domain={project.domain}
            cssSize={26}
            className="proj-favicon"
            fallback={<div className="proj-favicon">{project.name.slice(0, 1).toUpperCase()}</div>}
          />
          <div className="proj-meta">
            <div className="proj-name">{project.name}</div>
            <div className="proj-dom">{project.domain}</div>
          </div>
          <Icon name="arrRight" size={14} />
        </Link>
      ) : (
        <div className="proj-empty">
          <p className="proj-empty-title">Sin dominio todavía</p>
          <p className="proj-empty-body">Crea tu primer dominio para empezar a escanear.</p>
          <div className="proj-empty-actions">
            <Link href="/dashboard/projects/new" onClick={handleNavSelect}>Crear dominio</Link>
          </div>
        </div>
      )}

      <div className="sb-scroll">
        <div className="nav-group-label hide-collapsed">Analizar</div>
        {analyzeLinks.map((link) => {
          const href = project ? `/dashboard/projects/${project.id}${link.segment}` : null;
          const active = href
            ? link.segment
              ? pathname === href || pathname.startsWith(`${href}/`)
              : pathname === href
            : false;
          const count = project ? getCount(project.id, link.countKey) : 0;

          if (!href) {
            return (
              <span key={link.label} className="nav-item disabled" aria-disabled="true">
                <Icon name={link.icon} size={17} />
                <span className="hide-collapsed">{link.label}</span>
              </span>
            );
          }

          return (
            <Link
              key={link.label}
              href={href}
              className={`nav-item ${active ? "active" : ""}`}
              onClick={handleNavSelect}
              aria-current={active ? "page" : undefined}
            >
              <Icon name={link.icon} size={17} />
              <span className="hide-collapsed">{link.label}</span>
              {count > 0 && (
                <span className="nav-count hide-collapsed">{count}</span>
              )}
            </Link>
          );
        })}

        <div className="nav-group-label hide-collapsed">Actuar</div>
        {actLinks.map((link) => {
          const href = project ? `/dashboard/projects/${project.id}${link.segment}` : null;
          const active = href
            ? pathname === href || pathname.startsWith(`${href}/`)
            : false;
          const count = project ? getCount(project.id, link.countKey) : 0;

          if (!href) {
            return (
              <span key={link.label} className="nav-item disabled" aria-disabled="true">
                <Icon name={link.icon} size={17} />
                <span className="hide-collapsed">{link.label}</span>
              </span>
            );
          }

          return (
            <Link
              key={link.label}
              href={href}
              className={`nav-item ${active ? "active" : ""}`}
              onClick={handleNavSelect}
              aria-current={active ? "page" : undefined}
            >
              <Icon name={link.icon} size={17} />
              <span className="hide-collapsed">{link.label}</span>
              {count > 0 && (
                <span className="nav-count hide-collapsed">{count}</span>
              )}
            </Link>
          );
        })}

      </div>

      <div className="sb-foot">
        {/* ONBOARDING-TOUR-1: tras el primer acceso, ésta es la puerta de
            vuelta al tour (fundador, 2026-08-06: «luego estará en el menú, en
            qué es el GEO»). La página /geo no se pierde: el propio tour la
            enlaza en su pie. Se cierra el cajón móvil al abrirlo, o el popup
            saldría detrás del menú. */}
        <button
          type="button"
          className="nav-item"
          style={{ fontSize: 12, marginBottom: 2, width: "100%", textAlign: "left" }}
          onClick={() => {
            handleNavSelect();
            openTour();
          }}
        >
          <Icon name="info" size={15} />
          <span className="hide-collapsed">¿Qué es el GEO?</span>
        </button>
        <Link href="/dashboard/settings" className="user-chip" onClick={handleNavSelect}>
          <div className="avatar">{avatarInitials}</div>
          <div className="hide-collapsed" style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 650,
                color: "var(--ink)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis"
              }}
            >
              {userEmail}
            </div>
            {showsPlanBadge(planId) && (
              <span className="sb-plan-badge">
                <Icon name="crown" size={10} />
                {planName}
              </span>
            )}
          </div>
        </Link>
        <form action={signOutAction} className="sb-signout">
          <button type="submit" className="nav-item" style={{ width: "100%" }}>
            <Icon name="settings" size={15} />
            <span>Cerrar sesión</span>
          </button>
        </form>
      </div>
      </aside>
    </>
  );
}
