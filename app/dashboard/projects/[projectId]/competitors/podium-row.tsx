"use client";

import { Icon } from "@/components/ui/icon";
import { getEngineMeta } from "@/lib/scan/engine-meta";
import type { CompetitorRowData } from "./page";

export function PodiumRow({
  projectId,
  row,
  rank,
  maxSov
}: {
  projectId: string;
  row: CompetitorRowData;
  rank: number;
  maxSov: number;
}) {
  function goToPrompts() {
    // Full navigation: client-side router.push to the same route with only
    // different searchParams does not reliably re-run the server component.
    window.location.href = `/dashboard/projects/${projectId}/prompts?competitor=${encodeURIComponent(row.name)}`;
  }

  return (
    <div
      className="cm2-rank"
      onClick={goToPrompts}
      role="button"
      tabIndex={0}
      title={`Ver prompts donde aparece ${row.name}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          goToPrompts();
        }
      }}
    >
      <span className="cm2-rank-n">{rank}</span>
      <span className="cm2-rank-fav" style={{ background: row.color }}>
        {row.initial}
      </span>
      <div className="cm2-rank-main">
        <div className="cm2-rank-nm">
          {row.name}
          <Icon name="arrRight" size={12} />
        </div>
        <div className="cm2-rank-dm">{row.domain}</div>
        <div className="cm2-rank-bar-wrap">
          <div className="cm2-rank-bar">
            <div style={{ width: `${(row.sov / maxSov) * 100}%`, background: row.color, height: "100%", borderRadius: 99 }} />
          </div>
        </div>
      </div>
      <div className="cm2-rank-extra">
        <div className="v">{row.mentionRate}%</div>
        <div className="l">Mención</div>
      </div>
      <div className="cm2-rank-extra">
        <div className="v">{row.citationRate}%</div>
        <div className="l">Cita</div>
      </div>
      <div className="cm2-rank-r">
        <div className="cm2-rank-sov">
          {row.sov}
          <small>%</small>
        </div>
        {row.deltaPoints != null ? (
          <div className={`cm2-delta ${row.deltaPoints > 0 ? "up" : row.deltaPoints < 0 ? "dn" : "fl"}`}>
            {row.deltaPoints > 0 ? "▲" : row.deltaPoints < 0 ? "▼" : "—"} {Math.abs(row.deltaPoints)} pt
            {Math.abs(row.deltaPoints) === 1 ? "" : "s"}
          </div>
        ) : null}
        {row.engineBreakdown.length >= 2 && (
          <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 4, textAlign: "right" }}>
            {row.engineBreakdown.map((e, idx) => (
              <span key={e.provider}>
                {idx > 0 && " · "}
                {getEngineMeta(e.provider).label} {e.mentionRate}%
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
