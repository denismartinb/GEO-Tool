import type { TierShare } from "@/lib/search-console/insights";
import type { DailyPoint, PositionKpi } from "@/lib/search-console/report";
import { PositionTrendChart } from "./gsc-charts";
import { TIER_COLORS, fmtPosition, fmtShare } from "./format";

/**
 * «Tu posición en Google» (log §287): the average position with its change,
 * where the site's queries sit by tier, and the daily trend. Design in
 * docs/design-reference/search-seo-1/fase-3b/.
 */

function previousPosition(position: PositionKpi): number | null {
  return position.value === null || position.delta === null ? null : Math.round((position.value + position.delta) * 10) / 10;
}

export function GscPosition({ position, tiers, daily }: { position: PositionKpi; tiers: TierShare[]; daily: DailyPoint[] }) {
  const delta = position.delta;
  const prev = previousPosition(position);
  const total = tiers.reduce((sum, t) => sum + t.count, 0);
  return (
    <div className="card gsc-posblock">
      <div className="sa-ch">
        <h3>Tu posición en Google</h3>
        <span className="sa-src">Últimos 28 días</span>
      </div>
      <div className="gsc-pos-grid">
        <div>
          <span className="gsc-kpi-k">Puesto medio</span>
          <div className="gsc-pos-big">
            <b>{position.value === null ? "—" : fmtPosition(position.value)}</b>
            {delta !== null && delta !== 0 ? (
              <span className={`gsc-mv ${delta > 0 ? "gsc-up" : "gsc-down"}`}>
                {delta > 0 ? "▲" : "▼"} {fmtPosition(Math.abs(delta))} {Math.abs(delta) === 1 ? "puesto" : "puestos"}
              </span>
            ) : null}
          </div>
          <p className="gsc-pos-sub">
            {prev === null ? "Sin periodo anterior para comparar." : `En los 28 días anteriores estabas en el ${fmtPosition(prev)}.`}
          </p>
          <p className="gsc-pos-explain">
            Es la media de todas tus búsquedas, pesada por las veces que sales. Abajo tienes el puesto de cada una.
          </p>
        </div>
        <div>
          <span className="gsc-kpi-k">Dónde salen tus búsquedas</span>
          {total > 0 ? (
            <>
              <div className="gsc-tierbar" aria-hidden="true">
                {tiers
                  .filter((t) => t.count > 0)
                  .map((t) => (
                    <div key={t.key} style={{ width: `${t.share * 100}%`, background: TIER_COLORS[t.key] }} />
                  ))}
              </div>
              <ul className="gsc-tiers">
                {tiers.map((t) => (
                  <li key={t.key}>
                    <i style={{ background: TIER_COLORS[t.key] }} aria-hidden="true" />
                    <div>
                      <b>{t.label}</b> · {fmtShare(t.share)}
                      <span>{t.range}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="sa-empty">Todavía no hay búsquedas con puesto.</p>
          )}
        </div>
        <div>
          <div className="gsc-pos-trend-h">
            <span className="gsc-kpi-k">Evolución del puesto medio</span>
            <span className="gsc-muted">Mejor arriba ↑</span>
          </div>
          <PositionTrendChart daily={daily} />
        </div>
      </div>
    </div>
  );
}
