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
 * This renders in two places on the page (sticky header, and the empty-state
 * card) but both read/drive the SAME campaign via `useWebAuditRunner` — a
 * single `WebAuditProvider` higher up the tree owns the actual state, so
 * clicking either instance shows the other as loading too (founder report:
 * before this, each button was its own independent useState and the header
 * button stayed idle while the card button drove the campaign).
 */
export function RunAuditButton({ canAudit }: { canAudit: boolean }) {
  const { isPending, error, notice, progress, drive } = useWebAuditRunner();

  if (!canAudit) {
    return (
      <span className="badge badge-outline">
        <Icon name="search" size={11} />
        Disponible en plan Pro
      </span>
    );
  }

  const progressLabel = progress && progress.total > progress.covered ? `Auditando… ${progress.covered}/${progress.total} temas` : "Auditando…";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <Button type="button" onClick={drive} disabled={isPending}>
        {isPending ? <span className="btn-spinner" /> : <Icon name="search" size={14} />}
        {isPending ? progressLabel : "Auditar ahora"}
      </Button>
      {error && (
        <p className="feedback error" style={{ margin: 0, fontSize: 12 }}>
          {error}
        </p>
      )}
      {notice && !error && (
        <p style={{ margin: 0, fontSize: 12, color: "var(--ink-3)", textAlign: "right", maxWidth: 280 }}>
          <Icon name="check" size={11} /> {notice}
        </p>
      )}
    </div>
  );
}
