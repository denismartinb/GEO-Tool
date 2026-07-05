"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { auditDomainCoverageAction } from "../actions";

/**
 * Triggers a coverage audit and lets the server-rendered "Auditoría web" page
 * pick up the (persisted) result on refresh — unlike the old ephemeral
 * domain-coverage-section.tsx, this component holds no coverage state of its
 * own, only the pending/error UI, so a page reload never loses the result.
 */
export function RunAuditButton({ projectId, canAudit }: { projectId: string; canAudit: boolean }) {
  const router = useRouter();
  const [isPending, startAudit] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startAudit(async () => {
      try {
        const result = await auditDomainCoverageAction({ projectId });
        if (!result.success) {
          setError(result.error);
          return;
        }
        router.refresh();
      } catch {
        setError("No se ha podido auditar la cobertura de tu dominio en este momento. Inténtalo de nuevo en unos minutos.");
      }
    });
  }

  if (!canAudit) {
    return (
      <span className="badge badge-outline">
        <Icon name="search" size={11} />
        Disponible en plan Pro
      </span>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <Button type="button" onClick={handleClick} disabled={isPending}>
        {isPending ? <span className="btn-spinner" /> : <Icon name="search" size={14} />}
        {isPending ? "Auditando…" : "Auditar ahora"}
      </Button>
      {error && (
        <p className="feedback error" style={{ margin: 0, fontSize: 12 }}>
          {error}
        </p>
      )}
    </div>
  );
}
