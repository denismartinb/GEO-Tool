import type { CSSProperties } from "react";
import Link from "next/link";
import { Ic } from "@/components/ins/ic";
import { Roll } from "@/components/ins/kit/roll";
import { arcGeometry, blockMeta, potentialLine } from "@/lib/ins/audit-model";
import { AUDIT_BLOCKS, AUDIT_BLOCK_PARAM, type AuditBlockKey, type AuditBlockView } from "@/lib/web-audit/audit-blocks";

/**
 * The two block cards of «Auditoría técnica» (CONSOLE-INSTRUMENTO-1 F6a, log
 * §363): GEO and SEO, each with its score on a 270 degree arc and a ghost up
 * to what fixing the scored issues reaches. They stay links (`?bloque=`), so
 * the URL, the menu and the highlighted card always agree. Server component.
 */

const NOTES: Record<AuditBlockKey, string> = {
  geo: "Lo que la IA necesita para poder citarte. Que acabe citándote depende también del contenido, que trabajas en Recomendaciones.",
  seo: "Lo que Google necesita para encontrar tu web, entenderla y enseñarla rápido.",
};

function Arc({ score, projected }: { score: number | null; projected: number | null }) {
  const g = arcGeometry(score ?? 0, projected ?? score ?? 0);
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

export function InsBlockCards({
  projectId,
  active,
  blocks,
}: {
  projectId: string;
  active: AuditBlockKey;
  blocks: AuditBlockView[];
}) {
  const base = `/dashboard/projects/${projectId}/web-audit`;
  return (
    <>
      <nav className="grid2 sc-au-blks" aria-label="Bloques de la auditoría">
        {blocks.map((view) => {
          const def = AUDIT_BLOCKS[view.key];
          const on = view.key === active;
          const critical = view.issues.filter((i) => i.issue.severity === "critical").length;
          const meta = blockMeta(critical, view.issues.length);
          const pot = potentialLine(view.score, view.projectedScore, view.scoredIssueCount);
          const to = view.projectedScore ?? view.score;
          return (
            <div key={view.key} className={`card sc-au-blk${on ? " on" : ""}`}>
              <Link
                href={`${base}?${AUDIT_BLOCK_PARAM}=${view.key}`}
                className="sel"
                data-block={view.key}
                aria-current={on ? "page" : undefined}
                scroll={false}
              >
                <span className="hd">
                  <span className="ico">
                    {view.key === "seo" ? (
                      <svg width="16" height="16" aria-hidden="true" focusable="false">
                        <use href="#e-google" />
                      </svg>
                    ) : (
                      <Ic n="sparkles" />
                    )}
                  </span>
                  <span>
                    <b>{def.label}</b>
                    <span>{def.question}</span>
                  </span>
                </span>
                <span className="bd">
                  <Arc score={view.score} projected={view.projectedScore} />
                  <span className="rt">
                    <span className="lb">{def.scoreLabel}</span>
                    <span className="mt num">
                      {meta.critical ? <b>{meta.critical}</b> : null}
                      {meta.critical ? " · " : ""}
                      {meta.total}
                    </span>
                    {pot && to !== null ? (
                      <>
                        <span className="to">
                          Puedes llegar a <b className="num">{to}</b>
                        </span>
                        <span className="to-m">
                          Hasta <b className="num">{to}</b>
                        </span>
                      </>
                    ) : null}
                  </span>
                </span>
              </Link>
              {pot ? (
                <Link href={`${base}?${AUDIT_BLOCK_PARAM}=${view.key}#problemas`} className="pot" scroll={false}>
                  <Ic n="arrowup" sm />
                  <b className="num">+{pot.gain} pt</b>
                  <span className="px"> {pot.text}</span>
                  <Ic n="chevr" sm />
                </Link>
              ) : null}
            </div>
          );
        })}
      </nav>
      <p className="sc-au-note">{NOTES[active]}</p>
    </>
  );
}
