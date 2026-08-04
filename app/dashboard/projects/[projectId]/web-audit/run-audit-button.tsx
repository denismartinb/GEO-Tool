"use client";

import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { useWebAuditRunner } from "./web-audit-context";

/**
 * Triggers a coverage audit and lets the server-rendered "Auditoría web" page
 * pick up the (persisted) result on refresh — unlike the old ephemeral
 * domain-coverage-section.tsx, this component holds no coverage state of its
 * own beyond in-flight progress, so a page reload never loses the result.
 *
 * Both instances on the page read/drive the SAME campaign via
 * `useWebAuditRunner` — a single `WebAuditProvider` higher up the tree owns
 * the actual state, so clicking either shows the other as loading too.
 *
 * ---------------------------------------------------------------------------
 * UX rebuilt 2026-08-04 (founder review, with the redesign asked for
 * explicitly: "dale una vuelta a la UX de ese botón — dónde tiene que estar,
 * cuáles son sus estados").
 *
 * What was wrong: the button floated alone above the hero with no anchor, and
 * everything it had to say was said only AFTER a click, as a right-aligned
 * paragraph underneath. The "already fresh" case ran two sentences over three
 * lines, and its leading check icon — inline in a right-aligned block — broke
 * onto its own line at the far left. So the layout looked wrong, and the one
 * piece of information that would have saved the click ("this is already up
 * to date") was only reachable BY clicking.
 *
 * The model now: freshness is a STATE shown before you act, not a receipt
 * printed after. `upToDate` comes from the server (does the stored audit
 * cover the newest scan?), and drives both the pill and the button's weight:
 *
 *   - Sin auditar (`upToDate === null`) → primary "Auditar ahora", no pill.
 *     The empty-state card already explains what auditing does.
 *   - Escaneo sin auditar (`false`) → amber pill + primary button: there IS
 *     new data to pull in, so the action is worth the visual weight.
 *   - Al día (`true`) → green pill + outline button "Volver a auditar":
 *     clicking is allowed but pointless, and the button says so by receding
 *     instead of by rejecting the user afterwards.
 *   - Auditando → spinner + live topic count, same as before.
 *
 * Confirmations shrank to a few words and render as a flex row, so the icon
 * can never orphan itself again regardless of wrapping.
 */
export function RunAuditButton({
  canAudit,
  /** true = the stored audit covers the newest scan; false = a newer scan is unaudited; null = never audited. */
  upToDate = null
}: {
  canAudit: boolean;
  upToDate?: boolean | null;
}) {
  const { isPending, error, notice, progress, drive } = useWebAuditRunner();

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

  // While a campaign is in flight the pill would contradict the spinner
  // ("Al día" next to "Auditando…"), so state yields to progress.
  const showPill = !isPending && !error && upToDate !== null;

  return (
    <div className="wa2-auditbar">
      <div className="wa2-auditbar-state">
        {showPill &&
          (upToDate ? (
            <span className="badge badge-pos">
              <Icon name="check" size={11} />
              Al día
            </span>
          ) : (
            <span className="badge badge-warn">Escaneo sin auditar</span>
          ))}
        {notice && !error && (
          <span className="wa2-auditbar-notice">
            <Icon name="check" size={11} />
            {notice}
          </span>
        )}
        {error && <span className="wa2-auditbar-error">{error}</span>}
      </div>

      <Button
        type="button"
        onClick={drive}
        disabled={isPending}
        variant={upToDate === true && !isPending ? "outline" : "default"}
      >
        {isPending ? <span className="btn-spinner" /> : <Icon name="search" size={14} />}
        {isPending ? progressLabel : upToDate === true ? "Volver a auditar" : "Auditar ahora"}
      </Button>
    </div>
  );
}
