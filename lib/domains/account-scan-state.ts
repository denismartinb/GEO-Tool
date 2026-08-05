import { computeScanStage, type ActiveScanRun } from "@/components/scan-in-progress";

/**
 * DOMAINS-REDESIGN-1 — la etiqueta de estado de la cabecera de `/dashboard/
 * domains`.
 *
 * Toda cabecera del producto hasta ahora hablaba de UN proyecto, así que
 * `scanStatePillLabel` (components/scan-state-pill.tsx) sólo tenía que mirar un
 * run. Dominios es la primera pantalla de cuenta: puede haber tres dominios
 * escaneando y uno auditándose a la vez, y una cabecera no puede decir cuatro
 * cosas.
 *
 * Función pura y en su propio módulo por el mismo motivo que
 * `scanStatePillLabel`: el proyecto no tiene arnés de DOM en los tests, así que
 * sacar la decisión del render es lo que permite fijarla.
 *
 * Las reglas (aprobadas por el fundador, 2026-08-05):
 *
 * - **En reposo, nada.** No existe una "fecha de último escaneo" de la cuenta,
 *   y una pastilla verde por dominio en la cabecera sería ruido. El hueco lo
 *   ocupa la línea de automatización.
 * - **Un solo dominio activo** → la etiqueta de siempre más el dominio, para
 *   que se sepa cuál sin bajar la vista al raíl.
 * - **Dos o más** → un recuento. Deliberadamente NO se mezclan etapas: un
 *   dominio generando y otro analizando no comparten etiqueta, y elegir una de
 *   las dos afirmaría de un dominio algo que sólo es cierto del otro. El
 *   detalle por dominio vive en su tarjeta, que es donde sirve.
 * - **El escaneo gana a la auditoría.** La auditoría corre DESPUÉS de cada
 *   escaneo (AUDIT-AFTER-SCAN-1); anunciarla mientras el escaneo sigue vivo
 *   invierte el orden real de los hechos y sugiere que ya hay resultados que
 *   auditar.
 */

export type DomainActivity = {
  /** El dominio, tal cual se muestra (`movistar.es`). */
  domain: string;
  /** El run pendiente/en curso de ese dominio, si lo hay. */
  activeRun?: ActiveScanRun | null;
  /** Si ese dominio tiene una campaña de auditoría viva. */
  auditing?: boolean;
};

export type AccountScanState =
  | { kind: "idle" }
  | { kind: "scanning"; label: string }
  | { kind: "auditing"; label: string };

export function computeAccountScanState(domains: readonly DomainActivity[]): AccountScanState {
  const scanning = domains.filter((d) => Boolean(d.activeRun));

  if (scanning.length === 1) {
    const only = scanning[0];
    // Misma fuente que la pastilla de proyecto: si las dos superficies
    // calculasen la etapa por su cuenta podrían discrepar sobre el mismo run.
    const stage = computeScanStage(only.activeRun!);
    const verb = stage.kind === "analyzing" ? "Analizando" : "Escaneando";
    return { kind: "scanning", label: `${verb} ${only.domain}` };
  }

  if (scanning.length > 1) {
    return { kind: "scanning", label: `${scanning.length} dominios en curso` };
  }

  // Sólo se mira la auditoría cuando no hay ningún escaneo vivo.
  const auditing = domains.filter((d) => d.auditing);

  if (auditing.length === 1) {
    return { kind: "auditing", label: `Auditando ${auditing[0].domain}` };
  }

  if (auditing.length > 1) {
    return { kind: "auditing", label: `${auditing.length} auditorías en curso` };
  }

  return { kind: "idle" };
}
