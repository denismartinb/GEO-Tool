"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { runTechnicalAuditAction } from "../actions";

/**
 * Triggers "Auditar salud técnica GEO" (WEB-AUDIT-2). Unlike RunAuditButton
 * (domain coverage), this is a single deterministic server-action call — no
 * multi-batch campaign, no shared context: the check loop runs entirely
 * within one request under TECH_AUDIT_TOTAL_BUDGET_MS, so there is nothing
 * to resume across page loads.
 */
export function RunTechnicalAuditButton({ projectId, canAudit }: { projectId: string; canAudit: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!canAudit) {
    return (
      <span className="badge badge-outline">
        <Icon name="search" size={11} />
        Disponible en plan Pro
      </span>
    );
  }

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await runTechnicalAuditAction({ projectId });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <Button type="button" onClick={handleClick} disabled={isPending}>
        {isPending ? <span className="btn-spinner" /> : <Icon name="search" size={14} />}
        {isPending ? "Auditando…" : "Auditar salud técnica"}
      </Button>
      {error && (
        <p className="feedback error" style={{ margin: 0, fontSize: 12 }}>
          {error}
        </p>
      )}
    </div>
  );
}
