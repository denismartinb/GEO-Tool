import { Icon } from "@/components/ui/icon";
import { AUDIT_BLOCKS } from "@/lib/web-audit/audit-blocks";
import { pageCheckWeight, type IssueCheckKey } from "@/lib/web-audit/issues";
import { passingCheckLabel } from "@/lib/web-audit/issue-labels";
import { SEO_EXTRA_WEIGHTS, type SeoExtraCheckKey } from "@/lib/web-audit/seo-health";

/**
 * «Cómo se calcula tu Salud SEO» (log §278): the founder asked for the
 * weights on screen. Read from the same tables the score uses
 * (`page-checks.ts` through `pageCheckWeight`, and `SEO_EXTRA_WEIGHTS`), so
 * the card cannot drift from the number above it.
 */

function weightOf(check: IssueCheckKey): number | null {
  return check in SEO_EXTRA_WEIGHTS ? SEO_EXTRA_WEIGHTS[check as SeoExtraCheckKey] : pageCheckWeight(check);
}

export function seoWeightGroups(): Array<{ title: string; rows: Array<{ check: IssueCheckKey; label: string; points: number | null }> }> {
  const rows = AUDIT_BLOCKS.seo.checks.map((check) => ({ check, label: passingCheckLabel(check), points: weightOf(check) }));
  const byPoints = (a: { points: number | null }, b: { points: number | null }) => (b.points ?? 0) - (a.points ?? 0);
  return [
    { title: "Comprobaciones de siempre", rows: rows.filter((r) => r.points !== null && !(r.check in SEO_EXTRA_WEIGHTS)).sort(byPoints) },
    { title: "Nuevas", rows: rows.filter((r) => r.points !== null && r.check in SEO_EXTRA_WEIGHTS).sort(byPoints) },
    { title: "Sin puntos", rows: rows.filter((r) => r.points === null) }
  ];
}

export function SeoWeightsCard() {
  return (
    <details className="card wa-details sa-weights">
      <summary>
        <span>Cómo se calcula tu Salud SEO</span>
        <span className="wa-chev">
          <Icon name="chevDown" size={14} />
        </span>
      </summary>
      <div className="sa-weights-b">
        <p>
          Cada comprobación vale unos puntos sobre 100. Tu nota es la parte que cumples en las páginas revisadas. No
          cambia tu Puntuación GEO.
        </p>
        {seoWeightGroups().map((group) => (
          <div key={group.title}>
            <div className="sa-wgrp">{group.title}</div>
            {group.rows.map((row) => (
              <div key={row.check} className={`sa-wrow${row.points === null ? " is-off" : ""}`}>
                <span>{row.label}</span>
                <b>{row.points === null ? "—" : `${row.points} pt`}</b>
              </div>
            ))}
          </div>
        ))}
      </div>
    </details>
  );
}
