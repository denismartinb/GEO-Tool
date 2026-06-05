"use client";

import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";

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
  { suffix: "/runs", label: "Escaneos" }
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

  if (!project) {
    return (
      <div className="hdr-titlewrap">
        <div className="hdr-crumb">Lumira</div>
        <div className="hdr-title">Espacio de trabajo</div>
      </div>
    );
  }

  const section = routeLabels.find((route) => pathname.includes(route.suffix))?.label ?? "Visión general";
  const status = latestScanStatusByProject[project.id];

  return (
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
  );
}
