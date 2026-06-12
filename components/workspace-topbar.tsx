"use client";

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
  const { mobileNavOpen, setMobileNavOpen, metaOpen, setMetaOpen, navTriggerRef } = useMobileShell();
  const metaPanelRef = useRef<HTMLDivElement | null>(null);

  const section = project
    ? routeLabels.find((route) => pathname.includes(route.suffix))?.label ?? "Visión general"
    : null;
  const status = project ? latestScanStatusByProject[project.id] : undefined;
  const mobileTitle = project ? (section ?? "Visión general") : "Espacio de trabajo";

  useEffect(() => {
    if (!metaOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!metaPanelRef.current?.contains(event.target as Node)) {
        setMetaOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [metaOpen, setMetaOpen]);

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

      {!project ? (
        <div className="hdr-titlewrap">
          <div className="hdr-crumb">Lumira</div>
          <div className="hdr-title">Espacio de trabajo</div>
          <div className="hdr-title-mobile">{mobileTitle}</div>
        </div>
      ) : (
        <div className="workspace-context">
          <div className="hdr-titlewrap">
            <div className="hdr-crumb">
              <b>{project.name}</b> · {section}
            </div>
            <div className="hdr-title">{project.domain}</div>
            <div className="hdr-title-mobile">{mobileTitle}</div>
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

      {project ? (
        <div className="hdr-meta-wrap" ref={metaPanelRef}>
          <button
            type="button"
            className={`hdr-metabtn ${metaOpen ? "on" : ""}`}
            aria-label="Ver detalles del proyecto"
            aria-expanded={metaOpen}
            onClick={() => setMetaOpen(!metaOpen)}
          >
            <Icon name="globe" size={18} />
          </button>
          {metaOpen ? (
            <div className="hdr-meta-panel">
              <div className="hmp-row">
                <Icon name="link" size={15} />
                {project.domain}
              </div>
              <div className="hmp-row">
                <Icon name="globe" size={15} />
                {project.country}
              </div>
              <div className="hmp-row">
                <Icon name="lang" size={15} />
                {project.language}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
