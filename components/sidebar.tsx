"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";

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
  { segment: "/runs", label: "Escaneos", icon: "runs", countKey: "runs" },
];

const actLinks = [
  { segment: "/recommendations", label: "Recomendaciones", icon: "recs", countKey: "recs", locked: false },
  { segment: "/solutions", label: "Soluciones generadas", icon: "recs", countKey: null as null | string, locked: true },
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
  userEmail
}: {
  projects: WorkspaceProject[];
  promptCountByProject: Record<string, number>;
  competitorCountByProject: Record<string, number>;
  completedRunCountByProject: Record<string, number>;
  recommendationCountByProject: Record<string, number>;
  userEmail: string;
}) {
  const pathname = usePathname();
  const activeProjectId = getProjectId(pathname);
  const project = projects.find((item) => item.id === activeProjectId) ?? null;

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
    <aside className="sb">
      <div className="sb-brand">
        <div className="brand-mark">
          <Icon name="resonance" size={16} />
        </div>
        <div className="hide-collapsed">
          <div className="brand-name">Lumira</div>
          <div className="brand-sub">Espacio de visibilidad en IA</div>
        </div>
      </div>

      {project ? (
        <Link className="proj-switch" href="/dashboard/projects" title="Cambiar de proyecto">
          <div className="proj-favicon">{project.name.slice(0, 1).toUpperCase()}</div>
          <div className="proj-meta">
            <div className="proj-name">{project.name}</div>
            <div className="proj-dom">{project.domain}</div>
          </div>
          <Icon name="arrRight" size={14} />
        </Link>
      ) : (
        <div className="proj-empty">
          <p className="proj-empty-title">Sin proyecto seleccionado</p>
          <p className="proj-empty-body">Elige un proyecto o crea el primero.</p>
          <div className="proj-empty-actions">
            <Link href="/dashboard/projects">Ver proyectos</Link>
            <Link href="/dashboard/projects/new">Crear proyecto</Link>
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
            <Link key={link.label} href={href} className={`nav-item ${active ? "active" : ""}`}>
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
          if (link.locked) {
            return (
              <span key={link.label} className="nav-item locked" aria-disabled="true">
                <Icon name={link.icon} size={17} />
                <span className="hide-collapsed">{link.label}</span>
                <Icon name="lock" size={13} className="nav-lock hide-collapsed" />
              </span>
            );
          }

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
            <Link key={link.label} href={href} className={`nav-item ${active ? "active" : ""}`}>
              <Icon name={link.icon} size={17} />
              <span className="hide-collapsed">{link.label}</span>
              {count > 0 && (
                <span className="nav-count hide-collapsed">{count}</span>
              )}
            </Link>
          );
        })}

        {/* Otros proyectos */}
        {projects.length > 1 && (
          <div style={{ marginTop: 12 }}>
            <div className="nav-group-label hide-collapsed">Otros proyectos</div>
            {projects
              .filter((p) => p.id !== activeProjectId)
              .map((p) => (
                <Link
                  key={p.id}
                  href={`/dashboard/projects/${p.id}`}
                  className="proj-other-item"
                >
                  <div className="proj-favicon proj-favicon-sm">
                    {p.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="proj-meta hide-collapsed" style={{ flex: 1, minWidth: 0 }}>
                    <div className="proj-name" style={{ fontSize: 12.5 }}>{p.name}</div>
                    <div className="proj-dom">{p.domain}</div>
                  </div>
                  <Icon name="arrRight" size={12} className="hide-collapsed" />
                </Link>
              ))}
          </div>
        )}
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
      </div>
    </aside>
  );
}
