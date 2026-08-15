import { SMALL_SAMPLE_THRESHOLD } from "@/lib/web-audit/sample-confidence";
import { formatDate } from "./format";

/**
 * PRELAUNCH-HARDENING-1 Fase R7 — un trozo de la pantalla de Auditoría web.
 *
 * `page.tsx` tenía 1.933 líneas con catorce componentes de presentación
 * definidos dentro, así que para cambiar una fila había que navegar la página
 * entera. Son todos componentes de servidor y puros: reciben datos ya
 * calculados y devuelven marcado. Cero cambios de lógica y cero cambios de
 * marcado — el `ux-pilot` es quien lo verifica, porque esta fase SÍ toca UI
 * (log §83).
 */

export type TrendChartPoint = {
  generatedAt: string;
  coveragePct: number | null;
  surfacingPct: number | null;
  conclusiveCount: number;
  coveredCount: number;
};

/**
 * A hollow (stroke-only) point marker instead of the usual filled dot when
 * that point's sample is small (WEB-AUDIT-R6 phase 1, geo-strategy review
 * 2026-07-17) — a visual cue, per point along the whole series, that a swing
 * around a hollow marker is more likely sampling noise than real movement.
 * The legend below the chart spells this out in words too, never relying on
 * the shape alone.
 */
function TrendPointMarker({ cx, cy, color, isLast, isSmallSample }: { cx: number; cy: number; color: string; isLast: boolean; isSmallSample: boolean }) {
  const r = isLast ? 4 : 3;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill={isSmallSample ? "var(--surface)" : color}
      stroke={color}
      strokeWidth={isSmallSample ? 1.5 : 2}
    />
  );
}

export function TrendChart({ points }: { points: TrendChartPoint[] }) {
  const W = 440;
  const H = 190;
  const padL = 42;
  const padR = 12;
  const top = 18;
  const bottom = 170;
  const stepX = points.length > 1 ? (W - padL - padR) / (points.length - 1) : 0;
  const yFor = (pct: number) => bottom - (pct / 100) * (bottom - top);
  const xFor = (i: number) => padL + i * stepX;

  function pathFor(key: "coveragePct" | "surfacingPct"): string | null {
    const coords: string[] = [];
    points.forEach((p, i) => {
      const v = p[key];
      if (v === null) return;
      coords.push(`${i === 0 || coords.length === 0 ? "M" : "L"} ${xFor(i)} ${yFor(v)}`);
    });
    return coords.length > 0 ? coords.join(" ") : null;
  }

  const covPath = pathFor("coveragePct");
  const surPath = pathFor("surfacingPct");
  const lastCovIdx = [...points].map((p, i) => ({ p, i })).reverse().find(({ p }) => p.coveragePct !== null)?.i;
  const lastSurIdx = [...points].map((p, i) => ({ p, i })).reverse().find(({ p }) => p.surfacingPct !== null)?.i;

  const ariaLabel = `Cobertura ${points[0]?.coveragePct ?? "sin dato"}% a ${lastCovIdx !== undefined ? points[lastCovIdx].coveragePct : "sin dato"}%; implementación ${points[0]?.surfacingPct ?? "sin dato"}% a ${lastSurIdx !== undefined ? points[lastSurIdx].surfacingPct : "sin dato"}% en ${points.length} auditorías.`;

  // Consecutive audits over the same scan share a calendar date — render each
  // date label once (founder screenshot: "9 jul 2026 · 9 jul 20…" repeated,
  // truncated, on the x-axis).
  const xLabels = points.map((p) => formatDate(p.generatedAt));

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
      <g stroke="var(--line-soft)" strokeWidth={1}>
        {[0, 25, 50, 75, 100].map((pct) => (
          <line key={pct} x1={padL} y1={yFor(pct)} x2={W - padR} y2={yFor(pct)} />
        ))}
      </g>
      <g fontSize={10} fill="var(--ink-4)" textAnchor="end">
        {[100, 75, 50, 25, 0].map((pct) => (
          <text key={pct} x={padL - 6} y={yFor(pct) + 3}>
            {pct}%
          </text>
        ))}
      </g>
      <g fontSize={10} fill="var(--ink-4)" textAnchor="middle">
        {points.map((p, i) => {
          if (i > 0 && xLabels[i] === xLabels[i - 1]) return null;
          return (
            <text key={p.generatedAt} x={xFor(i)} y={H - 4}>
              {xLabels[i]}
            </text>
          );
        })}
      </g>
      {covPath && <path d={covPath} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
      {surPath && <path d={surPath} fill="none" stroke="var(--pos)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
      {points.map((p, i) =>
        p.coveragePct !== null ? (
          <TrendPointMarker
            key={`cov-${p.generatedAt}`}
            cx={xFor(i)}
            cy={yFor(p.coveragePct)}
            color="var(--accent)"
            isLast={i === lastCovIdx}
            isSmallSample={p.conclusiveCount < SMALL_SAMPLE_THRESHOLD}
          />
        ) : null
      )}
      {points.map((p, i) =>
        p.surfacingPct !== null ? (
          <TrendPointMarker
            key={`sur-${p.generatedAt}`}
            cx={xFor(i)}
            cy={yFor(p.surfacingPct)}
            color="var(--pos)"
            isLast={i === lastSurIdx}
            isSmallSample={p.coveredCount < SMALL_SAMPLE_THRESHOLD}
          />
        ) : null
      )}
    </svg>
  );
}
