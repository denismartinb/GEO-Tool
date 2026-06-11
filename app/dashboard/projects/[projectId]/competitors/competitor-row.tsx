"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
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
  const router = useRouter();

  function goToPrompts() {
    router.push(`/dashboard/projects/${projectId}/prompts?competitor=${encodeURIComponent(row.name)}`);
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
      </td>
      <td className="num">
        <span className="tnum" style={{ color: "var(--ink-2)" }}>
          {row.mentions}
        </span>
      </td>
    </tr>
  );
}
