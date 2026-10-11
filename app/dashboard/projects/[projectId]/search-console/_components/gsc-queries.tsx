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
  { key: "near", label: "Página 2 (puestos 11–20)" }
];

const VISIBLE_ROWS = 50;

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
  const counts: Record<Filter, number> = {
    all: queries.length,
    p1: queries.filter((q) => q.position <= 10).length,
    near: queries.filter((q) => q.nearPage1).length
  };
  const rows = queries
    .filter((q) => (filter === "p1" ? q.position <= 10 : filter === "near" ? q.nearPage1 : true))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, VISIBLE_ROWS);

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
          <table className="gsc-qt">
            <thead>
              <tr>
                <th>Búsqueda</th>
                <th>Puesto</th>
                <th className="n">Clics</th>
                <th className="n gsc-hide-m">Impresiones</th>
                <th className="n gsc-hide-m">CTR</th>
                <th className="gsc-hide-m">Página que sale</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => (
                <tr key={q.query}>
                  <td>
                    <span className="gsc-qq">{q.query}</span>
                    {q.nearPage1 && <span className="gsc-flag">Página 2</span>}
                  </td>
                  <td className="gsc-pos">
                    <PosBadge position={q.position} /> <Movement value={q.movement} />
                  </td>
                  <td className="n">{fmtInt(q.clicks)}</td>
                  <td className="n gsc-hide-m">{fmtInt(q.impressions)}</td>
                  <td className="n gsc-hide-m">{fmtPct(q.ctr)}</td>
                  <td className="gsc-hide-m">
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
