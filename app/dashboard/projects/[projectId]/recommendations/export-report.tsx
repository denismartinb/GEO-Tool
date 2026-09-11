import { MIN_VISIBLE_POINTS, formatPoints } from "@/lib/recommendations/plan";
import { recommendationEngineLabels, type ExportPlanRecommendation } from "@/lib/recommendations/export-plan";
import { pointsCaption } from "@/lib/recommendations/deliverable";
import { BrandLogo } from "@/components/ui/brand-logo";

/**
 * PDF-EXPORT-PLAN-1 (docs/design-reference/pdf-export-plan-1/) — el informe
 * que sustituye al `.md` de "Exportar plan". Se monta siempre oculto
 * (`.xrp-root`) y sólo se hace visible por `@media print` en
 * export-report.css — `handleExport` en recommendations-client.tsx dispara
 * `window.print()`, nunca genera el PDF por sí mismo. Puramente
 * presentacional: no toca `Date.now()`, no decide qué es "plan" vs. "resto"
 * (eso lo decide `selectPlan` en el servidor, igual que el `.md` que
 * sustituye).
 */
export function ExportReport({
  domain,
  geoScore,
  scanDateLabel,
  plan,
  rest,
}: {
  domain: string;
  /** null cuando la Puntuación GEO (lib/metrics/run-metrics.ts, único dueño)
   *  no se pudo resolver — la portada omite la cifra en vez de inventarla. */
  geoScore: number | null;
  scanDateLabel: string | null;
  plan: ExportPlanRecommendation[];
  rest: ExportPlanRecommendation[];
}) {
  return (
    <div className="xrp-root" aria-hidden="true">
      <ExportReportCover domain={domain} geoScore={geoScore} scanDateLabel={scanDateLabel} planCount={plan.length} />
      <ExportReportContent domain={domain} plan={plan} rest={rest} />
    </div>
  );
}

function ExportReportCover({
  domain,
  geoScore,
  scanDateLabel,
  planCount,
}: {
  domain: string;
  geoScore: number | null;
  scanDateLabel: string | null;
  planCount: number;
}) {
  return (
    <section className="xrp-page xrp-cover">
      <div className="xrp-cover-bg" />
      <div className="xrp-cover-top">
        <BrandLogo size={20} onDark />
        <span className="xrp-cover-kicker">Informe confidencial</span>
      </div>

      <div className="xrp-cover-mid">
        <div className="xrp-cover-eyebrow">Plan de acción GEO</div>
        <h1 className="xrp-cover-title">Optimización de visibilidad en respuestas de IA</h1>
        <p className="xrp-cover-sub">
          Diagnóstico y hoja de ruta de {planCount} recomendaciones priorizadas para mejorar cómo la IA representa a
          la marca en sus respuestas.
        </p>
      </div>

      <div className="xrp-cover-meta">
        <div className="xrp-cover-meta-item">
          <span className="xrp-cover-meta-label">Cliente</span>
          <span className="xrp-cover-meta-value">{domain || "—"}</span>
        </div>
        <div className="xrp-cover-meta-item">
          <span className="xrp-cover-meta-label">Fecha del escaneo</span>
          <span className="xrp-cover-meta-value">{scanDateLabel ?? "—"}</span>
        </div>
        {geoScore !== null && (
          <div className="xrp-cover-meta-item">
            <span className="xrp-cover-meta-label">Puntuación GEO</span>
            <span className="xrp-cover-meta-value xrp-cover-meta-accent">{geoScore} / 100</span>
          </div>
        )}
      </div>
    </section>
  );
}

function ExportReportContent({
  domain,
  plan,
  rest,
}: {
  domain: string;
  plan: ExportPlanRecommendation[];
  rest: ExportPlanRecommendation[];
}) {
  return (
    <section className="xrp-page xrp-content">
      <header className="xrp-content-head">
        <BrandLogo size={15} />
        <span className="xrp-content-head-context">
          {domain || "—"} · Plan de acción GEO
        </span>
      </header>

      <ExportReportSection index="01" title="Alta prioridad" items={plan} numberPrefix="1" />
      {rest.length > 0 && <ExportReportSection index="02" title="Resto de recomendaciones" items={rest} numberPrefix="2" />}

      <div className="xrp-footer">
        <span>Generado por GenScore · genscore.ai</span>
        <span>{domain || "—"} · Plan de acción GEO</span>
      </div>
    </section>
  );
}

function ExportReportSection({
  index,
  title,
  items,
  numberPrefix,
}: {
  index: string;
  title: string;
  items: ExportPlanRecommendation[];
  numberPrefix: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="xrp-section">
      <div className="xrp-section-head">
        <span className="xrp-section-index">{index}</span>
        <h2 className="xrp-section-title">{title}</h2>
      </div>
      <div className="xrp-items">
        {items.map((rec, i) => (
          <ExportReportItem key={`${rec.title}-${i}`} rec={rec} number={`${numberPrefix}.${i + 1}`} />
        ))}
      </div>
    </div>
  );
}

function ExportReportItem({ rec, number }: { rec: ExportPlanRecommendation; number: string }) {
  const showPoints = typeof rec.potentialPoints === "number" && rec.potentialPoints >= MIN_VISIBLE_POINTS;
  const engines = recommendationEngineLabels(rec);
  const step = rec.evidence_json?.first_step;

  return (
    <div className="xrp-item">
      <div className="xrp-item-head">
        <span className="xrp-item-title">
          {number} {rec.title}
        </span>
        {showPoints && (
          <span className="xrp-item-pts">
            +{formatPoints(rec.potentialPoints as number)} pt {pointsCaption(rec.recommendation_type)}
          </span>
        )}
      </div>
      <p className="xrp-item-desc">{rec.description}</p>
      {step && <p className="xrp-item-step">Empieza por aquí: {step}</p>}
      {engines.length > 0 && <p className="xrp-item-engines">Fuente: {engines.join(", ")}</p>}
    </div>
  );
}
