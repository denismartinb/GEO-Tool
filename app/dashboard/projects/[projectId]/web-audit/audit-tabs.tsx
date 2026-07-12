"use client";

import { createContext, useContext, useState, type CSSProperties, type ReactNode } from "react";

/**
 * Tab + topic-filter state for the restructured "Auditoría web" page
 * (WEB-AUDIT-R1). Every panel's content is server-rendered once and passed in
 * as children; switching tabs only toggles visibility (CSS hidden), so there
 * is no client-side refetch, no loss of <details> open/closed state, and no
 * serialization of Supabase data into client props beyond what each small
 * client component receives explicitly.
 *
 * The filter exists so the opportunity matrix can act as navigation: tapping
 * a quadrant jumps to the "Contenido" tab already filtered to that quadrant's
 * topics, instead of listing (truncated) topic chips inside the quadrant
 * itself — the founder-reported "everything appears three times" redundancy.
 */

export type AuditTabId = "resumen" | "contenido" | "tecnica" | "evolucion";

/**
 * "no_content" is the combined bottom-left matrix quadrant
 * (content_gap + open_opportunity) — the matrix presents them as one cell, so
 * its tap target filters to both at once. The individual filter chips in the
 * Contenido tab still address each outcome separately.
 */
export type TopicFilterId =
  | "all"
  | "performing"
  | "invisible"
  | "content_gap"
  | "open_opportunity"
  | "unverified_cited"
  | "inconclusive"
  | "no_content";

interface AuditTabsState {
  tab: AuditTabId;
  setTab: (tab: AuditTabId) => void;
  filter: TopicFilterId;
  setFilter: (filter: TopicFilterId) => void;
  openTopics: (filter: TopicFilterId) => void;
}

const AuditTabsContext = createContext<AuditTabsState | null>(null);

function useAuditTabs(): AuditTabsState {
  const ctx = useContext(AuditTabsContext);
  if (!ctx) throw new Error("useAuditTabs must be used within AuditTabsProvider");
  return ctx;
}

export function AuditTabsProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<AuditTabId>("resumen");
  const [filter, setFilter] = useState<TopicFilterId>("all");

  function openTopics(nextFilter: TopicFilterId) {
    setFilter(nextFilter);
    setTab("contenido");
  }

  return (
    <AuditTabsContext.Provider value={{ tab, setTab, filter, setFilter, openTopics }}>
      {children}
    </AuditTabsContext.Provider>
  );
}

const TAB_LABELS: Array<{ id: AuditTabId; label: string }> = [
  { id: "resumen", label: "Resumen" },
  { id: "contenido", label: "Contenido" },
  { id: "tecnica", label: "Salud técnica" },
  { id: "evolucion", label: "Evolución" }
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

/** Small "ver →" navigation affordance used by the Resumen one-liners. */
export function GoToTabButton({ tab, children }: { tab: AuditTabId; children: ReactNode }) {
  const { setTab } = useAuditTabs();
  return (
    <button
      type="button"
      onClick={() => setTab(tab)}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        font: "inherit",
        fontSize: 12,
        fontWeight: 650,
        color: "var(--accent)",
        cursor: "pointer",
        whiteSpace: "nowrap"
      }}
    >
      {children}
    </button>
  );
}

const QUADRANT_TONES: Record<string, { bg: string; fg: string; border: string }> = {
  pos: { bg: "var(--pos-soft)", fg: "var(--pos-ink)", border: "var(--pos-soft)" },
  warn: { bg: "var(--warn-soft)", fg: "var(--warn-ink)", border: "var(--warn-soft)" },
  neg: { bg: "var(--neg-soft)", fg: "var(--neg-ink)", border: "var(--neg-soft)" },
  neutral: { bg: "var(--surface-2)", fg: "var(--ink-3)", border: "var(--line)" }
};

/**
 * A matrix quadrant as a tap target: count + hint only (no topic chips — the
 * topics themselves live once, in the Contenido tab). Tapping filters the
 * Contenido tab to this quadrant's outcome(s) and switches to it.
 */
export function QuadrantButton({
  title,
  count,
  tone,
  hint,
  target,
  extra
}: {
  title: string;
  count: number;
  tone: "pos" | "warn" | "neg" | "neutral";
  hint: string;
  target: TopicFilterId;
  extra?: ReactNode;
}) {
  const { openTopics } = useAuditTabs();
  const v = QUADRANT_TONES[tone];
  return (
    <button
      type="button"
      onClick={() => openTopics(target)}
      style={{
        borderRadius: 10,
        padding: "12px 12px 10px",
        border: `1px solid ${v.border}`,
        background: v.bg,
        minHeight: 92,
        minWidth: 0,
        textAlign: "left",
        cursor: "pointer",
        font: "inherit",
        display: "flex",
        flexDirection: "column",
        gap: 2
      }}
    >
      <span style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 11.5, fontWeight: 750, color: v.fg }}>
        <span style={{ minWidth: 0 }}>{title}</span>
        <span style={{ marginLeft: "auto", fontSize: 22, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
          {count}
        </span>
      </span>
      <span style={{ fontSize: 10.5, color: "var(--ink-3)" }}>{hint}</span>
      {extra}
      <span style={{ marginTop: "auto", paddingTop: 4, fontSize: 11, fontWeight: 650, color: "var(--accent)" }}>
        Ver temas →
      </span>
    </button>
  );
}

export type TopicFilterCount = { id: TopicFilterId; label: string; count: number };

/** Filter chips above the topic list in the Contenido tab. */
export function TopicFilterBar({ options }: { options: TopicFilterCount[] }) {
  const { filter, setFilter } = useAuditTabs();
  const chipStyle = (active: boolean): CSSProperties => ({
    border: active ? "1px solid var(--accent)" : "1px solid var(--line)",
    background: active ? "var(--accent-soft)" : "var(--surface)",
    color: active ? "var(--accent-ink)" : "var(--ink-2)",
    borderRadius: 999,
    padding: "4px 11px",
    fontSize: 11.5,
    fontWeight: 650,
    cursor: "pointer",
    font: "inherit",
    whiteSpace: "nowrap"
  });
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "10px 0 12px" }}>
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          aria-pressed={filter === opt.id}
          style={chipStyle(filter === opt.id)}
          onClick={() => setFilter(opt.id)}
        >
          {opt.label}
          {opt.id !== "all" && <span style={{ opacity: 0.75 }}> · {opt.count}</span>}
        </button>
      ))}
    </div>
  );
}

const NO_CONTENT_OUTCOMES = new Set(["content_gap", "open_opportunity"]);

/**
 * Wraps the server-rendered rows of one outcome group and shows/hides them
 * according to the active filter — the rows themselves stay server-rendered.
 */
export function TopicGroupSection({ outcome, children }: { outcome: string; children: ReactNode }) {
  const { filter } = useAuditTabs();
  const visible =
    filter === "all" || filter === outcome || (filter === "no_content" && NO_CONTENT_OUTCOMES.has(outcome));
  return (
    <div hidden={!visible} style={{ display: visible ? "flex" : "none", flexDirection: "column", gap: 8 }}>
      {children}
    </div>
  );
}
