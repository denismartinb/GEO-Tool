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
 * own, only the pending/feedback UI, so a page reload never loses the result.
 */
export function RunAuditButton({ projectId, canAudit }: { projectId: string; canAudit: boolean }) {
  const router = useRouter();
  const [isPending, startAudit] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Explicit success feedback. Without it, a cache hit (a re-audit of the same
  // scan returns the already-stored map) re-rendered identical content and the
  // button felt dead — "parece que no hace nada". We now confirm the click and,
  // on a cache hit, say why nothing changed.
  const [notice, setNotice] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    setNotice(null);
    startAudit(async () => {
      try {
        const result = await auditDomainCoverageAction({ projectId });
        if (!result.success) {
          setError(result.error);
          return;
        }
        setNotice(
          result.cached
            ? "Ya tenías la auditoría más reciente de este escaneo. Vuelve a lanzar un escaneo para auditar datos nuevos."
            : "Auditoría actualizada."
        );
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
      {notice && !error && (
        <p style={{ margin: 0, fontSize: 12, color: "var(--ink-3)", textAlign: "right", maxWidth: 280 }}>
          <Icon name="check" size={11} /> {notice}
        </p>
      )}
    </div>
  );
}
