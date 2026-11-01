import { GoogleMark } from "@/components/search-console/google-mark";
import { loadSearchConsoleScreen, type SearchConsoleState } from "@/lib/search-console/load";
import type { DailyPoint, SearchConsoleReport } from "@/lib/search-console/report";
import { GscConnectPanel } from "./gsc-connect-invite";
import { fmtDay, fmtDeltaPct, fmtInt, fmtPosition } from "../search-console/_components/format";

/**
 * The Google half of Visión general's Auditoría SEO card (SEARCH-SEO-1 Fase
 * 3, log §284; design: the "Buscadores" card of
 * docs/design-reference/search-seo-1/maqueta.html). The invitation to connect
 * is GSC-CONNECT-CTA-1 (log §313). Clicks and average
 * position of the last 28 days, and how many searches sit on Google's page 2.
 *
 * «Instrumento» layout (log §352): the second column of the SEO card's grid.
 * GSC-OVERVIEW-RICH-1 (log §413): the same reading as the Chrome panel
 * (EXT-GSC-2, log §411): clicks with their change and one line per day,
 * average position with its move, impressions, the position over time and
 * «Casi en la página 1». It reads `loadSearchConsoleScreen` without
 * inspections, so it shares the 30-minute `screen-rows` cache with
 * Recomendaciones and the extension. On desktop the chart and «Casi en la
 * página 1» sit in a row under both halves (`.gx-b`, app/ins/overview.css).
 *
 * Rendered inside a Suspense boundary so Google's latency never holds up the
 * rest of the Overview. Not connected → an invitation to connect. Feature not
 * configured or table missing → nothing (the page does not even open the
 * column). Google failing or answering with no searches → the column says so
 * instead of a number we could not read.
 */
export async function GscOverviewHalf({
  projectId,
  ownerUserId,
  domain
}: {
  projectId: string;
  ownerUserId: string;
  domain: string;
}) {
  const state = await loadSearchConsoleScreen(projectId, ownerUserId, domain, [], [], false);
  return <GscOverviewHalfView projectId={projectId} state={state} />;
}

function Head() {
  return (
    <div className="k">
      <GoogleMark size={13} />
      Google · 28 días
    </div>
  );
}

/** Same column, same height, while Google answers. */
export function GscOverviewHalfSkeleton() {
  return (
    <div aria-busy="true">
      <Head />
      <div className="bv">
        <span className="ins-skel-line" style={{ width: 120, height: 32 }} />
      </div>
      <div className="trio">
        <span className="ins-skel-line" style={{ width: 70, height: 30 }} />
        <span className="ins-skel-line" style={{ width: 70, height: 30 }} />
      </div>
    </div>
  );
}

/** What the half reads; a full `SearchConsoleScreen` fits it. */
export type GscOverviewHalfState =
  | SearchConsoleState
  | {
      kind: "ready";
      report: Pick<SearchConsoleReport, "clicks" | "impressions" | "position" | "daily" | "nearPage1" | "empty">;
    };

