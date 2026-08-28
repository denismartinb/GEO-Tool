"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runTechnicalAuditAction } from "../actions";
import { useWebAuditRunner } from "./web-audit-context";

/**
 * AUDIT-RUNNABLE-1 (docs/external-audit-2026-08.md, Fase 5) — reinstates the
 * recovery path AUDIT-NO-BUTTON-1 (2026-08-05, log §25) removed on the
 * premise that "la auditoría ya corre sola tras cada escaneo". That premise
 * held until it didn't: the external audit found the technical component
 * stuck at N/A after a real scan, with no button, no error, no explanation —
 * the exact dead end §25 flagged as an accepted risk ("ya no hay escotilla
 * manual") and CLAUDE.md's Corrección E now requires closing out explicitly.
 *
 * One button, not two. WEB-AUDIT-R2 already merged the old "Auditar ahora"
 * (coverage) and "Auditar salud técnica" (technical) into a single click for
 * Pro accounts — `useWebAuditRunner().drive()` runs coverage then piggybacks
 * technical. A non-Pro account never had a coverage half to run, so its
 * click goes straight to `runTechnicalAuditAction` instead of through
 * `drive()`, which would otherwise hit the coverage plan gate first and
 * surface a "no incluido en tu plan" error for the one thing the button
 * promised to do.
 *
 * `role="button"`/accessible name "Auditar ahora" is a fixed contract:
 * `tests/pilot/journeys/write/seed-web-audit.spec.ts` (UX-PILOT-2b) already
 * looks for exactly this control and has since before this button existed.
 */
export function WebAuditRunButton({
  projectId,
  canAuditCoverage,
  alreadyRunning
}: {
  projectId: string;
  canAuditCoverage: boolean;
  /** Server-derived: an audit (job or coverage campaign) is already live — another tab/driver, or the daily cron. */
  alreadyRunning: boolean;
}) {
  const coverageRunner = useWebAuditRunner();
  const router = useRouter();
  const [isTechPending, startTechTransition] = useTransition();
  const [techError, setTechError] = useState<string | null>(null);

  const isPending = canAuditCoverage ? coverageRunner.isPending : isTechPending;
  const disabled = isPending || alreadyRunning;

  function handleClick() {
    if (canAuditCoverage) {
      coverageRunner.drive();
      return;
    }
    setTechError(null);
    startTechTransition(async () => {
      const result = await runTechnicalAuditAction({ projectId });
      if (!result.success) {
        setTechError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <button type="button" className="btn btn-primary btn-sm" onClick={handleClick} disabled={disabled}>
        {isPending ? "Auditando…" : "Auditar ahora"}
      </button>
      {/* Only this button's own errors — WebAuditDriveNotice already covers
          the coverage-driven path's error, so surfacing it twice would
          repeat the exact "hueco" lesson §25 documents. */}
      {!canAuditCoverage && techError && (
        <span style={{ fontSize: 11, color: "var(--neg-ink)", maxWidth: 220, textAlign: "right" }}>{techError}</span>
      )}
    </div>
  );
}
