"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { maturityBannerHiddenKey } from "@/components/data-maturity-banner";

/**
 * DEBUG-HIDE-NO-TRACKING-1, ampliado en MATURITY-BANNER-HIDE-ALL-1 (2026-08-27,
 * log §174): switch de esta pantalla para silenciar la banda de madurez de
 * datos (`DataMaturityBanner`, alimentada por `computeDataMaturity` en
 * `lib/project-workspace.ts`) sin tocar ningún ajuste real del proyecto.
 *
 * **Silencia la banda entera.** Nació cubriendo sólo "Tu análisis de hoy no se
 * repetirá" y el fundador pidió que cubriera también "el de histórico
 * construyendo y cualquier similar que haya" (2026-08-27). No enumera estados:
 * la comprobación vive antes del reparto por `kind`, así que un estado nuevo
 * queda cubierto sin que nadie tenga que acordarse.
 *
 * Preferencia puramente local (`localStorage`, misma clave que lee
 * `DataMaturityBanner`) — no hay migración detrás, igual que el "ya visto" del
 * tour (`.claude/rules/onboarding.md`). El coste asumido: la preferencia no
 * viaja entre navegadores ni dispositivos.
 *
 * Vive junto a `page.tsx` (no en `components/`) porque usa las clases
 * `dbg-switch*` de `app/console.css`, que `tests/console-css-scope.test.ts`
 * exige que sólo aparezcan bajo `app/dashboard/**`.
 */
export function MaturityBannerToggle({ projectId }: { projectId: string }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(window.localStorage.getItem(maturityBannerHiddenKey(projectId)) === "1");
  }, [projectId]);

  function toggle() {
    const next = !hidden;
    window.localStorage.setItem(maturityBannerHiddenKey(projectId), next ? "1" : "0");
    setHidden(next);
  }

  return (
    <div className="card dbg-switch">
      <div className="dbg-switch-ico" data-on={hidden ? "true" : "false"}>
        <Icon name="bell" size={17} />
      </div>
      <div className="dbg-switch-txt">
        <b>Ocultar los avisos de la banda superior</b>
        <small>
          Silencia en este navegador toda la banda de avisos de la consola: «Tu análisis de hoy no se
          repetirá», «Tu histórico se está construyendo», el aviso del plan Free y cualquiera que se
          añada más adelante. No cambia ningún ajuste del proyecto — sólo oculta los avisos.
        </small>
      </div>
      <button
        type="button"
        onClick={toggle}
        className={`switch-toggle ${hidden ? "on" : ""}`}
        role="switch"
        aria-checked={hidden}
        aria-label="Ocultar los avisos de la banda superior"
      />
    </div>
  );
}