const NEAR_SHOWN = 2;

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 120;
  const h = 26;
  const max = Math.max(1, ...values);
  const pts = values
    .map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`)
    .join(" ");
  return (
    <svg className="gx-sp" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** A day without impressions has no position: it is a gap, never a 0. */
function dailyPositions(daily: DailyPoint[]): (number | null)[] {
  return daily.map((d) => (d.impressions > 0 && d.position && d.position > 0 ? d.position : null));
}

/** Gridlines for a position axis: round steps a little outside the data. */
function positionGrid(lo: number, hi: number): { min: number; max: number; grid: number[] } {
  const span = hi - lo;
  const step = span > 20 ? 10 : span > 8 ? 5 : span > 3 ? 2 : 1;
  const min = Math.max(1, Math.floor(lo / step) * step);
  let max = Math.ceil(hi / step) * step;
  if (max <= min) max = min + step;
  const grid: number[] = [];
  for (let v = min; v <= max; v += step) grid.push(v);
  return { min, max, grid };
}

/**
 * Average position per day in the console's line style (`LineChart`):
 * gridlines with their position, best at the top, the last day marked with
 * its value. A day without impressions breaks the line. Null when fewer
 * than two days have a position.
 *
 * The card's width changes a lot (phone, narrow and wide desktop), so the
 * line is a stretched SVG with non-scaling strokes and every label is HTML
 * placed by percentage: text never grows or shrinks with the card.
 */
function PositionChart({ daily }: { daily: DailyPoint[] }) {
  const vals = dailyPositions(daily);
  const known = vals.filter((v): v is number => v !== null);
  if (known.length < 2) return null;
  const { min, max, grid } = positionGrid(Math.min(...known), Math.max(...known));
  // Percent of the plot box. Position 1 is best: smaller values sit higher.
  const Y = (v: number) => ((v - min) / (max - min)) * 100;
  const X = (i: number) => (i * 100) / Math.max(1, vals.length - 1);
  const segments: { i: number; v: number }[][] = [];
  let run: { i: number; v: number }[] = [];
  vals.forEach((v, i) => {
    if (v === null) {
      if (run.length) segments.push(run);
      run = [];
    } else run.push({ i, v });
  });
  if (run.length) segments.push(run);
  let lastIdx = vals.length - 1;
  while (vals[lastIdx] === null) lastIdx -= 1;
  const lastVal = vals[lastIdx] as number;
  return (
    <div className="gx-ch">
      <div className="gx-sh">
        <b>Evolución del puesto</b>
        <span>Mejor arriba</span>
      </div>
      <div className="gx-plot" role="img" aria-label={`Puesto medio por día, del ${fmtDay(daily[0].date)} al ${fmtDay(daily[daily.length - 1].date)}`}>
        <div className="gx-yl" aria-hidden="true">
          {grid.map((v) => (
            <span key={v} style={{ top: `${Y(v)}%` }}>
              {v}
            </span>
          ))}
        </div>
        <div className="gx-box" aria-hidden="true">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none">
            {grid.map((v) => (
              <line key={v} x1={0} x2={100} y1={Y(v)} y2={Y(v)} stroke="var(--rule-2)" vectorEffect="non-scaling-stroke" />
            ))}
            {segments.map((seg, k) =>
              seg.length > 1 ? (
                <polyline
                  key={k}
                  points={seg.map((p) => `${X(p.i).toFixed(2)},${Y(p.v).toFixed(2)}`).join(" ")}
                  fill="none"
                  stroke="var(--blue)"
                  strokeWidth={1.6}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null
            )}
          </svg>
          {segments
            .filter((seg) => seg.length === 1)
            .map((seg) => (
              <i key={seg[0].i} className="gx-pt" style={{ left: `${X(seg[0].i)}%`, top: `${Y(seg[0].v)}%` }} />
            ))}
          <i className="gx-end" style={{ left: `${X(lastIdx)}%`, top: `${Y(lastVal)}%` }} />
          <b className="gx-ev num" style={{ top: `${Y(lastVal)}%` }}>
            {fmtPosition(lastVal)}
          </b>
        </div>
        <div className="gx-xl" aria-hidden="true">
          <span>{fmtDay(daily[0].date)}</span>
          <span>{fmtDay(daily[daily.length - 1].date)}</span>
        </div>
      </div>
    </div>
  );
}

export function GscOverviewHalfView({ projectId, state }: { projectId: string; state: GscOverviewHalfState }) {
  if (state.kind === "disconnected" || state.kind === "reconnect") {
    return (
      <div>
        <Head />
        {/* GSC-CONNECT-CTA-1 (log §313): a panel with what Google adds, and a
            button straight to Google's consent screen. */}
        <GscConnectPanel projectId={projectId} state={state.kind} />
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div>
        <Head />
        <p className="ov-note" style={{ marginTop: 10 }}>
          Google no ha respondido ahora mismo. Se volverá a leer en la próxima visita.
        </p>
      </div>
    );
  }
  if (state.kind !== "ready") return null;
  if (state.report.empty) {
    return (
      <div>
        <Head />
        <p className="ov-note" style={{ marginTop: 10 }}>
          Google no ha devuelto búsquedas de tu web en estos 28 días.
        </p>
      </div>
    );
  }

  const { clicks, impressions, position, daily, nearPage1 } = state.report;
  const pct = clicks.deltaPct;
  const impPct = impressions.deltaPct;
  const move = position.delta !== null && Math.abs(position.delta) >= 0.05 ? position.delta : null;
  const near = nearPage1.slice(0, NEAR_SHOWN);
  const hasChart = dailyPositions(daily).filter((v) => v !== null).length >= 2;
  return (
    <div className="gx">
      <div className="gx-a">
        <Head />
        <div className="gx-top">
          <div className="bv num">
            {fmtInt(clicks.value)}
            <small> clics</small>
          </div>
          {pct !== null && Math.round(pct) !== 0 ? (
            <span className={`gx-dp num ${pct > 0 ? "up" : "dn"}`}>{fmtDeltaPct(pct)}</span>
          ) : null}
        </div>
        <Spark values={daily.map((d) => d.clicks)} />
        <div className="trio">
          <span>
            <b className="num">
              {position.value === null ? "—" : fmtPosition(position.value)}
              {move !== null ? (
                <i className={`gx-mv ${move > 0 ? "up" : "dn"}`}>
                  {move > 0 ? "▲" : "▼"} {fmtPosition(Math.abs(move))}
                </i>
              ) : null}
            </b>
            Puesto medio
          </span>
          <span>
            <b className="num">
              {fmtInt(impressions.value)}
              {impPct !== null && Math.round(impPct) !== 0 ? (
                <i className={`gx-mv ${impPct > 0 ? "up" : "dn"}`}>{fmtDeltaPct(impPct)}</i>
              ) : null}
            </b>
            Impresiones
          </span>
        </div>
      </div>
      {hasChart || near.length > 0 ? (
        <div className="gx-b">
          {hasChart ? <PositionChart daily={daily} /> : null}
          {near.length > 0 ? (
            <div className="gx-near">
              <div className="gx-sh">
                <b>Casi en la página 1</b>
              </div>
              {near.map((q) => (
                <div key={q.query} className="gx-q">
                  <span className="t">{q.query}</span>
                  <span className="pp num">{fmtPosition(q.position)}</span>
                </div>
              ))}
              {/* Denis's line (2026-11-01, log §411). */}
              <p>Las más fáciles de subir. Ya te ven, hay que optimizarlas.</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
