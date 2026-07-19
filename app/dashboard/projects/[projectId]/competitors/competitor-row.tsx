"use client";

import { Icon } from "@/components/ui/icon";
import { getEngineMeta } from "@/lib/scan/engine-meta";
import type { CompetitorRowData } from "./page";

export function CompetitorRow({
  projectId,
  row,
  maxSov
}: {
  projectId: string;
  row: CompetitorRowData;
  maxSov: number;
}) {
  function goToPrompts() {
    // Full navigation: client-side router.push to the same route with only
    // different searchParams does not reliably re-run the server component.
    window.location.href = `/dashboard/projects/${projectId}/prompts?competitor=${encodeURIComponent(row.name)}`;
  }

  return (
    <tr
      className="hoverable"
      onClick={goToPrompts}
      role="button"
      tabIndex={0}
      title={`Ver prompts donde aparece ${row.name}`}
      style={{ cursor: "pointer" }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          goToPrompts();
        }
      }}
    >
      <td>
        <div className="ent ent-link">
          <span className="fav" style={{ background: row.color }}>
            {row.initial}
          </span>
          <div>
            <div className="nm">{row.name}</div>
            <div className="dm">{row.domain}</div>
          </div>
          <Icon name="arrRight" size={13} />
        </div>
      </td>
      <td className="num">
        <b className="tnum">{row.mentionRate}%</b>
      </td>
      <td className="num">
        <b className="tnum">{row.citationRate}%</b>
      </td>
      <td>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="sov-bar comp-tbl-sov">
            <div
              className="sov-fill"
              style={{
                width: `${(row.sov / maxSov) * 100}%`,
                background: row.color
              }}
            />
          </div>
          <span
            className="tnum"
            style={{ fontSize: 12, fontWeight: 700, width: 34, textAlign: "right" }}
          >
            {row.sov}%
          </span>
        </div>
        {row.engineBreakdown.length >= 2 && (
          <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 4 }}>
            {row.engineBreakdown.map((e, idx) => (
              <span key={e.provider}>
                {idx > 0 && " · "}
                {getEngineMeta(e.provider).label} {e.mentionRate}%
              </span>
            ))}
          </div>
        )}
      </td>
      <td className="num">
        <span className="tnum" style={{ color: "var(--ink-2)" }}>
          {row.mentions}
        </span>
      </td>
    </tr>
  );
}
