"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * Tab state for each block of the audit screen: Problemas, Correcto and
 * Páginas. Every panel is server-rendered once and passed in as children;
 * switching tabs only toggles visibility, so there is no client refetch and
 * <details> keep their open state.
 *
 * History: the three tabs date from WEB-AUDIT-ISSUES-1 fase 2 (founder-
 * approved 2026-08-02). SEARCH-SEO-1 Fase 1b first replaced them with one
 * filtered list; the founder asked for them back (2026-10-10), and they now
 * live inside each block, GEO and SEO (log §275). Switching block is a link,
 * not a tab, and keeps the tab you were on.
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
    <div style={{ overflowX: "auto" }}>
      <div className="seg" role="tablist" aria-label="Secciones del bloque">
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
