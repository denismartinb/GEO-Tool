"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { maturityBannerHiddenKey } from "@/components/data-maturity-banner";

/**
 * DEBUG-HIDE-NO-TRACKING-1, ampliado en MATURITY-BANNER-HIDE-ALL-1 (2026-08-27,
 * log §179): switch de esta pantalla para silenciar la banda de madurez de
 * datos (`DataMaturityBanner`, alimentada por `computeDataMaturity` en
 * `lib/project-workspace.ts`) sin tocar ningún ajuste real del proyecto.
 *
 * **Silencia todos los avisos informativos, no una lista de ellos.** Nació
 * cubriendo sólo "Tu análisis de hoy no se repetirá" y el fundador pidió que
 * cubriera también "el de histórico construyendo y cualquier similar que haya"
 * (2026-08-27). La clave está en ese "cualquier similar": la puerta enumera las
 * EXCEPCIONES (`NEVER_SILENCED`, hoy sólo `free`), no los cubiertos, así que un
 * `kind` futuro queda silenciado por no hacer nada.
 *
 * **Y nace encendido**: la ausencia de valor significa oculto, y sólo un `"0"`
 * explícito revela los avisos (PROJECT-DEFAULTS-BY-ACCOUNT-1, §173, tras la
 * prueba del fundador con una cuenta nueva).
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
  // Encendido por defecto: la ausencia de valor significa OCULTO y sólo un
  // `"0"` explícito revela los avisos (PROJECT-DEFAULTS-BY-ACCOUNT-1, §173).
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    setHidden(window.localStorage.getItem(maturityBannerHiddenKey(projectId)) !== "0");
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
          Silencia en este navegador los avisos informativos de la consola: «Tu análisis de hoy no se
          repetirá», «Tu histórico se está construyendo» y cualquiera que se añada más adelante. El
          aviso del plan Free no se calla nunca — ése tiene su propia X. No cambia ningún ajuste del
          proyecto, sólo oculta los avisos. <b>Encendido por defecto.</b>
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
