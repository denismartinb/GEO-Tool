"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { auditDomainCoverageAction } from "../actions";

// Hard cap on how many times this drives the server action for one campaign
// (WEB-AUDIT-CHAIN, mirrors AutoExecuteScan/SCAN-CHAIN-1). Each call audits up
// to a batch's worth of topics server-side; a very large prompt set (e.g. the
// Agency plan's 300-prompt ceiling at ~6 topics/batch) needs well under this
// many windows — the cap only exists to guarantee the loop always terminates.
const MAX_DRIVE_ITERATIONS = 60;
const PACING_DELAY_MS = 1_200;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Triggers a coverage audit and lets the server-rendered "Auditoría web" page
 * pick up the (persisted) result on refresh — unlike the old ephemeral
 * domain-coverage-section.tsx, this component holds no coverage state of its
 * own beyond in-flight progress, so a page reload never loses the result.
 *
 * WEB-AUDIT-CHAIN: a project with more active prompts than one batch can
 * cover (BATCH_TOPICS_PER_CALL in domain-coverage.ts) needs several chained
 * server-action calls to complete a campaign — this loops
 * `auditDomainCoverageAction` from the founder's own authenticated session
 * (mirroring AutoExecuteScan's foreground-only driver; see ADR-0014) until the
 * campaign's `status` comes back "completed", showing real progress
 * (`covered / total temas`) along the way instead of an all-or-nothing
 * spinner. Closing the tab mid-campaign just leaves it "running" — the next
 * click resumes from wherever it left off (no lost work, no stuck state).
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
  const [progress, setProgress] = useState<{ covered: number; total: number } | null>(null);

  function handleClick() {
    setError(null);
    setNotice(null);
    setProgress(null);
    startAudit(async () => {
      for (let i = 0; i < MAX_DRIVE_ITERATIONS; i += 1) {
        let result;
        try {
          result = await auditDomainCoverageAction({ projectId });
        } catch {
          setError("No se ha podido auditar la cobertura de tu dominio en este momento. Inténtalo de nuevo en unos minutos.");
          return;
        }

        if (!result.success) {
          setError(result.error);
          return;
        }

        setProgress({ covered: result.coverage.topics.length, total: result.totalPrompts });

        if (result.status === "completed") {
          setNotice(
            result.cached
              ? "Ya tenías la auditoría más reciente de este escaneo. Vuelve a lanzar un escaneo para auditar datos nuevos."
              : "Auditoría actualizada."
          );
          router.refresh();
          return;
        }

        await delay(PACING_DELAY_MS);
      }

      // Hit the iteration cap without completing (very large prompt sets) —
      // refresh anyway so the partial progress made so far is visible; the
      // campaign stays "running" and the next click resumes it.
      router.refresh();
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

  const progressLabel = progress && progress.total > progress.covered ? `Auditando… ${progress.covered}/${progress.total} temas` : "Auditando…";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <Button type="button" onClick={handleClick} disabled={isPending}>
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
