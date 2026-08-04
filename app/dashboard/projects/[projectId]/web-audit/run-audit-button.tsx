"use client";

import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { useWebAuditRunner } from "./web-audit-context";

/**
 * Triggers a coverage audit and lets the server-rendered "Auditoría web" page
 * pick up the (persisted) result on refresh — this component holds no
 * coverage state of its own beyond in-flight progress, so a page reload never
 * loses the result.
 *
 * ---------------------------------------------------------------------------
 * Two states, one label, one colour (founder review 2026-08-04, second pass
 * on this control):
 *
 *   - Auditoría actualizada → green pill saying so, button DISABLED. Clicking
 *     would be a no-op server-side (the audit already covers the newest
 *     scan), so the control says no up front instead of accepting the click
 *     and explaining afterwards.
 *   - Escaneo sin auditar → no pill at all, button enabled. There is new data
 *     to pull in; nothing else needs saying.
 *   - Auditando → no pill, no banner: the button itself carries the spinner
 *     and the live topic count.
 *
 * The first attempt at this had the button switch between `outline` and
 * `default` depending on freshness, which read as the button changing colour
 * for no reason ("primero blanco, luego azul, no tiene sentido"). It is now
 * always the primary button; only its enabled/disabled state moves. Same
 * reason the "Volver a auditar" label is gone — one control, one name.
 *
 * There is deliberately no transient "done" toast: `router.refresh()` on
 * completion re-renders this with `upToDate` true, so the pill IS the
 * confirmation. A toast on top of it said the same thing twice.
 */
export function RunAuditButton({
  canAudit,
  /** true = the stored audit covers the newest scan; false = a newer scan is unaudited; null = never audited. */
  upToDate = null
}: {
  canAudit: boolean;
  upToDate?: boolean | null;
}) {
  const { isPending, error, progress, drive } = useWebAuditRunner();

  if (!canAudit) {
    return (
      <span className="badge badge-outline">
        <Icon name="search" size={11} />
        Disponible en plan Pro
      </span>
    );
  }

  const progressLabel =
    progress && progress.total > progress.covered
      ? `Auditando… ${progress.covered}/${progress.total} temas`
      : "Auditando…";

  const isUpToDate = upToDate === true;

  return (
    <div className="wa2-auditbar">
      <div className="wa2-auditbar-state">
        {isUpToDate && !isPending && !error && (
          <span className="badge badge-pos">
            <Icon name="check" size={11} />
            Auditoría actualizada
          </span>
        )}
        {error && <span className="wa2-auditbar-error">{error}</span>}
      </div>

      <Button type="button" onClick={drive} disabled={isPending || isUpToDate}>
        {isPending ? <span className="btn-spinner" /> : <Icon name="search" size={14} />}
        {isPending ? progressLabel : "Auditar ahora"}
      </Button>
    </div>
  );
}
