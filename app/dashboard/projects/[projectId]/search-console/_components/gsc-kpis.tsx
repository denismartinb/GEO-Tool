import type { DailyPoint, IndexSummary, SearchConsoleReport } from "@/lib/search-console/report";
import { fmtDeltaPct, fmtInt } from "./format";

/**
 * The three KPI tiles of «Posición en Google» (log §284, design in
 * docs/design-reference/search-seo-1/maqueta.html, screen "gsc"). Deltas are
 * against the 28 days before; a delta Google cannot support (nothing to
 * compare with) is not shown.
 */

function Spark({ values, color, invert = false }: { values: number[]; color: string; invert?: boolean }) {
  if (values.length < 2) return null;
  const w = 160;
  const h = 30;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = invert ? ((v - min) / span) * h : h - ((v - min) / span) * h;
      return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg className="gsc-spark" viewBox="0 0 160 30" preserveAspectRatio="none" aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
    </svg>
  );
}

function DeltaLine({ text, tone }: { text: string | null; tone: "up" | "down" | "flat" }) {
  if (!text) return <span className="gsc-kpi-d gsc-muted">sin periodo anterior</span>;
  return (
    <span className={`gsc-kpi-d gsc-${tone}`}>
      {text} <span className="gsc-muted">vs 28 días antes</span>
    </span>
  );
}

function pctTone(pct: number | null): "up" | "down" | "flat" {
  if (pct === null || Math.round(pct) === 0) return "flat";
  return pct > 0 ? "up" : "down";
}

export function GscKpis({
  report,
  daily,
  index,
  uninspected
}: {
  report: SearchConsoleReport;
  daily: DailyPoint[];
  index: IndexSummary | null;
  uninspected: number;
}) {
  const notIndexed = index ? index.total - index.indexed : 0;
  return (
    <div className="gsc-kpis">
      <div className="card gsc-kpi">
        <span className="gsc-kpi-k">Clics</span>
        <span className="gsc-kpi-v">{fmtInt(report.clicks.value)}</span>
        <DeltaLine
          text={report.clicks.deltaPct === null ? null : fmtDeltaPct(report.clicks.deltaPct)}
          tone={pctTone(report.clicks.deltaPct)}
        />
        <Spark values={daily.map((d) => d.clicks)} color="#2563eb" />
      </div>
      <div className="card gsc-kpi">
        <span className="gsc-kpi-k">Impresiones</span>
        <span className="gsc-kpi-v">{fmtInt(report.impressions.value)}</span>
        <DeltaLine
          text={report.impressions.deltaPct === null ? null : fmtDeltaPct(report.impressions.deltaPct)}
          tone={pctTone(report.impressions.deltaPct)}
        />
        <Spark values={daily.map((d) => d.impressions)} color="#09c5d6" />
      </div>
      <div className="card gsc-kpi">
        <span className="gsc-kpi-k">Páginas indexadas</span>
        {index ? (
          <>
            <span className="gsc-kpi-v">
              {index.indexed}/{index.total}
            </span>
            <span className={`gsc-kpi-d ${notIndexed > 0 ? "gsc-down" : "gsc-up"}`}>
              {notIndexed > 0 ? `${notIndexed} fuera` : "Todas dentro"}{" "}
              <span className="gsc-muted">de las revisadas</span>
            </span>
            <div className="gsc-track">
              <div className="gsc-fill" style={{ width: `${(index.indexed / index.total) * 100}%` }} />
            </div>
          </>
        ) : (
          <>
            <span className="gsc-kpi-v">—</span>
            <span className="gsc-kpi-d gsc-muted">
              {uninspected > 0 ? "Google no respondió esta vez" : "Sin páginas revisadas todavía"}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
