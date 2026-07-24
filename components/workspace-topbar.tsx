"use client";

import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { BrandLogo } from "@/components/ui/brand-logo";
import { useMobileShell } from "@/components/mobile-shell";

type WorkspaceProject = {
  id: string;
  name: string;
  domain: string;
  country: string;
  language: string;
};

const routeLabels = [
  { suffix: "/prompts", label: "Prompts" },
  { suffix: "/competitors", label: "Competidores" },
  { suffix: "/recommendations", label: "Recomendaciones" },
  { suffix: "/runs", label: "Escaneos" },
  { suffix: "/web-audit", label: "Auditoría web" }
];

const statusLabels: Record<string, string> = {
  pending: "Pendiente",
  running: "En curso",
  completed: "Completado",
  failed: "Con errores",
  cancelled: "Cancelado"
};

function getProjectId(pathname: string) {
  return pathname.match(/^\/dashboard\/projects\/([^/]+)/)?.[1] ?? null;
}

export function WorkspaceTopbar({
  projects,
  latestScanStatusByProject
}: {
  projects: WorkspaceProject[];
  latestScanStatusByProject: Record<string, string>;
}) {
  const pathname = usePathname();
  const projectId = getProjectId(pathname);
  const project = projects.find((item) => item.id === projectId) ?? null;
  const { mobileNavOpen, setMobileNavOpen, navTriggerRef } = useMobileShell();

  const section = project
    ? routeLabels.find((route) => pathname.includes(route.suffix))?.label ?? "Visión general"
    : null;
  const status = project ? latestScanStatusByProject[project.id] : undefined;

  return (
    <>
      <button
        type="button"
        className="hdr-burger"
        aria-label="Abrir menú de navegación"
        aria-expanded={mobileNavOpen}
        onClick={() => setMobileNavOpen(true)}
        ref={navTriggerRef}
      >
        <Icon name="menu" size={20} />
      </button>

      {/* Mobile-only: clean centered brand logo. The section/domain context
          lives in each page's own sticky header, so the app-level mobile
          header stays purely navigational (burger · logo · bell) instead of
          duplicating that info (founder decision 2026-07-24). */}
      <div className="hdr-brand-mobile" aria-hidden="true">
        <BrandLogo size={20} />
      </div>

      {!project ? (
        <div className="hdr-titlewrap">
          <div className="hdr-crumb">GenScore</div>
          <div className="hdr-title">Espacio de trabajo</div>
        </div>
      ) : (
        <div className="workspace-context">
          <div className="hdr-titlewrap">
            <div className="hdr-crumb">
              <b>{project.name}</b> · {section}
            </div>
            <div className="hdr-title">{project.domain}</div>
          </div>
          <div className="hdr-meta">
            <span className="meta-pill">
              <Icon name="globe" size={14} />
              {project.country}
            </span>
            <span className="meta-pill">
              <Icon name="lang" size={14} />
              {project.language}
            </span>
            {status ? (
              <span className="scan-status">
                <span className={`dot ${status === "completed" ? "ok" : status === "failed" ? "err" : "run"}`} />
                {statusLabels[status] ?? status}
              </span>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
