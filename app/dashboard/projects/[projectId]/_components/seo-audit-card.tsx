import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { ISSUE_CHECK_META, ISSUE_SEVERITY_LABELS as SEVERITY_LABEL, issueScopeLabel } from "@/lib/web-audit/issue-labels";
import type { IssueSeverity } from "@/lib/web-audit/issues";
import type { OverviewSeoSummary } from "@/lib/web-audit/overview-seo-summary";
import { AUDIT_BLOCK_PARAM, formatBlockPoints } from "@/lib/web-audit/audit-blocks";
import { formatVital, type VitalRating } from "@/lib/web-audit/seo-health";

/**
 * Visión general's Auditoría SEO card (SEARCH-SEO-1 Fase 1b, log §271,
 * design in `docs/design-reference/search-seo-1/tarjeta-auditoria-seo.html`).
 * It sits under the AI-engine bars, or on desktop beside the GEO Score
 * breakdown when the engine bars move up into the KPI grid. The founder removed the projected-score line and the CTA
 * button from the approved mockup: each listed issue is the link instead.
 *
 * Fase 2 (log §281, design in `docs/design-reference/search-seo-1/
 * salud-seo.html`): the card is the SEO block. It shows the Salud SEO, the
 * block's counts and first three issues with their block points, and a line
 * with the home page's mobile speed when it was measured. Every link opens
 * the SEO block.
 */

const RATING_TEXT: Record<VitalRating, string> = { good: "buena", needs_improvement: "mejorable", poor: "lenta" };

function scoreTone(score: number): "pos" | "warn" | "neg" {
  return score >= 70 ? "pos" : score >= 40 ? "warn" : "neg";
}

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
  const blockHref = `${href}?${AUDIT_BLOCK_PARAM}=seo`;
  const speedLine = summary.speed ? (
    <div className="ov2-seo-speed">
      <span className={`ov2-seo-dot ov2-seo-speed-${summary.speed.rating}`} aria-hidden="true" />
      <span>
        Velocidad en móvil: <b>{summary.speed.vital.toUpperCase()} {formatVital(summary.speed.vital, summary.speed.value)}</b>,{" "}
        {RATING_TEXT[summary.speed.rating]}
      </span>
    </div>
  ) : null;

  return (
    <div className="card ov2-seo">
      <div className="ov2-seo-meta">{meta}</div>
      {summary.saludScore !== null && (
        <div className="ov2-seo-score">
          <span className="ov2-seo-score-l">Salud SEO</span>
          <span className={`ov2-seo-score-n is-${scoreTone(summary.saludScore)}`}>
            <b>{summary.saludScore}</b>
            <span>/100</span>
          </span>
        </div>
      )}
      {clean ? (
        <>
        {speedLine}
        <div className="ov2-seo-ok">
          <span className="ov2-seo-ok-ico">
            <Icon name="check" size={18} />
          </span>
          <div>
            <b>Sin problemas de SEO</b>
            <span>
              {summary.analyzedPageCount === 1
                ? "La página revisada pasa todas las comprobaciones SEO."
                : `Las ${summary.analyzedPageCount} páginas revisadas pasan todas las comprobaciones SEO.`}
            </span>
          </div>
        </div>
        </>
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
          {speedLine}
          <div className="ov2-seo-fxh">Lo primero que arreglar</div>
          <div className="ov2-seo-fxl">
            {summary.top.map(({ issue, blockPoints }) => {
              return (
                <Link key={issue.check} href={blockHref} className="ov2-seo-fx">
                  <span className={`ov2-seo-dot ov2-seo-dot-${issue.severity}`} aria-hidden="true" />
                  <span className="ov2-seo-fx-txt">
                    <b>{ISSUE_CHECK_META[issue.check].label}</b>
                    <span>{issueScopeLabel(issue)}</span>
                  </span>
                  <span className="ov2-seo-fx-r">
                    {blockPoints !== null ? <em>{formatBlockPoints(blockPoints)}</em> : null}
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
