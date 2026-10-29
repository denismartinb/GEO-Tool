"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Seg } from "@/components/ins/kit/seg";

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

  // The «+N pt si arreglas…» line of a block card links to `#problemas`.
  useEffect(() => {
    const sync = () => {
      if (window.location.hash === "#problemas") {
        setTab("problemas");
        document.getElementById("problemas")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  return <AuditTabsContext.Provider value={{ tab, setTab }}>{children}</AuditTabsContext.Provider>;
}

export type AuditTabCounts = Record<AuditTabId, number>;

export function AuditTabBar({ counts }: { counts: AuditTabCounts }) {
  const { tab, setTab } = useAuditTabs();
  const options: ReadonlyArray<readonly [AuditTabId, string]> = [
    ["problemas", `Problemas · ${counts.problemas}`],
    ["correcto", `Correcto · ${counts.correcto}`],
    ["paginas", `Páginas · ${counts.paginas}`]
  ];
  return (
    <div className="sc-au-tabs">
      <Seg label="Secciones del bloque" options={options} value={tab} onChange={setTab} />
    </div>
  );
}

export function AuditTabPanel({ id, children }: { id: AuditTabId; children: ReactNode }) {
  const { tab } = useAuditTabs();
  // hidden (not unmounted): keeps server-rendered content alive so <details>
  // expand/collapse state and scroll position survive tab switches.
  return (
    <div role="tabpanel" id={id} hidden={tab !== id}>
      {children}
    </div>
  );
}
