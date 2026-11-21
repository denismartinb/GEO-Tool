"use client";

import { useState } from "react";
import type { DailyPoint, QueryView } from "@/lib/search-console/report";
import { fmtDay, fmtInt, fmtPosition } from "./format";

/**
 * Charts of «Posición en Google» (log §284): daily clicks and impressions on
 * two axes, and queries by position and impressions with the Google-page
 * bands. SVG, no chart library. Hovering (or tapping) shows the data in a
 * tooltip; each point keeps its `<title>` for screen readers.
 */

function niceMax(value: number, step: number): number {
  return Math.max(step, Math.ceil(value / step) * step);
}

function stepFor(max: number): number {
  if (max <= 20) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  return magnitude / 2;
}

/**
 * Tooltip anchored at a viewBox point, as a percentage of the chart box. It
 * sits above the point, or below it when `below` (near the top edge, or inside
 * the daily chart's scroll box, which would clip it), and slides inwards near
 * the left and right edges.
 */
function ChartTip({ left, top, below, children }: { left: number; top: number; below?: boolean; children: React.ReactNode }) {
  const tx = left > 70 ? "calc(-100% + 14px)" : left < 30 ? "-14px" : "-50%";
  const ty = below ? "10px" : "calc(-100% - 4px)";
  return (
    <div className="gsc-tip" style={{ left: `${left}%`, top: `${top}%`, transform: `translate(${tx}, ${ty})` }} role="status">
      {children}
    </div>
  );
}

export function ClicksImpressionsChart({ daily }: { daily: DailyPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (daily.length < 2) {
    return <p className="sa-empty">Google todavía no tiene suficientes días con datos para dibujar la evolución.</p>;
  }
  const W = 640;
  const H = 300;
  const L = 40;
  const R = 54;
  const T = 12;
  const B = 26;
  const iw = W - L - R;
  const ih = H - T - B;
  const n = daily.length;
  const maxC = Math.max(...daily.map((d) => d.clicks));
  const maxI = Math.max(...daily.map((d) => d.impressions));
  const cMax = niceMax(maxC, stepFor(maxC));
  const iMax = niceMax(maxI, stepFor(maxI));
  const x = (i: number) => L + (i / (n - 1)) * iw;
  const yc = (v: number) => T + ih - (v / cMax) * ih;
  const yi = (v: number) => T + ih - (v / iMax) * ih;
  const iline = daily.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${yi(d.impressions).toFixed(1)}`).join(" ");
  const area = `M${x(0)} ${T + ih} ${daily.map((d, i) => `L${x(i).toFixed(1)} ${yi(d.impressions).toFixed(1)}`).join(" ")} L${x(n - 1)} ${T + ih}Z`;
  const cline = daily.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${yc(d.clicks).toFixed(1)}`).join(" ");
  const ticks = [0, 1, 2, 3, 4];
  const labelIdx = [...new Set([0, Math.round((n - 1) / 4), Math.round((n - 1) / 2), Math.round(((n - 1) * 3) / 4), n - 1])];
  const last = daily[n - 1];
  const h = hover === null ? null : daily[hover];

  return (
    <div className="gsc-chart-scroll">
      <div className="gsc-chart-box" onMouseLeave={() => setHover(null)}>
        <svg className="gsc-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Clics e impresiones diarios de los últimos 28 días">
          <defs>
            <linearGradient id="gsc-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#09c5d6" stopOpacity=".28" />
              <stop offset="1" stopColor="#09c5d6" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((k) => {
            const y = T + ih - (k / 4) * ih;
            return (
              <g key={k}>
                <line x1={L} x2={W - R} y1={y} y2={y} stroke="#eef1f6" className="gsc-grid" />
                <text x={L - 8} y={y + 3.5} textAnchor="end">
                  {fmtInt((cMax * k) / 4)}
                </text>
                <text x={W - R + 8} y={y + 3.5}>
                  {fmtInt((iMax * k) / 4)}
                </text>
              </g>
            );
          })}
          {labelIdx.map((i) => (
            <text key={i} x={x(i)} y={H - 6} textAnchor="middle">
              {fmtDay(daily[i].date)}
            </text>
          ))}
          <path d={area} fill="url(#gsc-area)" />
          <path d={iline} fill="none" stroke="#7fd9e3" strokeWidth={1.6} />
          <path d={cline} fill="none" stroke="#2563eb" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
          {h === null || hover === null ? (
            <circle cx={x(n - 1)} cy={yc(last.clicks)} r={4.5} fill="#2563eb" stroke="#fff" strokeWidth={2} className="gsc-ring" />
          ) : (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={T} y2={T + ih} stroke="#98a2b3" strokeDasharray="3 3" className="gsc-cursor" />
              <circle cx={x(hover)} cy={yi(h.impressions)} r={4} fill="#7fd9e3" stroke="#fff" strokeWidth={2} className="gsc-ring" />
              <circle cx={x(hover)} cy={yc(h.clicks)} r={4.5} fill="#2563eb" stroke="#fff" strokeWidth={2} className="gsc-ring" />
            </g>
          )}
          {daily.map((d, i) => (
            <rect
              key={d.date}
              x={x(i) - iw / (n - 1) / 2}
              y={T}
              width={iw / (n - 1)}
              height={ih}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onClick={() => setHover(i)}
            >
              <title>{`${fmtDay(d.date)}: ${fmtInt(d.clicks)} clics · ${fmtInt(d.impressions)} impresiones`}</title>
            </rect>
          ))}
        </svg>
        {h !== null && hover !== null ? (
          <ChartTip left={(x(hover) / W) * 100} top={(T / H) * 100} below>
            <b>{fmtDay(h.date)}</b>
            <span>
              <i style={{ background: "#2563eb" }} />
              {fmtInt(h.clicks)} clics
            </span>
            <span>
              <i style={{ background: "#7fd9e3" }} />
              {fmtInt(h.impressions)} impresiones
            </span>
          </ChartTip>
        ) : null}
      </div>
    </div>
  );
}

