"use client";

import { useState, type MouseEvent } from "react";
import { buildSeriesPaths, DEFAULT_VISIBLE_SERIES, MIN_TREND_POINTS } from "@/lib/competitors/trend-window";

export type TrendSeries = {
  key: string;
  label: string;
  color: string;
  isBrand?: boolean;
};

export type TrendPoint = {
  date: string;
  values: Record<string, number | null | undefined>;
};

type PositionTrendChartProps = {
  series: TrendSeries[];
  data: TrendPoint[];
  maxPosition: number;
  /**
   * Qué series nacen encendidas. Omitirlo = las primeras `DEFAULT_VISIBLE`,
   * que es lo que hacía antes de log §177.
   */
  defaultVisibleKeys?: readonly string[];
};

const W = 640;
const H = 240;
const PAD_LEFT = 34;
/** Room for the end-of-line labels that replace legend-chip cross-referencing. */
const PAD_RIGHT = 96;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;

/** Alias local: la constante vive en `trend-window.ts` — ver allí por qué. */
const DEFAULT_VISIBLE = DEFAULT_VISIBLE_SERIES;

export function PositionTrendChart({
  series,
  data,
  maxPosition,
  defaultVisibleKeys
}: PositionTrendChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  // `defaultVisibleKeys` gana cuando viene, porque «qué se enciende» y «en qué
  // orden se listan las pastillas» son dos preguntas distintas y la pantalla
  // sabe responder mejor la primera: sólo ella conoce cuál es la marca propia y
  // qué puesto ocupa (log §177). Sin ella, el comportamiento de siempre.
  const [hidden, setHidden] = useState<Set<string>>(() => {
    if (defaultVisibleKeys) {
      const on = new Set(defaultVisibleKeys);
      return new Set(series.filter((s) => !on.has(s.key)).map((s) => s.key));
    }
    return new Set(series.slice(DEFAULT_VISIBLE).map((s) => s.key));
  });

  if (data.length < MIN_TREND_POINTS) return null;

  const visible = series.filter((s) => !hidden.has(s.key));
  const plotW = W - PAD_LEFT - PAD_RIGHT;
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const yMax = Math.max(maxPosition, 2);

  const xFor = (i: number) => PAD_LEFT + (i / (data.length - 1)) * plotW;
  const yFor = (pos: number) => PAD_TOP + ((pos - 1) / (yMax - 1)) * plotH;

  const tickCount = Math.min(Math.ceil(yMax), 5);
  const yTicks: number[] = [];
  for (let i = 0; i < tickCount; i++) {
    const raw = 1 + (i / (tickCount - 1)) * (yMax - 1);
    yTicks.push(Math.round(raw * 10) / 10);
  }

  const toggle = (key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleMove = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const ratio = (x - PAD_LEFT) / plotW;
    const idx = Math.round(ratio * (data.length - 1));
    setHoverIdx(Math.max(0, Math.min(data.length - 1, idx)));
  };

  /**
   * Last point a series actually has a value for — where its end label goes.
   * A series whose most recent scans are all gaps gets labelled at its real
   * last reading rather than pinned to the right edge, which would imply data
   * that isn't there.
   */
  const lastPointOf = (key: string): { i: number; v: number } | null => {
    for (let i = data.length - 1; i >= 0; i--) {
      const v = data[i].values[key];
      if (v != null) return { i, v };
    }
    return null;
  };

  // Nudge colliding end labels apart so four series never overprint.
  const endLabels = visible
    .map((s) => {
      const last = lastPointOf(s.key);
      return last ? { s, x: xFor(last.i), y: yFor(last.v) } : null;
    })
    .filter((l): l is { s: TrendSeries; x: number; y: number } => l !== null)
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < endLabels.length; i++) {
    const gap = endLabels[i].y - endLabels[i - 1].y;
    if (gap < 13) endLabels[i].y = endLabels[i - 1].y + 13;
  }

  return (
    <div style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        /* Glyph advances are laid out at the authored size and snapped to the
           device pixel grid BEFORE the fixed viewBox is scaled to the container
           width, so at some scale factors the rounding accumulates into a
           visible gap mid-word — the brand's own end label rendered "Maho u" at
           1280px and correctly at 768 and 375 (pilot, 2026-08-03). Asking for
           geometric precision positions glyphs exactly instead of hinting them,
           which is what makes the artifact scale-independent. */
        textRendering="geometricPrecision"
        style={{ display: "block", overflow: "visible" }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <text x={PAD_LEFT - 8} y={PAD_TOP - 6} textAnchor="end" fontSize="9" fill="var(--ink-4)">
          1º
        </text>

        {yTicks.map((t) => (
          <g key={t}>
            <line x1={PAD_LEFT} x2={W - PAD_RIGHT} y1={yFor(t)} y2={yFor(t)} stroke="var(--line-soft)" strokeWidth="1" />
            <text x={PAD_LEFT - 8} y={yFor(t)} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="var(--ink-4)">
              {t % 1 === 0 ? t : t.toFixed(1)}
            </text>
          </g>
        ))}

        {[0, data.length - 1].map((i) => (
          <text key={i} x={xFor(i)} y={H - 8} textAnchor={i === 0 ? "start" : "end"} fontSize="10" fill="var(--ink-4)">
            {new Date(data[i].date).toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "Europe/Madrid" })}
          </text>
        ))}

        {visible.map((s) => {
          // Straight segments between measurements — see buildSeriesPaths for
          // why this is not a step chart.
          const segments = buildSeriesPaths(
            data.map((d, i) => {
              const v = d.values[s.key];
              return v == null ? null : { x: xFor(i), y: yFor(v) };
            })
          );

          return (
            <g key={s.key}>
              {segments.map((d, idx) => (
                <path
                  key={idx}
                  d={d}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={s.isBrand ? 2.6 : 1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {data.map((d, i) => {
                const v = d.values[s.key];
                if (v == null) return null;
                return (
                  <circle
                    key={i}
                    cx={xFor(i)}
                    cy={yFor(v)}
                    r={i === hoverIdx ? 3.5 : 2}
                    fill={s.color}
                    stroke="var(--surface)"
                    strokeWidth={i === hoverIdx ? 1.5 : 0}
                  />
                );
              })}
            </g>
          );
        })}

        {/* Identity at the end of the line, so nobody has to hold eight colours
            in their head while reading a legend. */}
        {endLabels.map(({ s, x, y }) => (
          <text
            key={s.key}
            x={x + 9}
            y={y}
            dominantBaseline="middle"
            fontSize="10.5"
            fontWeight={s.isBrand ? 700 : 500}
            fill="var(--ink-2)"
          >
            {s.label.length > 13 ? `${s.label.slice(0, 12)}…` : s.label}
          </text>
        ))}

        {hoverIdx !== null && (
          <line
            x1={xFor(hoverIdx)}
            x2={xFor(hoverIdx)}
            y1={PAD_TOP}
            y2={H - PAD_BOTTOM}
            stroke="var(--line-strong)"
            strokeWidth="1"
            strokeDasharray="2 2"
          />
        )}
      </svg>

      {/* The greyed-out chips are OFF, not broken. Only the first
          DEFAULT_VISIBLE series start on, and the founder read the rest as
          disabled ("¿por qué brave, protón, etc salen deshabilitados?") — a
          toggle that looks dead is a toggle nobody presses. Hence the hint and
          a lighter dimming than the old 0.5, which read as "unavailable". */}
      <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 12 }}>
        Toca una marca para mostrarla u ocultarla en el gráfico.
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 7 }}>
        {series.map((s) => {
          const isHidden = hidden.has(s.key);
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => toggle(s.key)}
              aria-pressed={!isHidden}
              title={isHidden ? `Mostrar ${s.label}` : `Ocultar ${s.label}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 9px",
                borderRadius: 999,
                border: "1px solid var(--line)",
                background: isHidden ? "transparent" : "var(--surface)",
                cursor: "pointer",
                font: "inherit",
                fontSize: 12,
                opacity: isHidden ? 0.8 : 1
              }}
            >
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 2,
                  background: isHidden ? "transparent" : s.color,
                  border: `1.5px solid ${s.color}`,
                  display: "inline-block"
                }}
              />
              <span style={{ color: isHidden ? "var(--ink-3)" : "var(--ink-2)", fontWeight: s.isBrand ? 700 : 500 }}>
                {s.label}
              </span>
            </button>
          );
        })}
      </div>

      {hoverIdx !== null && visible.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: 8,
            left: `${(xFor(hoverIdx) / W) * 100}%`,
            transform: "translateX(-50%)",
            background: "var(--surface)",
            border: "1px solid var(--line-strong)",
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 12,
            boxShadow: "var(--sh-2)",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            zIndex: 2
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4, color: "var(--ink)" }}>
            {new Date(data[hoverIdx].date).toLocaleDateString("es-ES", {
              day: "numeric",
              month: "short",
              year: "numeric",
              timeZone: "Europe/Madrid"
            })}
          </div>
          {visible.map((s) => {
            const v = data[hoverIdx].values[s.key];
            return (
              <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ink-2)" }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: "inline-block" }} />
                <span>{s.label}:</span>
                <b className="tnum">{v != null ? `${v.toFixed(1)}º` : "sin mención"}</b>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
