import type { CSSProperties } from "react";
import Link from "next/link";
import { Ic } from "@/components/ins/ic";
import { Roll } from "@/components/ins/kit/roll";
import { arcGeometry, blockMeta, potentialLine } from "@/lib/ins/audit-model";
import { AUDIT_BLOCKS, AUDIT_BLOCK_PARAM, type AuditBlockKey, type AuditBlockView } from "@/lib/web-audit/audit-blocks";

/**
 * The score strip of one audit block (CONSOLE-INSTRUMENTO-1 F6a, log §363; one
 * strip per page since log §368): the score on a 270 degree arc, a ghost up to
 * what fixing the scored issues reaches, and the gain line. The block is chosen
 * by the menu entry («Tu web para la IA» / «Tu web para Google»), which links
 * to `?bloque=`, so there is no selector on the page. Server component.
 */

/** One line under the title: what each block is for. */
export const BLOCK_NOTES: Record<AuditBlockKey, string> = {
  geo: "Lo que la IA necesita para poder citarte. Que acabe citándote depende también del contenido, que trabajas en Recomendaciones.",
  seo: "Lo que Google necesita para encontrar tu web, entenderla y enseñarla rápido.",
};

function Arc({ score, projected }: { score: number | null; projected: number | null }) {
  const g = arcGeometry(score ?? 0, projected ?? score ?? 0, 104);
  const c = g.center;
  const r = g.radius;
  const style = {
    width: g.size,
    height: g.size,
    "--a": g.now.toFixed(1),
    "--g": g.ghost.toFixed(1),
    "--C": g.circumference.toFixed(1),
  } as CSSProperties;
  return (
    <span className="sc-au-arc" style={style}>
      <svg viewBox={`0 0 ${g.size} ${g.size}`} aria-hidden="true">
        <g transform={`rotate(135 ${c} ${c})`}>
          <circle className="tr" cx={c} cy={c} r={r} strokeDasharray={`${g.span.toFixed(1)} ${g.circumference.toFixed(1)}`} />
          <circle className="gh" cx={c} cy={c} r={r} style={{ strokeDashoffset: -Number(g.now.toFixed(1)) }} />
          <circle className="now" cx={c} cy={c} r={r} />
        </g>
      </svg>
      <span className="n">
        <b className="num">{score === null ? "—" : <Roll value={score} />}</b>
        <small>/100</small>
      </span>
    </span>
  );
}

export function InsBlockHero({ projectId, view }: { projectId: string; view: AuditBlockView }) {
  const def = AUDIT_BLOCKS[view.key];
  const base = `/dashboard/projects/${projectId}/web-audit`;
  const critical = view.issues.filter((i) => i.issue.severity === "critical").length;
  const meta = blockMeta(critical, view.issues.length);
  const pot = potentialLine(view.score, view.projectedScore, view.scoredIssueCount);
  const to = view.projectedScore ?? view.score;
  return (
    <section className="card sc-au-hero" data-block={view.key} aria-label={`${def.scoreLabel}`}>
      <Arc score={view.score} projected={view.projectedScore} />
      <div className="rt">
        <span className="lb">{def.scoreLabel}</span>
        <span className="mt num">
          {meta.critical ? <b>{meta.critical}</b> : null}
          {meta.critical ? " · " : ""}
          {meta.total}
        </span>
        {pot && to !== null ? (
          <span className="to">
            Puedes llegar a <b className="num">{to}</b>
          </span>
        ) : null}
      </div>
      {pot ? (
        <Link href={`${base}?${AUDIT_BLOCK_PARAM}=${view.key}#problemas`} className="pot" scroll={false}>
          <Ic n="arrowup" sm />
          <b className="num">+{pot.gain} pt</b>
          <span className="px"> {pot.text}</span>
          <Ic n="chevr" sm />
        </Link>
      ) : null}
    </section>
  );
}
