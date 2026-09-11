import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MIN_VISIBLE_POINTS, formatPoints } from "@/lib/recommendations/plan";
import { recommendationEngineLabels, type ExportPlanRecommendation } from "@/lib/recommendations/export-plan";
import { pointsCaption } from "@/lib/recommendations/deliverable";
import { BrandLogo } from "@/components/ui/brand-logo";

/**
 * PDF-EXPORT-PLAN-1 (docs/design-reference/pdf-export-plan-1/) — el informe
 * que sustituye al `.md` de "Exportar plan". Sólo se hace visible por
 * `@media print` en export-report.css — `handleExport` en
 * recommendations-client.tsx dispara `window.print()`, nunca genera el PDF
 * por sí mismo. Puramente presentacional: no toca `Date.now()`, no decide
 * qué es "plan" vs. "resto" (eso lo decide `selectPlan` en el servidor,
 * igual que el `.md` que sustituye).
 *
 * Se monta con `createPortal` directamente en `document.body`, no en el
 * sitio donde `<ExportReport>` aparece en el árbol de React (dentro del
 * layout de la consola, con su barra lateral, su cabecera fija y su
 * contenedor responsive). Antes de esto la portada salía deformada en
 * dispositivos reales (log §217) — probado en Chromium headless sobre un
 * HTML aislado, donde SÍ salía bien, porque ese arnés no tenía ningún
 * ancestro con `overflow`/`transform` que interfiriera. `visibility:hidden`
 * en el resto de la página no protege de la caja de layout de esos
 * ancestros — sólo de que se VEAN, no de que seguían constriñendo el
 * tamaño/posición de todo lo que cuelga dentro. Como hijo directo de
 * `body`, el informe no hereda nada de eso.
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
  // `document` no existe durante el render en servidor — el portal sólo se
  // crea tras montar en el cliente, mismo patrón que cualquier otro uso de
  // createPortal en Next.js App Router.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div className="xrp-root" aria-hidden="true">
      <ExportReportCover domain={domain} geoScore={geoScore} scanDateLabel={scanDateLabel} planCount={plan.length} />
      <ExportReportContent domain={domain} plan={plan} rest={rest} />
    </div>,
    document.body,
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
      {/* El resplandor del artboard es una imagen incrustada (data URI) en
          `.xrp-cover` — ver export-report.css. Ni SVG ni degradado CSS:
          los dos dependen de que el motor de impresión sepa rasterizar un
          gradiente con alfa, y WebKit no siempre lo hace (log §217, §218). */}
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
