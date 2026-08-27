"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { noTrackingHiddenKey } from "@/components/data-maturity-banner";

/**
 * DEBUG-HIDE-NO-TRACKING-1: switch de esta pantalla para silenciar el aviso
 * "Tu análisis de hoy no se repetirá" (el estado `no_tracking` de
 * `computeDataMaturity`, `lib/project-workspace.ts`) sin activar el
 * seguimiento diario real. Preferencia puramente local (`localStorage`,
 * misma clave que lee `DataMaturityBanner`) — no hay migración detrás, igual
 * que el "ya visto" del tour (`.claude/rules/onboarding.md`). El coste
 * asumido: la preferencia no viaja entre navegadores ni dispositivos.
 *
 * Vive junto a `page.tsx` (no en `components/`) porque usa las clases
 * `dbg-switch*` de `app/console.css`, que `tests/console-css-scope.test.ts`
 * exige que sólo aparezcan bajo `app/dashboard/**`.
 */
export function NoTrackingBannerToggle({ projectId }: { projectId: string }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(window.localStorage.getItem(noTrackingHiddenKey(projectId)) === "1");
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
          Silencia en este navegador el mensaje "Tu análisis de hoy no se repetirá" que aparece en la
          consola mientras el seguimiento diario esté apagado. No activa ni desactiva el seguimiento —
          sólo oculta el aviso.
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
