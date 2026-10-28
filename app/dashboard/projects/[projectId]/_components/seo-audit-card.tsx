import Link from "next/link";
import type { ReactNode } from "react";
import { Ic } from "@/components/ins/ic";
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

const SEVERITIES: IssueSeverity[] = ["critical", "warning", "improvement"];

export function SeoAuditCard({
  summary,
  auditedAt,
  href,
  googleHref,
  googleColumn = false,
  children
}: {
  summary: OverviewSeoSummary;
  /** Already formatted, e.g. "9 oct". Null when the snapshot has no date. */
  auditedAt: string | null;
  href: string;
  /** «Posición en Google», the link in the card header. */
  googleHref?: string;
  /** Whether the Google half has a column of its own (Search Console configured). */
  googleColumn?: boolean;
  /** The Google half (Search Console), log §284: the second column of the grid. */
  children?: ReactNode;
}) {
  const pages = `${summary.analyzedPageCount} ${summary.analyzedPageCount === 1 ? "página" : "páginas"}`;
  const meta = auditedAt ? `Revisada el ${auditedAt} · ${pages}` : `${pages} revisadas`;
  const blockHref = `${href}?${AUDIT_BLOCK_PARAM}=seo`;
  const first = summary.top[0] ?? null;
  const speedLine = summary.speed ? (
    <div className="note">
      Velocidad en móvil: <b>{summary.speed.vital.toUpperCase()} {formatVital(summary.speed.vital, summary.speed.value)}</b>,{" "}
      {RATING_TEXT[summary.speed.rating]}
    </div>
  ) : null;

  return (
    <div className="card">
      <div className="card-h">
        <h3>{googleColumn ? "Auditoría SEO y Google" : "Auditoría SEO"}</h3>
        <Link className="see" href={googleColumn && googleHref ? googleHref : blockHref}>
          {googleColumn && googleHref ? "Posición en Google" : "Ver todo"}
          <Ic n="chevr" sm />
        </Link>
      </div>
      <div className="card-b">
        <div className={`seo3 ${googleColumn ? "two" : "one"}`}>
          <div>
            <div className="k">Salud SEO</div>
            <div className="bv num">
              {summary.saludScore !== null ? (
                <>
                  {summary.saludScore}
                  <small>/100</small>
                </>
              ) : (
                "—"
              )}
            </div>
            <div className="trio">
              {SEVERITIES.map((sev) => {
                const n = summary.counts[sev];
                return (
                  <span key={sev}>
                    <b className="num">{n}</b>
                    {SEVERITY_LABEL[sev][n === 1 ? 0 : 1]}
                  </span>
                );
              })}
            </div>
            <div className="note">{meta}</div>
            {speedLine}
          </div>
          {children}
        </div>
        <div className="fx-w">
          <div className="fx-k">Recomendaciones</div>
          {first ? (
            <Link href={blockHref} className="fixln">
              <span className="sd" style={first.issue.severity === "improvement" ? { background: "var(--ink-4)" } : undefined} />
              {ISSUE_CHECK_META[first.issue.check].label}
              <span style={{ color: "var(--ink-3)", marginLeft: 6 }}>{issueScopeLabel(first.issue)}</span>
              <Ic n="chevr" sm />
            </Link>
          ) : (
            <div className="fixln">
              <span className="sd" style={{ background: "var(--pos)" }} />
              {summary.analyzedPageCount === 1
                ? "La página revisada pasa todas las comprobaciones SEO."
                : `Las ${summary.analyzedPageCount} páginas revisadas pasan todas las comprobaciones SEO.`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