const SCATTER_MAX_POSITION = 30;
const SCATTER_MAX_POINTS = 60;

export function NearPageOneScatter({ queries }: { queries: QueryView[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const points = queries
    .filter((q) => q.position <= SCATTER_MAX_POSITION)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, SCATTER_MAX_POINTS);
  if (points.length === 0) {
    return <p className="sa-empty">Todavía no sales entre los 30 primeros resultados para ninguna búsqueda.</p>;
  }
  const W = 480;
  const H = 280;
  const L = 54;
  const R = 12;
  const T = 34;
  const B = 34;
  const iw = W - L - R;
  const ih = H - T - B;
  const maxI = Math.max(...points.map((q) => q.impressions));
  const iMax = niceMax(maxI, stepFor(maxI));
  const x = (p: number) => L + ((p - 1) / (SCATTER_MAX_POSITION - 1)) * iw;
  const y = (v: number) => T + ih - (v / iMax) * ih;
  const pages = [
    { label: "Página 1", from: L, to: x(10.5), key: "p1" },
    { label: "Página 2", from: x(10.5), to: x(20.5), key: "p2" },
    { label: "Página 3", from: x(20.5), to: W - R, key: "p3" }
  ];
  const h = points.find((q) => q.query === hover) ?? null;
  const radius = (q: QueryView) => 5 + Math.min(10, Math.sqrt(q.clicks) * 0.7);

  return (
    <div className="gsc-chart-box gsc-scatter" onMouseLeave={() => setHover(null)}>
      <svg className="gsc-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Búsquedas por puesto en Google e impresiones">
        <rect x={x(10.5)} y={T} width={x(20.5) - x(10.5)} height={ih} fill="#2563eb" fillOpacity={0.07} />
        {pages.map((p) => (
          <g key={p.key} className={`gsc-page-head${p.key === "p2" ? " is-p2" : ""}`}>
            <rect x={p.from + 1.5} y={4} width={p.to - p.from - 3} height={20} rx={6} />
            <text x={(p.from + p.to) / 2} y={17.5} textAnchor="middle">
              {p.label}
            </text>
          </g>
        ))}
        {[10.5, 20.5].map((p) => (
          <line key={p} x1={x(p)} x2={x(p)} y1={T} y2={T + ih} stroke="#2563eb" strokeOpacity={0.35} strokeDasharray="3 3" />
        ))}
        {[0, 1, 2, 3].map((k) => {
          const yy = T + ih - (k / 3) * ih;
          return (
            <g key={k}>
              <line x1={L} x2={W - R} y1={yy} y2={yy} stroke="#eef1f6" className="gsc-grid" />
              <text x={L - 6} y={yy + 3.5} textAnchor="end">
                {fmtInt((iMax * k) / 3)}
              </text>
            </g>
          );
        })}
        {[1, 10, 20, 30].map((p) => (
          <text key={p} x={x(p)} y={H - 16} textAnchor="middle">
            {p}
          </text>
        ))}
        <text x={L + iw / 2} y={H - 2} textAnchor="middle">
          Puesto en Google →
        </text>
        <text x={10} y={T + ih / 2} textAnchor="middle" transform={`rotate(-90 10 ${T + ih / 2})`}>
          Impresiones
        </text>
        {points.map((q) => (
          <circle
            key={q.query}
            cx={x(q.position)}
            cy={y(q.impressions)}
            r={radius(q)}
            fill={q.nearPage1 ? "#2563eb" : q.position <= 10 ? "#15915a" : "#98a2b3"}
            fillOpacity={q.query === hover ? 1 : q.nearPage1 ? 0.85 : 0.55}
            stroke={q.query === hover ? "#0b1220" : "#fff"}
            strokeWidth={1.5}
            className={q.query === hover ? "gsc-bub is-h" : "gsc-bub"}
            style={{ cursor: "pointer" }}
            onMouseEnter={() => setHover(q.query)}
            onClick={() => setHover(q.query)}
          >
            <title>{`${q.query}: puesto ${fmtPosition(q.position)} · ${fmtInt(q.impressions)} impresiones · ${fmtInt(q.clicks)} clics`}</title>
          </circle>
        ))}
      </svg>
      {h ? (
        <ChartTip
          left={(x(h.position) / W) * 100}
          top={((y(h.impressions) < T + ih * 0.35 ? y(h.impressions) + radius(h) : y(h.impressions) - radius(h)) / H) * 100}
          below={y(h.impressions) < T + ih * 0.35}
        >
          <b>{h.query}</b>
          <span>Puesto {fmtPosition(h.position)}</span>
          <span>
            {fmtInt(h.impressions)} impresiones · {fmtInt(h.clicks)} clics
          </span>
        </ChartTip>
      ) : null}
    </div>
  );
}

/**
 * Daily average position (log §287). The axis is inverted: position 1 is the
 * top of Google, so better is up, as the label says.
 */
export function PositionTrendChart({ daily }: { daily: DailyPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const points = daily.filter((d): d is DailyPoint & { position: number } => typeof d.position === "number" && d.position > 0);
  if (points.length < 2) {
    return <p className="sa-empty">Google todavía no tiene suficientes días con datos para dibujar la evolución.</p>;
  }
  const W = 420;
  const H = 170;
  const L = 34;
  const R = 8;
  const T = 10;
  const B = 26;
  const iw = W - L - R;
  const ih = H - T - B;
  const n = points.length;
  const lo = Math.max(1, Math.floor(Math.min(...points.map((p) => p.position))));
  const hi = Math.max(lo + 2, Math.ceil(Math.max(...points.map((p) => p.position))));
  const x = (i: number) => L + (i / (n - 1)) * iw;
  const y = (pos: number) => T + ((pos - lo) / (hi - lo)) * ih;
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.position).toFixed(1)}`).join(" ");
  const ticks = [lo, Math.round((lo + hi) / 2), hi].filter((v, i, a) => a.indexOf(v) === i);
  const labelIdx = [...new Set([0, Math.round((n - 1) / 2), n - 1])];
  const h = hover === null ? null : points[hover];
  const first = points[0];
  const last = points[n - 1];

  return (
    <div className="gsc-chart-box" onMouseLeave={() => setHover(null)}>
      <svg
        className="gsc-chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Evolución del puesto medio: del ${fmtPosition(first.position)} al ${fmtPosition(last.position)}`}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#eef1f6" className="gsc-grid" />
            <text x={L - 6} y={y(v) + 3.5} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {labelIdx.map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>
            {fmtDay(points[i].date)}
          </text>
        ))}
        <path d={line} fill="none" stroke="#2563eb" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
        {h === null || hover === null ? (
          <circle cx={x(n - 1)} cy={y(last.position)} r={4.5} fill="#2563eb" stroke="#fff" strokeWidth={2} className="gsc-ring" />
        ) : (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={T + ih} stroke="#98a2b3" strokeDasharray="3 3" className="gsc-cursor" />
            <circle cx={x(hover)} cy={y(h.position)} r={4.5} fill="#2563eb" stroke="#fff" strokeWidth={2} className="gsc-ring" />
          </g>
        )}
        {points.map((p, i) => (
          <rect
            key={p.date}
            x={x(i) - iw / (n - 1) / 2}
            y={T}
            width={iw / (n - 1)}
            height={ih}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onClick={() => setHover(i)}
          >
            <title>{`${fmtDay(p.date)}: puesto medio ${fmtPosition(p.position)}`}</title>
          </rect>
        ))}
      </svg>
      {h !== null && hover !== null ? (
        <ChartTip
          left={(x(hover) / W) * 100}
          top={((y(h.position) < T + ih / 2 ? y(h.position) + 6 : y(h.position) - 6) / H) * 100}
          below={y(h.position) < T + ih / 2}
        >
          <b>{fmtDay(h.date)}</b>
          <span>Puesto medio {fmtPosition(h.position)}</span>
        </ChartTip>
      ) : null}
    </div>
  );
}
