"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { noTrackingHiddenKey } from "@/components/data-maturity-banner";

/**
 * DEBUG-HIDE-NO-TRACKING-1: switch de esta pantalla para silenciar los dos
 * avisos informativos de `DataMaturityBanner` (`lib/project-workspace.ts`)
 * que no piden ninguna acción salvo esperar o activar el seguimiento —
 * "Tu análisis de hoy no se repetirá" (`no_tracking`) y "Tu histórico se está
 * construyendo. Escaneo N de 5" (`accumulating`) — sin activar el
 * seguimiento diario real. Preferencia puramente local (`localStorage`,
 * misma clave que lee `DataMaturityBanner`) — no hay migración detrás, igual
 * que el "ya visto" del tour (`.claude/rules/onboarding.md`). El coste
 * asumido: la preferencia no viaja entre navegadores ni dispositivos.
 *
 * PROJECT-DEFAULTS-BY-ACCOUNT-1 (corrección tras prueba del fundador,
 * 2026-08-27): por defecto oculto, no visible. La ausencia de valor en
 * `localStorage` significaba "mostrar" — ruidoso para cualquier cuenta real,
 * que ahora nace con el seguimiento y ve el banner de progreso en su primer
 * escaneo. Sólo un `"0"` explícito (el usuario apagó el switch a mano) vuelve
 * a mostrar los avisos.
 *
 * Vive junto a `page.tsx` (no en `components/`) porque usa las clases
 * `dbg-switch*` de `app/console.css`, que `tests/console-css-scope.test.ts`
 * exige que sólo aparezcan bajo `app/dashboard/**`.
 */
export function NoTrackingBannerToggle({ projectId }: { projectId: string }) {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    setHidden(window.localStorage.getItem(noTrackingHiddenKey(projectId)) !== "0");
  }, [projectId]);

  function toggle() {
    const next = !hidden;
    window.localStorage.setItem(noTrackingHiddenKey(projectId), next ? "1" : "0");
    setHidden(next);
  }

  return (
    <div className="card dbg-switch">
      <div className="dbg-switch-ico" data-on={hidden ? "true" : "false"}>
        <Icon name="bell" size={17} />
      </div>
      <div className="dbg-switch-txt">
        <b>Ocultar aviso «seguimiento diario»</b>
        <small>
          Silencia en este navegador los mensajes "Tu análisis de hoy no se repetirá" y "Tu histórico se
          está construyendo" que aparecen en la consola. No activa ni desactiva el seguimiento — sólo
          oculta los avisos. Encendido por defecto.
        </small>
      </div>
      <button
        type="button"
        onClick={toggle}
        className={`switch-toggle ${hidden ? "on" : ""}`}
        role="switch"
        aria-checked={hidden}
        aria-label="Ocultar aviso de seguimiento diario"
      />
    </div>
  );
}
