import Link from "next/link";

/**
 * ONBOARDING-ROCKET-1 — the compact half of the mission
 * (`docs/design-reference/scan-states-1/rev3-cohete-secuencia.html`, section
 * "La misión suelta la pantalla a mitad").
 *
 * Renders only in Visión general, only right after the first scan's data
 * appears (`hasData`), only while a `web_audit` job for this project is
 * still `pending`/`running`/`retrying` — `page.tsx` decides all three and
 * passes nothing but that boolean here.
 *
 * Deliberately no progress fraction ("N de M temas"): the coverage-map
 * parsing that produces a real count lives in the web-audit page
 * (`generated_solutions` + `parseCoverageMap`) and pulling it into Visión
 * general would be a second, heavier read this phase does not take on — see
 * the Task Intake for ONBOARDING-ROCKET-1. Once that count is wired here,
 * this is the only file that needs to change.
 *
 * Deliberately no email promise: the "te avisamos cuando esté" phase
 * (SCAN-STATES-1 rev.1, fase 2) has no backend yet — no queue column, no
 * send, no template. Promising it here would be exactly the kind of
 * UI-ahead-of-backend gap CLAUDE.md's "no fake product behavior" rule
 * exists to catch.
 */
export function ScanMissionBand({ projectId }: { projectId: string }) {
  return (
    <Link href={`/dashboard/projects/${projectId}/web-audit`} className="mba-band">
      <span className="mba-ico" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18">
          <path
            d="M12 3q3.4 3.2 3.4 7.8v4.6h-6.8v-4.6Q8.6 6.2 12 3Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path d="M8.6 15.4L6 20.4l2.6-1.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M15.4 15.4L18 20.4l-2.6-1.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="12" cy="9.5" r="1.4" fill="currentColor" />
        </svg>
      </span>
      <span className="mba-txt">
        <span className="mba-t">Revisando tu web</span>
        <span className="mba-s">La auditoría técnica sigue en marcha. No hace falta que esperes aquí.</span>
      </span>
      <span className="mba-dot" aria-hidden="true" />
    </Link>
  );
}
