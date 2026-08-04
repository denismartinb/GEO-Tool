"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * Tab state for the "Auditoría web" page. Every panel's content is
 * server-rendered once and passed in as children; switching tabs only
 * toggles visibility (CSS hidden), so there is no client-side refetch, no
 * loss of <details> open/closed state, and no serialization of Supabase
 * data into client props beyond what each small client component receives
 * explicitly.
 *
 * WEB-AUDIT-ISSUES-1 fase 2 (founder-approved 2026-08-02, design artifact
 * "Auditoría web — opción B especificada" rev. 4, refined after founder
 * review of the shipped preview): "Resumen" and the old "Salud técnica" tab
 * merge into one "Problemas" tab. A new "Correcto" tab is the
 * founder-requested mirror: the checks that already pass, tachados with
 * their check verde. "Páginas" (renamed from "tecnica") keeps its per-page
 * table + bots panel unchanged.
 *
 * The Plan de acción / opportunity matrix / filter-chip machinery this file
 * used to own (QuadrantButton, ActionFilterBar, ActionRowVisibility,
 * PlanExpander, the `filter` state) was removed in the same founder review:
 * "toda la tabla de plan de acción no tiene sentido aquí... debe estar en
 * la página de recomendaciones" and "la matriz de oportunidad no estaba en
 * el artefacto". This file is deliberately just tab state now — nothing
 * else on this page needs a shared client context.
 */

export type AuditTabId = "problemas" | "correcto" | "paginas";

interface AuditTabsState {
  tab: AuditTabId;
  setTab: (tab: AuditTabId) => void;
}

const AuditTabsContext = createContext<AuditTabsState | null>(null);

function useAuditTabs(): AuditTabsState {
  const ctx = useContext(AuditTabsContext);
  if (!ctx) throw new Error("useAuditTabs must be used within AuditTabsProvider");
  return ctx;
}

export function AuditTabsProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<AuditTabId>("problemas");

  return <AuditTabsContext.Provider value={{ tab, setTab }}>{children}</AuditTabsContext.Provider>;
}

const TAB_LABELS: Array<{ id: AuditTabId; label: string }> = [
  { id: "problemas", label: "Problemas" },
  { id: "correcto", label: "Correcto" },
  { id: "paginas", label: "Páginas" }
];

export function AuditTabBar() {
  const { tab, setTab } = useAuditTabs();
  return (
    <div style={{ overflowX: "auto", marginTop: 14 }}>
      <div className="seg" role="tablist" aria-label="Secciones de la auditoría">
        {TAB_LABELS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "on" : undefined}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AuditTabPanel({ id, children }: { id: AuditTabId; children: ReactNode }) {
  const { tab } = useAuditTabs();
  // hidden (not unmounted): keeps server-rendered content alive so <details>
  // expand/collapse state and scroll position survive tab switches.
  return (
    <div role="tabpanel" hidden={tab !== id}>
      {children}
    </div>
  );
}
