import { Gauge } from "@/components/ui/gauge";
import { Delta } from "@/components/ui/delta";
import { seoScoreBand, type SeoArea } from "@/lib/web-audit/seo-audit-view";
import { AudienceTags } from "./audience-tags";
import { scoreColor } from "./score-tiles";

/**
 * The top row of Auditoría SEO (SEARCH-SEO-1 Fase 1b): the score and the
 * areas, as in the approved design.
 *
 * The score is the technical score the screen always had (`readiness_score`,
 * recalculated by `buildTechnicalIssuesReport`), not the design's «Salud
 * SEO». That one is a new score with its own published weights and arrives in
 * Fase 2; calling today's number by tomorrow's name would be a claim the
 * product cannot back yet.
 */

export function SeoScoreCard({
  score,
  delta,
  criticalCount,
  issueCount,
  analyzedPageCount
}: {
  score: number | null;
  /** Change since the previous audit, recalculated; null without two audits. */
  delta: number | null;
  criticalCount: number;
  issueCount: number;
  analyzedPageCount: number;
}) {
  const pages = `${analyzedPageCount} ${analyzedPageCount === 1 ? "página revisada" : "páginas revisadas"}`;
  if (score === null) {
    return (
      <div className="card sa-score">
        <div className="sa-score-k">Salud técnica</div>
        <p>No hemos podido analizar ninguna página en la última revisión. Lo volveremos a intentar tras el próximo escaneo.</p>
      </div>
    );
  }
  const band = seoScoreBand(score);
  const verdict =
    criticalCount > 0
      ? criticalCount === 1
        ? "Empieza por el fallo crítico: es el que más te frena."
        : `Empieza por los ${criticalCount} fallos críticos: son los que más te frenan.`
      : issueCount > 0
        ? "Sin fallos críticos. Lo que queda son avisos y mejoras."
        : "Todo lo que comprobamos está bien.";
  return (
    <div className="card sa-score">
      <div className="sa-score-k">Salud técnica</div>
      <Gauge value={score} size={168} stroke={15} />
      <span className={`sa-band sa-band-${band.key}`}>● {band.label}</span>
      {delta !== null && delta !== 0 && (
        <span className="sa-score-delta">
          <Delta value={delta} suffix=" pt" /> desde la revisión anterior
        </span>
      )}
      <p>
        {verdict} Media de {pages}.
      </p>
    </div>
  );
}

export function SeoAreasCard({ areas }: { areas: SeoArea[] }) {
  return (
    <div className="card sa-areas">
      <div className="sa-ch">
        <h3>Por áreas</h3>
        <span className="sa-src">Comprobaciones superadas · qué afecta a Google y qué a la IA</span>
      </div>
      <div className="sa-cats">
        {areas.map((area) => (
          <div key={area.key} className="sa-cat">
            <div className="sa-cat-n">
              <b>{area.label}</b>
              <span>{area.hint}</span>
              <AudienceTags audience={area.audience} />
            </div>
            <div className="sa-track" aria-hidden="true">
              <div className="sa-fill" style={{ width: `${area.pct}%`, background: scoreColor(area.pct) }} />
            </div>
            <div className="sa-cat-v">{area.pct}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}
