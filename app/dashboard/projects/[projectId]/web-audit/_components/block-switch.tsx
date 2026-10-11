import Link from "next/link";
import { AUDIT_BLOCKS, AUDIT_BLOCK_PARAM, type AuditBlockView } from "@/lib/web-audit/audit-blocks";
import { scoreColor } from "./score-tiles";

/**
 * The two block cards at the top of the audit screen (log §274): GEO and
 * SEO, each with its own score. They are links, not tabs, so the menu entry
 * that opened the screen, the URL and the highlighted card always agree.
 */
export function BlockSwitch({
  projectId,
  active,
  blocks
}: {
  projectId: string;
  active: AuditBlockView["key"];
  blocks: AuditBlockView[];
}) {
  return (
    <nav className="sa-blocks" aria-label="Bloques de la auditoría">
      {blocks.map((view) => {
        const def = AUDIT_BLOCKS[view.key];
        const critical = view.issues.filter((i) => i.issue.severity === "critical").length;
        const total = view.issues.length;
        return (
          <Link
            key={view.key}
            href={`/dashboard/projects/${projectId}/web-audit?${AUDIT_BLOCK_PARAM}=${view.key}`}
            className={`sa-blk sa-blk-${view.key}`}
            aria-current={view.key === active ? "page" : undefined}
            scroll={false}
          >
            <span className="sa-blk-eyb">
              <i aria-hidden="true" />
              {def.label}
            </span>
            <span className="sa-blk-q">{def.question}</span>
            <span className="sa-blk-n">
              {view.score === null ? (
                <b>—</b>
              ) : (
                <b style={{ color: scoreColor(view.score) }}>{view.score}</b>
              )}
              <span>/100</span>
            </span>
            <span className="sa-blk-meta">
              {total === 0 ? (
                "Sin problemas"
              ) : (
                <>
                  {critical > 0 && (
                    <span className="sa-blk-crit">
                      {critical} {critical === 1 ? "crítico" : "críticos"}
                    </span>
                  )}
                  {critical > 0 && " · "}
                  {total} {total === 1 ? "problema" : "problemas"}
                </>
              )}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
