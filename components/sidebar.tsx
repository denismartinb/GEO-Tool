"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Icon } from "@/components/ui/icon";
import { useMobileShell } from "@/components/mobile-shell";

type WorkspaceProject = {
  id: string;
  name: string;
  domain: string;
  country: string;
  language: string;
};

const analyzeLinks = [
  { segment: "", label: "Visión general", icon: "overview", countKey: null as null | string },
  { segment: "/prompts", label: "Prompts", icon: "prompts", countKey: "prompts" },
  { segment: "/competitors", label: "Competidores", icon: "competitors", countKey: "competitors" },
  { segment: "/citations", label: "Páginas citadas", icon: "cite", countKey: null as null | string },
  { segment: "/runs", label: "Escaneos", icon: "runs", countKey: "runs" },
];

const actLinks = [
  { segment: "/recommendations", label: "Recomendaciones", icon: "recs", countKey: "recs" as null | string },
];

function getProjectId(pathname: string) {
  return pathname.match(/^\/dashboard\/projects\/([^/]+)/)?.[1] ?? null;
}

export function Sidebar({
  projects,
  promptCountByProject,
  competitorCountByProject,
  completedRunCountByProject,
  recommendationCountByProject,
  userEmail,
  signOutAction
}: {
  projects: WorkspaceProject[];
  promptCountByProject: Record<string, number>;
  competitorCountByProject: Record<string, number>;
  completedRunCountByProject: Record<string, number>;
  recommendationCountByProject: Record<string, number>;
  userEmail: string;
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const activeProjectId = getProjectId(pathname);
  const project = projects.find((item) => item.id === activeProjectId) ?? null;
  const { mobileNavOpen, closeAll, navTriggerRef } = useMobileShell();
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
    if (key === "runs") return completedRunCountByProject[projectId] ?? 0;
    if (key === "recs") return recommendationCountByProject[projectId] ?? 0;
    return 0;
  }

  const avatarInitials = userEmail.slice(0, 2).toUpperCase();

  return (
    <>
      {mobileNavOpen && (
        <div className="mob-scrim" onClick={handleClose} aria-hidden="true" />
      )}
      <aside className="sb" ref={asideRef} tabIndex={-1}>
        <div className="sb-brand">
          <div className="brand-mark">
            <Icon name="resonance" size={16} />
          </div>
          <div className="hide-collapsed">
            <div className="brand-name">Lumira</div>
            <div className="brand-sub">Espacio de visibilidad en IA</div>
          </div>
          <button type="button" className="sb-close" onClick={handleClose} aria-label="Cerrar menú">
            <Icon name="x" size={18} />
          </button>
        </div>

      {project ? (
        <Link
          className="proj-switch"
          href={`/dashboard/projects/${project.id}/runs`}
          title="Ver escaneos de este dominio"
          onClick={handleNavSelect}
        >
          <div className="proj-favicon">{project.name.slice(0, 1).toUpperCase()}</div>
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
        <a
          href="https://lumira.ai/geo"
          target="_blank"
          rel="noopener noreferrer"
          className="nav-item"
          style={{ fontSize: 12, marginBottom: 2 }}
        >
          <Icon name="info" size={15} />
          <span className="hide-collapsed">¿Qué es el GEO?</span>
        </a>
        <div className="user-chip">
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
          </div>
        </div>
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
