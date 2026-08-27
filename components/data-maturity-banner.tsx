"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { visibleDataMaturityState, type DataMaturityState } from "@/lib/data-maturity";
import { setRecurringScans } from "@/app/dashboard/projects/[projectId]/actions";

function getProjectId(pathname: string): string | null {
  return pathname.match(/^\/dashboard\/projects\/([^/]+)/)?.[1] ?? null;
}

function dismissedKey(projectId: string): string {
  return `dmb-dismissed:${projectId}`;
}

/**
 * DEBUG-HIDE-NO-TRACKING-1, ampliado en MATURITY-BANNER-HIDE-ALL-1 (2026-08-27,
 * log §179): preferencia local (no hay migración detrás) que silencia **toda**
 * esta banda, sea cual sea su estado. Se activa desde un switch en
 * `/dashboard/projects/[projectId]/debug`
 * (`app/dashboard/projects/[projectId]/debug/maturity-banner-toggle.tsx`), que
 * importa esta misma función para no duplicar el formato de la clave entre los
 * dos ficheros.
 *
 * **Silencia la banda entera, no un estado.** Nació cubriendo sólo
 * `no_tracking` y el fundador pidió que cubriera también "el de histórico
 * construyendo y cualquier similar que haya" (2026-08-27). Ese "cualquier
 * similar" es la parte que decide la forma del arreglo: enumerar los estados
 * de hoy dejaría el switch mintiendo en cuanto `computeDataMaturity` gane uno
 * nuevo, y nadie se enteraría — el aviso simplemente reaparecería. Así que la
 * comprobación va **antes** del reparto por `kind`, y un estado nuevo queda
 * cubierto por no hacer nada.
 *
 * **La ausencia de valor significa OCULTO** (PROJECT-DEFAULTS-BY-ACCOUNT-1,
 * §173, tras la prueba del fundador con una cuenta nueva): sólo un `"0"`
 * explícito revela los avisos. `free` es la única excepción y nunca se calla —
 * vende un plan y lleva su propia X, no pide esperar (ver `NEVER_SILENCED` en
 * `lib/data-maturity.ts`).
 *
 * **La clave de `localStorage` conserva su nombre viejo a propósito.**
 * Renombrarla dejaría a quien ya tenga el switch encendido con la banda de
 * vuelta en la cara sin haber tocado nada — justo lo contrario de lo que se
 * pide aquí. El nombre queda desalineado con lo que hace; este comentario es
 * el que impide que eso se lea como un descuido.
 *
 * A diferencia de `dismissedKey` (un descarte de un solo render, por
 * `useState`), ésta persiste hasta que se apague el switch — el aviso seguiría
 * reapareciendo en cada carga si sólo se pudiera descartar.
 */
export function maturityBannerHiddenKey(projectId: string): string {
  return `dmb-hide-no-tracking:${projectId}`;
}

/**
 * DATA-MATURITY-1: explains the gap between "your score today is real" and
 * "trends/competitor comparisons need more history" instead of leaving that
 * gap silent (see lib/data-maturity.ts computeDataMaturity for the state
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
  // Nace en `true`: la ausencia de valor en `localStorage` significa OCULTO, y
  // sólo un `"0"` explícito —el switch apagado a mano en `/debug`— revela los
  // avisos. Lo decidió el fundador probando una cuenta nueva de verdad
  // (PROJECT-DEFAULTS-BY-ACCOUNT-1, §173): con el seguimiento ya activo desde el
  // primer escaneo, «Tu histórico se está construyendo» sale en toda cuenta real
  // y resultó tan ruidoso como el que ya se silenciaba.
  const [bannerHidden, setBannerHidden] = useState(true);

  useEffect(() => {
    if (!projectId || typeof window === "undefined") {
      setDismissed(false);
      setBannerHidden(true);
      return;
    }
    setDismissed(window.localStorage.getItem(dismissedKey(projectId)) === "1");
    setBannerHidden(window.localStorage.getItem(maturityBannerHiddenKey(projectId)) !== "0");
  }, [projectId]);

  if (!projectId) return null;
  // Una sola puerta, y vive en `lib/project-workspace.ts` con su test. El
  // switch de `/debug` silencia la BANDA, no uno de sus mensajes, así que la
  // decisión se toma antes de mirar `kind` y un estado futuro queda cubierto
  // sin que nadie tenga que acordarse (log §179).
  const state = visibleDataMaturityState({
    state: dataMaturityByProject[projectId],
    dismissed,
    hidden: bannerHidden
  });
  if (!state) return null;

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
