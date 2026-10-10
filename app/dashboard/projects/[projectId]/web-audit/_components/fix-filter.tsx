"use client";

import { useState, type ReactNode } from "react";
import type { FixFilter } from "@/lib/web-audit/seo-audit-view";

/**
 * The severity filter of «Qué arreglar». The rows are server-rendered once
 * and passed in as children; the filter only sets `data-filter` on their
 * wrapper and CSS hides the rest, so an open row keeps its state when the
 * filter changes.
 */

const FILTERS: Array<{ id: FixFilter; label: string; dot?: string }> = [
  { id: "all", label: "Todo" },
  { id: "critical", label: "Crítico", dot: "sa-dot-critical" },
  { id: "warning", label: "Aviso", dot: "sa-dot-warning" },
  { id: "improvement", label: "Mejora", dot: "sa-dot-improvement" },
  { id: "ok", label: "Bien", dot: "sa-dot-ok" }
];

export function FixFilterGroup({ counts, children }: { counts: Record<FixFilter, number>; children: ReactNode }) {
  const [filter, setFilter] = useState<FixFilter>("all");
  return (
    <>
      <div className="sa-filters" role="group" aria-label="Filtrar por gravedad">
        {FILTERS.filter((f) => f.id === "all" || counts[f.id] > 0).map((f) => (
          <button
            key={f.id}
            type="button"
            className="sa-filter"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.dot && <span className={`sa-dot ${f.dot}`} aria-hidden="true" />}
            {f.label} <b>{counts[f.id]}</b>
          </button>
        ))}
      </div>
      <div className="sa-issues" data-filter={filter}>
        {children}
      </div>
    </>
  );
}
