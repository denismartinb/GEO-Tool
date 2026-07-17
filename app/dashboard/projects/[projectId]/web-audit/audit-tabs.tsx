"use client";

import { createContext, useContext, useState, type CSSProperties, type ReactNode } from "react";

/**
 * Tab + Plan-de-acción-filter state for the "Auditoría web" page. Every
 * panel's content is server-rendered once and passed in as children;
 * switching tabs only toggles visibility (CSS hidden), so there is no
 * client-side refetch, no loss of <details> open/closed state, and no
 * serialization of Supabase data into client props beyond what each small
 * client component receives explicitly.
 *
 * WEB-AUDIT-R5 (founder-approved 2026-07-16) removed the standalone
 * "Contenido" tab — every actionable topic now lives exactly once, inside
 * the Plan de acción on Resumen (with a real, interactive recommendation
 * card embedded when one matches). The opportunity matrix still acts as
 * navigation, but now filters the Plan de acción list IN PLACE (same tab,
 * scrolled into view) instead of switching tabs — see `applyActionFilter`.
 */

export type AuditTabId = "resumen" | "tecnica" | "evolucion";

/**
 * "no_content" is the combined bottom-left matrix quadrant
 * (content_gap + open_opportunity outcomes → the create_competing/create_open
 * action kinds) — the matrix presents them as one cell, so its tap target
 * filters to both kinds at once.
 */
export type ActionFilterId = "all" | "optimize" | "create_competing" | "create_open" | "capture" | "no_content";

/** `QuadrantButton`'s `target` additionally accepts "performing" — a signal to open the separate "Lo que ya funciona" section instead of filtering the plan (performing topics have no action). */
export type QuadrantTarget = ActionFilterId | "performing";

interface AuditTabsState {
  tab: AuditTabId;
  setTab: (tab: AuditTabId) => void;
  filter: ActionFilterId;
  setFilter: (filter: ActionFilterId) => void;
  applyActionFilter: (filter: ActionFilterId) => void;
  openPerforming: () => void;
}

const AuditTabsContext = createContext<AuditTabsState | null>(null);

function useAuditTabs(): AuditTabsState {
  const ctx = useContext(AuditTabsContext);
  if (!ctx) throw new Error("useAuditTabs must be used within AuditTabsProvider");
  return ctx;
}

export function AuditTabsProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<AuditTabId>("resumen");
  const [filter, setFilter] = useState<ActionFilterId>("all");

  function applyActionFilter(nextFilter: ActionFilterId) {
    setFilter(nextFilter);
    // No need to force any <details> open here (founder-approved 2026-07-17):
    // PlanExpander only wraps the "rest" rows behind the "Ver todas" toggle
    // while filter === "all" — any other filter renders every matching row
    // directly, unconditionally, so there's nothing collapsed left to reveal.
    document.getElementById("action-plan")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openPerforming() {
    // "Lo que ya funciona" is a plain always-expanded card (matches every
    // other top-level card's width/style) — nothing to open, just scroll.
    document.getElementById("performing-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <AuditTabsContext.Provider value={{ tab, setTab, filter, setFilter, applyActionFilter, openPerforming }}>
      {children}
    </AuditTabsContext.Provider>
  );
}

const TAB_LABELS: Array<{ id: AuditTabId; label: string }> = [
  { id: "resumen", label: "Plan de acción" },
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
 * A matrix quadrant as a tap target: count + hint only. Tapping either
 * filters the Plan de acción (staying on Resumen, scrolled into view) or,
 * for `target="performing"`, opens the separate "Lo que ya funciona" section
 * — performing topics have no action, so they were never part of the plan.
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
  target: QuadrantTarget;
  extra?: ReactNode;
}) {
  const { applyActionFilter, openPerforming } = useAuditTabs();
  const v = QUADRANT_TONES[tone];

  function handleClick() {
    if (target === "performing") {
      openPerforming();
    } else {
      applyActionFilter(target);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
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
        {target === "performing" ? "Ver qué funciona →" : "Ver plan de acción →"}
      </span>
    </button>
  );
}

export type ActionFilterCount = { id: ActionFilterId; label: string; count: number };

/** Filter chips above the Plan de acción list. */
export function ActionFilterBar({ options }: { options: ActionFilterCount[] }) {
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
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
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

/**
 * Wraps ONE pre-rendered Plan de acción row and shows/hides it per the
 * active filter — the row itself stays server-rendered (may embed a client
 * RecCard). `matches` lists every filter value under which this row should
 * be visible (e.g. a create_competing row matches both "create_competing"
 * and the combined "no_content" quadrant filter).
 */
export function ActionRowVisibility({ matches, children }: { matches: ActionFilterId[]; children: ReactNode }) {
  const { filter } = useAuditTabs();
  const visible = filter === "all" || matches.includes(filter);
  return <div hidden={!visible}>{children}</div>;
}

const EXPANDER_LINK_STYLE: CSSProperties = {
  background: "none",
  border: "none",
  padding: "4px 0",
  font: "inherit",
  fontSize: 12,
  fontWeight: 650,
  color: "var(--accent)",
  cursor: "pointer",
  textAlign: "left"
};

/**
 * Decides how the Plan de acción's overflow rows (everything past the first
 * 3) are shown (founder-approved 2026-07-17): behind a toggle ONLY while
 * filter === "all" — with a specific filter active, every matching row must
 * already be visible without an extra click, so the toggle disappears and
 * the rows render directly. `top`/`rest` are pre-rendered server output
 * (each row already wrapped in its own `ActionRowVisibility`), passed in as
 * children slots — this component only decides the WRAPPER.
 *
 * A controlled (not native <details>) toggle so the trigger can relocate:
 * "Ver todas las acciones (N)" sits right after the top 3 while collapsed;
 * clicking it reveals the rest AND moves the trigger to after the last row,
 * now reading "Ver menos acciones" — clicking that collapses back to
 * exactly the initial state (founder-approved 2026-07-17).
 */
export function PlanExpander({
  top,
  rest,
  restCount,
  totalCount
}: {
  top: ReactNode;
  rest: ReactNode;
  restCount: number;
  totalCount: number;
}) {
  const { filter } = useAuditTabs();
  const [open, setOpen] = useState(false);

  if (filter !== "all") {
    // A specific filter already shows every match directly — no toggle.
    return (
      <>
        {top}
        {restCount > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{rest}</div>}
      </>
    );
  }

  if (restCount === 0) return <>{top}</>;

  if (!open) {
    return (
      <>
        {top}
        <button type="button" style={EXPANDER_LINK_STYLE} onClick={() => setOpen(true)}>
          Ver todas las acciones ({totalCount})
        </button>
      </>
    );
  }

  return (
    <>
      {top}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{rest}</div>
      <button
        type="button"
        style={EXPANDER_LINK_STYLE}
        onClick={() => {
          setOpen(false);
          document.getElementById("action-plan")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      >
        Ver menos acciones
      </button>
    </>
  );
}
