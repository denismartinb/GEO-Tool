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

      {/* Mobile-only: clean centered brand logo. */}
      <div className="hdr-brand-mobile" aria-hidden="true">
        <BrandLogo size={20} />
      </div>

      {/* Desktop: the topbar carries only live scan state + notifications.
          Project name/domain already live in the sidebar's proj-switch and
          section context lives in each page's own heading — this extends
          the "no duplicated context in the app-level header" principle
          already approved for mobile (2026-07-24) up to desktop width
          (DESKTOP-CHROME-1, 2026-07-30). */}
      <div className="hdr-spacer" />
      {status ? (
        <span className="scan-status">
          <span className={`dot ${status === "completed" ? "ok" : status === "failed" ? "err" : "run"}`} />
          {statusLabels[status] ?? status}
        </span>
      ) : null}
    </>
  );
}
