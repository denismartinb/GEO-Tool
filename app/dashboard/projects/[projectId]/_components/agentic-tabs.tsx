import Link from "next/link";

/**
 * «Visibilidad en agentes» and «Auditoría agéntica» share one menu entry
 * (AGENTIC-COMMERCE-1 Fase 2d, log §330): the mobile drawer has no room for
 * another row (log §301), so these two tabs switch between the screens.
 */
export function AgenticTabs({ projectId, current }: { projectId: string; current: "visibility" | "audit" }) {
  const base = `/dashboard/projects/${projectId}`;
  return (
    <nav className="ag-tabs" aria-label="Comercio agéntico">
      <Link
        href={`${base}/agentic-visibility`}
        className="ag-tab"
        aria-current={current === "visibility" ? "page" : undefined}
      >
        Visibilidad en agentes
      </Link>
      <Link href={`${base}/agentic-audit`} className="ag-tab" aria-current={current === "audit" ? "page" : undefined}>
        Auditoría agéntica
      </Link>
    </nav>
  );
}
