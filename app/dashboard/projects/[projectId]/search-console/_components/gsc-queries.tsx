"use client";

import { useState } from "react";
import { displayPath } from "@/lib/search-console/insights";
import type { QueryView } from "@/lib/search-console/report";
import { fmtInt, fmtPct, fmtPosition } from "./format";
import { PosBadge } from "./gsc-posbadge";

/**
 * «Las búsquedas que te traen visitas» (log §284). Queries come from Google and are untrusted
 * text: rendered as text only, never as HTML.
 */
type Filter = "all" | "p1" | "near";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "Todas" },
  { key: "p1", label: "Página 1" },
  { key: "near", label: "Página 2" }
];

const VISIBLE_ROWS = 50;

/**
 * Sortable columns (GSC-QUERIES-SORT-1, log §329). The first press sorts the way a reader
 * expects (A–Z, best position first, most clicks/impressions first); a second press inverts it.
 */
export type SortKey = "query" | "position" | "clicks" | "impressions";
export type SortDir = "asc" | "desc";

const FIRST_DIR: Record<SortKey, SortDir> = { query: "asc", position: "asc", clicks: "desc", impressions: "desc" };

const SORT_NAMES: Record<SortKey, string> = {
  query: "búsqueda",
  position: "puesto",
  clicks: "clics",
  impressions: "impresiones"
};

export function sortQueries(rows: QueryView[], key: SortKey, dir: SortDir): QueryView[] {
  const m = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const primary = key === "query" ? a.query.localeCompare(b.query, "es") : a[key] - b[key];
    return m * primary || b.impressions - a.impressions || a.query.localeCompare(b.query, "es");
  });
}

function SortHeader({
  col,
  sort,
  onSort,
  className
}: {
  col: SortKey;
  sort: { key: SortKey; dir: SortDir };
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort.key === col;
  const arrow = active ? (sort.dir === "asc" ? "↑" : "↓") : "↕";
  return (
    <th className={className} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        className={`gsc-sort${active ? " gsc-sort-on" : ""}`}
        onClick={() => onSort(col)}
        aria-label={`Ordenar por ${SORT_NAMES[col]}`}
      >
        {SORT_NAMES[col].charAt(0).toUpperCase() + SORT_NAMES[col].slice(1)}
        <span className="gsc-sort-ar" aria-hidden="true">
          {arrow}
        </span>
      </button>
    </th>
  );
}

function Movement({ value }: { value: number | null }) {
  if (value === null) return <span className="gsc-mv gsc-muted">nueva</span>;
  if (value === 0) return <span className="gsc-mv gsc-muted">=</span>;
  return (
    <span className={`gsc-mv ${value > 0 ? "gsc-up" : "gsc-down"}`}>
      {value > 0 ? "▲" : "▼"}
      {fmtPosition(Math.abs(value))}
    </span>
  );
}

export function GscQueries({ queries, pageByQuery = {} }: { queries: QueryView[]; pageByQuery?: Record<string, string> }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "impressions", dir: "desc" });
  const onSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: FIRST_DIR[key] }));
  const counts: Record<Filter, number> = {
    all: queries.length,
    p1: queries.filter((q) => q.position <= 10).length,
    near: queries.filter((q) => q.nearPage1).length
  };
  // The 50 most-seen searches stay the set shown; the chosen column only reorders them.
  const visible = sortQueries(
    queries.filter((q) => (filter === "p1" ? q.position <= 10 : filter === "near" ? q.nearPage1 : true)),
    "impressions",
    "desc"
  ).slice(0, VISIBLE_ROWS);
  const rows = sortQueries(visible, sort.key, sort.dir);

  return (
    <div className="card">
      <div className="sa-ch">
        <h3>Las búsquedas que te traen visitas</h3>
        <span className="sa-src">Datos con 2–3 días de retraso, como en Search Console</span>
      </div>
      <div className="gsc-qfil" role="group" aria-label="Filtrar búsquedas">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`gsc-st${filter === f.key ? " gsc-st-on" : ""}`}
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label} <b>{counts[f.key]}</b>
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="sa-empty">
          {filter === "near" ? "Ninguna búsqueda está ahora en la página 2." : "No hay búsquedas en este grupo."}
        </p>
      ) : (
        <div className="gsc-qt-wrap">
          <table className="gsc-qt gsc-qt-sortable">
            <thead>
              <tr>
                <SortHeader col="query" sort={sort} onSort={onSort} className="gsc-qcol" />
                <SortHeader col="position" sort={sort} onSort={onSort} />
                <SortHeader col="clicks" sort={sort} onSort={onSort} className="n" />
                <SortHeader col="impressions" sort={sort} onSort={onSort} className="n" />
                <th className="n">CTR</th>
                <th>Página que sale</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => (
                <tr key={q.query}>
                  <td className="gsc-qcol">
                    <span className="gsc-qq">{q.query}</span>
                    {q.nearPage1 && <span className="gsc-flag">Página 2</span>}
                  </td>
                  <td className="gsc-pos">
                    <PosBadge position={q.position} /> <Movement value={q.movement} />
                  </td>
                  <td className="n">{fmtInt(q.clicks)}</td>
                  <td className="n">{fmtInt(q.impressions)}</td>
                  <td className="n">{fmtPct(q.ctr)}</td>
                  <td>
                    {pageByQuery[q.query] ? (
                      <a className="gsc-plink" href={pageByQuery[q.query]} target="_blank" rel="noopener noreferrer">
                        {displayPath(pageByQuery[q.query])}
                      </a>
                    ) : (
                      <span className="gsc-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {queries.length > VISIBLE_ROWS && filter === "all" && (
        <p className="sa-note" style={{ marginTop: 10, marginBottom: 0 }}>
          Mostramos las {VISIBLE_ROWS} búsquedas con más impresiones.
        </p>
      )}
    </div>
  );
}
