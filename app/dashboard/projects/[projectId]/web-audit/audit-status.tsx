"use client";

import { Icon } from "@/components/ui/icon";
import { useWebAuditRunner } from "./web-audit-context";

/**
 * State of the web audit. **Not a control** — there is nothing to press here.
 *
 * The «Auditar ahora» button lived here until AUDIT-NO-BUTTON-1 (founder,
 * 2026-08-05: "quita el botón auditar ahora y pon la fecha en auditoría
 * actualizada"). Since AUDIT-AFTER-SCAN-1 the audit runs on its own after
 * every scan, so a button asking the user to trigger what already happens was
 * offering work the product had stopped needing — and, worse, implying the
 * audit waits for a human when it does not.
 *
 * What is left says three true things and nothing else:
 *
 *   - `Auditoría actualizada · {fecha}` — the stored audit covers the newest
 *     scan, and this is when it ran. The date is here rather than only in the
 *     header because the state and its "when" are one fact, not two.
 *   - `Auditando…` with the live topic count — a campaign is being driven
 *     right now (see below: this still happens, just never because of a
 *     click).
 *   - `Pendiente del último escaneo` — a newer scan exists that the audit has
 *     not caught up with yet. Honest rather than reassuring: the queue can
 *     take a while, and saying nothing would read as "up to date".
 *
 * Nothing at all when the project has never been audited: an empty state
 * elsewhere on the page already covers that, and a pill saying "nunca" would
 * just be noise on a brand-new project.
 *
 * ---------------------------------------------------------------------------
 * Why this still reads in-flight state with no button to start anything
 *
 * `WebAuditProvider` resumes an unfinished campaign by itself on mount, and
 * that is deliberately kept: a campaign parked mid-flight finishes when
 * someone opens the page instead of waiting for the queue's next turn. It
 * costs no extra Gemini — it is the same work the backend would do — and it
 * is what let the screen self-heal on 2026-08-04 while the queue was draining
 * slowly. The user never asks for it and never sees a control for it; they
 * just see it happening.
 */
export function AuditStatus({
  canAudit,
  /** true = the stored audit covers the newest scan; false = a newer scan is unaudited; null = never audited. */
  upToDate = null,
  /** When the stored audit ran. Rendered next to "Auditoría actualizada". */
  auditedAt = null
}: {
  canAudit: boolean;
  upToDate?: boolean | null;
  auditedAt?: string | null;
}) {
  const { isPending, error, progress } = useWebAuditRunner();

  if (!canAudit) {
    return (
      <span className="badge badge-outline">
        <Icon name="search" size={11} />
        Disponible en plan Pro
      </span>
    );
  }

  if (isPending) {
    const label =
      progress && progress.total > progress.covered
        ? `Auditando… ${progress.covered}/${progress.total} temas`
        : "Auditando…";
    return (
      <div className="wa2-auditbar">
        <div className="wa2-auditbar-state">
          <span className="badge badge-accent">
            <span className="btn-spinner" />
            {label}
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="wa2-auditbar">
        <div className="wa2-auditbar-state">
          <span className="wa2-auditbar-error">{error}</span>
        </div>
      </div>
    );
  }

  if (upToDate === null) return null;

  return (
    <div className="wa2-auditbar">
      <div className="wa2-auditbar-state">
        {upToDate ? (
          <span className="badge badge-pos">
            <Icon name="check" size={11} />
            Auditoría actualizada{auditedAt ? ` · ${auditedAt}` : ""}
          </span>
        ) : (
          // Not silence: without this the page looks current while it is a
          // scan behind. The audit is queued and will land on its own, so the
          // copy states the fact and asks nothing of the user.
          <span className="badge badge-neutral" title="Se auditará automáticamente">
            Pendiente del último escaneo
          </span>
        )}
      </div>
    </div>
  );
}
