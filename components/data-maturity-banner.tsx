"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { DataMaturityState } from "@/lib/project-workspace";
import { setRecurringScans } from "@/app/dashboard/projects/[projectId]/actions";

function getProjectId(pathname: string): string | null {
  return pathname.match(/^\/dashboard\/projects\/([^/]+)/)?.[1] ?? null;
}

function dismissedKey(projectId: string): string {
  return `dmb-dismissed:${projectId}`;
}

/**
 * DEBUG-HIDE-NO-TRACKING-1: preferencia local (no hay migración detrás) que
 * silencia los dos avisos puramente informativos de abajo — "Tu análisis de
 * hoy no se repetirá" (`no_tracking`) y "Tu histórico se está construyendo"
 * (`accumulating`) — ninguno corrige algo roto, sólo piden esperar o activar
 * el seguimiento. Se activa desde un switch en `/dashboard/projects/
 * [projectId]/debug` (`components/no-tracking-banner-toggle.tsx`), que
 * importa esta misma función para no duplicar el formato de la clave entre
 * los dos ficheros. A diferencia de `dismissedKey` (un descarte de un solo
 * render, por `useState`), esta persiste hasta que se apague el switch — el
 * aviso seguiría reapareciendo en cada carga si sólo se pudiera descartar.
 *
 * PROJECT-DEFAULTS-BY-ACCOUNT-1 (corrección tras prueba del fundador,
 * 2026-08-27): oculto por defecto. La ausencia de valor ya no significa
 * "mostrar" — sólo un `"0"` explícito (switch apagado a mano) revela los
 * avisos de nuevo.
 */
export function noTrackingHiddenKey(projectId: string): string {
  return `dmb-hide-no-tracking:${projectId}`;
}

/**
 * DATA-MATURITY-1: explains the gap between "your score today is real" and
 * "trends/competitor comparisons need more history" instead of leaving that
 * gap silent (see lib/project-workspace.ts computeDataMaturity for the state
 * machine). Lives once per dashboard shell (app/dashboard/layout.tsx) rather
 * than per project page, reading the current project id off the URL like
 * WorkspaceTopbar already does — every project-scoped page gets it for free
 * without a dedicated project-level layout.
 */
export function DataMaturityBanner({
  dataMaturityByProject
}: {
  dataMaturityByProject: Record<string, DataMaturityState>;
}) {
  const pathname = usePathname();
  const projectId = getProjectId(pathname);
  const [dismissed, setDismissed] = useState(false);
  // PROJECT-DEFAULTS-BY-ACCOUNT-1 (corrección tras prueba del fundador,
  // 2026-08-27): oculto por defecto — la ausencia de valor en `localStorage`
  // ya no significa "mostrar". Un `"0"` explícito (switch apagado a mano en
  // `/debug`) es lo único que revela los dos avisos informativos de abajo.
  const [noTrackingHidden, setNoTrackingHidden] = useState(true);

  useEffect(() => {
    if (!projectId || typeof window === "undefined") {
      setDismissed(false);
      setNoTrackingHidden(true);
      return;
    }
    setDismissed(window.localStorage.getItem(dismissedKey(projectId)) === "1");
    setNoTrackingHidden(window.localStorage.getItem(noTrackingHiddenKey(projectId)) !== "0");
  }, [projectId]);

  if (!projectId) return null;
  const state = dataMaturityByProject[projectId];
  if (!state || state.kind === "hidden" || dismissed) return null;
  // Los dos estados puramente informativos (piden esperar o activar el
  // seguimiento, no corrigen nada roto) se apagan juntos con el mismo
  // switch — el fundador probó el flujo real y encontró el banner de
  // progreso ("Escaneo N de 5") tan ruidoso como el de `no_tracking`.
  if ((state.kind === "no_tracking" || state.kind === "accumulating") && noTrackingHidden) return null;

  function dismiss() {
    if (projectId && typeof window !== "undefined") {
      window.localStorage.setItem(dismissedKey(projectId), "1");
    }
    setDismissed(true);
  }

  if (state.kind === "free") {
    return (
      <div className="dmb-band is-flat">
        <span className="dmb-ico" aria-hidden="true">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8h.01M11 12h1v4h1" />
          </svg>
        </span>
        <span className="dmb-txt">
          El plan Free incluye <b>un solo escaneo</b>: tienes tu foto actual, pero no evolución ni tendencias.
        </span>
        <span className="dmb-sp" />
        <a className="dmb-cta ghost" href="/pricing">
          Ver planes
        </a>
        <button type="button" className="dmb-x" aria-label="Descartar" onClick={dismiss}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  }

  if (state.kind === "no_tracking") {
    return (
      <div className="dmb-band">
        <span className="dmb-ico" aria-hidden="true">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 7v5l3 2" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        </span>
        <span className="dmb-txt">
          <b>Tu análisis de hoy no se repetirá.</b> Activa el seguimiento diario para ver cómo evoluciona tu
          visibilidad frente a tus competidores.
        </span>
        <span className="dmb-sp" />
        <form action={setRecurringScans}>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="enabled" value="true" />
          <button type="submit" className="dmb-cta">
            Activar seguimiento diario
          </button>
        </form>
      </div>
    );
  }

  const segments = Array.from({ length: state.target }, (_, i) => i < state.completed);

  return (
    <div className="dmb-band">
      <span className="dmb-ico" aria-hidden="true">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 17l5-5 3.5 3.5L21 6" />
          <path d="M15 6h6v6" />
        </svg>
      </span>
      <span className="dmb-txt">
        <b>Tu histórico se está construyendo.</b> Las tendencias y la comparativa con tus competidores ganan
        fiabilidad con cada escaneo.
      </span>
      <span className="dmb-sp" />
      <span className="dmb-meter">
        <span className="dmb-count">
          Escaneo {state.completed} de {state.target}
        </span>
        <span className="dmb-segs" role="img" aria-label={`${state.completed} de ${state.target} escaneos completados`}>
          {segments.map((on, i) => (
            <span key={i} className={on ? "dmb-seg on" : "dmb-seg"} />
          ))}
        </span>
        <span className="dmb-eta">
          ~{state.etaCount} {state.cadenceUnit}
        </span>
      </span>
    </div>
  );
}
