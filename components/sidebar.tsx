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

const links = [
  { segment: "", label: "Visión general", icon: "overview" },
  { segment: "/prompts", label: "Prompts", icon: "prompts" },
  { segment: "/competitors", label: "Competidores", icon: "competitors" },
  { segment: "/runs", label: "Escaneos", icon: "runs" },
  { segment: "/recommendations", label: "Recomendaciones", icon: "recs" }
];

function getProjectId(pathname: string) {
  return pathname.match(/^\/dashboard\/projects\/([^/]+)/)?.[1] ?? null;
}

export function Sidebar({ projects }: { projects: WorkspaceProject[] }) {
  const pathname = usePathname();
  const activeProjectId = getProjectId(pathname);
  const project = projects.find((item) => item.id === activeProjectId) ?? null;

  return (
    <aside className="sb">
      <div className="sb-brand">
        <div className="brand-mark">
          <Icon name="recs" size={16} />
        </div>
        <div className="hide-collapsed">
          <div className="brand-name">GEO Studio</div>
          <div className="brand-sub">Visibilidad en IA</div>
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
        {links.map((link) => {
          const href = project ? `/dashboard/projects/${project.id}${link.segment}` : null;
          const active = href
            ? link.segment
              ? pathname === href || pathname.startsWith(`${href}/`)
              : pathname === href
            : false;

          if (!href) {
            return (
              <span key={link.label} className="nav-item disabled" aria-disabled="true">
                <Icon name={link.icon} size={17} />
                <span>{link.label}</span>
              </span>
            );
          }

          return (
            <Link key={link.label} href={href} className={`nav-item ${active ? "active" : ""}`}>
              <Icon name={link.icon} size={17} />
              <span>{link.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="sb-foot">
        <Link href="/dashboard/projects" className="nav-item">
          <Icon name="globe" size={17} />
          <span>Todos los proyectos</span>
        </Link>
      </div>
    </aside>
  );
}
