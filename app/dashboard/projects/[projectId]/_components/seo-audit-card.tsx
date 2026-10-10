import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { ISSUE_CHECK_META, issueScopeLabel } from "@/lib/web-audit/issue-labels";
import type { IssueSeverity } from "@/lib/web-audit/issues";
import type { OverviewSeoSummary } from "@/lib/web-audit/overview-seo-summary";

/**
 * Visión general's Auditoría SEO card (SEARCH-SEO-1 Fase 1b, log §269,
 * design in `docs/design-reference/search-seo-1/tarjeta-auditoria-seo.html`).
 * It sits under the AI-engine bars, level with the "Diagnóstico técnico" row
 * it expands on. The founder removed the projected-score line and the CTA
 * button from the approved mockup: each listed issue is the link instead.
 */

const SEVERITY_LABEL: Record<IssueSeverity, [string, string]> = {
  critical: ["Crítico", "Críticos"],
  warning: ["Aviso", "Avisos"],
  improvement: ["Mejora", "Mejoras"]
};

const SEVERITIES: IssueSeverity[] = ["critical", "warning", "improvement"];

export function SeoAuditCard({
  summary,
  auditedAt,
  href
}: {
  summary: OverviewSeoSummary;
  /** Already formatted, e.g. "9 oct". Null when the snapshot has no date. */
  auditedAt: string | null;
  href: string;
}) {
  const pages = `${summary.analyzedPageCount} ${summary.analyzedPageCount === 1 ? "página" : "páginas"}`;
  const meta = auditedAt ? `Revisada el ${auditedAt} · ${pages}` : `${pages} revisadas`;
  const clean = summary.top.length === 0;

  return (
    <div className="card ov2-seo">
      <div className="ov2-seo-meta">{meta}</div>
      {clean ? (
        <div className="ov2-seo-ok">
          <span className="ov2-seo-ok-ico">
            <Icon name="check" size={18} />
          </span>
          <div>
            <b>Sin problemas técnicos</b>
            <span>
              {summary.analyzedPageCount === 1
                ? "La página revisada pasa todas las comprobaciones."
                : `Las ${summary.analyzedPageCount} páginas revisadas pasan todas las comprobaciones.`}
            </span>
          </div>
        </div>
      ) : (
        <>
          <div className="ov2-seo-sev">
            {SEVERITIES.map((sev) => {
              const n = summary.counts[sev];
              return (
                <div key={sev} className={`ov2-seo-sv ov2-seo-sv-${sev}${n === 0 ? " is-zero" : ""}`}>
                  <b>{n}</b>
                  <span>{SEVERITY_LABEL[sev][n === 1 ? 0 : 1]}</span>
                </div>
              );
            })}
          </div>
          <div className="ov2-seo-fxh">Lo primero que arreglar</div>
          <div className="ov2-seo-fxl">
            {summary.top.map((issue) => {
              // Rounded first: a 0.4-point fix must not read as "+0 pts".
              const points = issue.pointDelta != null ? Math.round(issue.pointDelta) : 0;
              return (
                <Link key={issue.check} href={href} className="ov2-seo-fx">
                  <span className={`ov2-seo-dot ov2-seo-dot-${issue.severity}`} aria-hidden="true" />
                  <span className="ov2-seo-fx-txt">
                    <b>{ISSUE_CHECK_META[issue.check].label}</b>
                    <span>{issueScopeLabel(issue)}</span>
                  </span>
                  <span className="ov2-seo-fx-r">
                    {points > 0 ? <em>+{points} pts</em> : null}
                    <Icon name="chevRight" size={15} />
                  </span>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
