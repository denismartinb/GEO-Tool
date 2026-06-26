"use client";

import { useState, type MouseEvent } from "react";

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
};

const W = 640;
const H = 240;
const PAD_LEFT = 34;
const PAD_RIGHT = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;

export function PositionTrendChart({ series, data, maxPosition }: PositionTrendChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (data.length < 2) return null;

  const plotW = W - PAD_LEFT - PAD_RIGHT;
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const yMax = Math.max(maxPosition, 2);

  const xFor = (i: number) => PAD_LEFT + (i / (data.length - 1)) * plotW;
  const yFor = (pos: number) => PAD_TOP + ((pos - 1) / (yMax - 1)) * plotH;

  const tickCount = Math.min(yMax, 5);
  const yTicks: number[] = [];
  for (let i = 0; i < tickCount; i++) {
    const raw = 1 + (i / (tickCount - 1)) * (yMax - 1);
    yTicks.push(Math.round(raw * 10) / 10);
  }

  const handleMove = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const ratio = (x - PAD_LEFT) / plotW;
    const idx = Math.round(ratio * (data.length - 1));
    setHoverIdx(Math.max(0, Math.min(data.length - 1, idx)));
  };

  return (
    <div style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        style={{ display: "block", overflow: "visible" }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line
              x1={PAD_LEFT}
              x2={W - PAD_RIGHT}
              y1={yFor(t)}
              y2={yFor(t)}
              stroke="var(--line-soft)"
              strokeWidth="1"
            />
            <text x={PAD_LEFT - 8} y={yFor(t)} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="var(--ink-4)">
              {t % 1 === 0 ? t : t.toFixed(1)}
            </text>
          </g>
        ))}

        {[0, data.length - 1].map((i) => (
          <text
            key={i}
            x={xFor(i)}
            y={H - 8}
            textAnchor={i === 0 ? "start" : "end"}
            fontSize="10"
            fill="var(--ink-4)"
          >
            {new Date(data[i].date).toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "Europe/Madrid" })}
          </text>
        ))}

        {series.map((s) => {
          const segments: string[] = [];
          let current: string[] = [];
          data.forEach((d, i) => {
            const v = d.values[s.key];
            if (v === null || v === undefined) {
              if (current.length) {
                segments.push(current.join(" "));
                current = [];
              }
              return;
            }
            current.push(`${current.length === 0 ? "M" : "L"}${xFor(i).toFixed(1)} ${yFor(v).toFixed(1)}`);
          });
          if (current.length) segments.push(current.join(" "));

          return (
            <g key={s.key}>
              {segments.map((d, idx) => (
                <path
                  key={idx}
                  d={d}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={s.isBrand ? 2.5 : 1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {data.map((d, i) => {
                const v = d.values[s.key];
                if (v === null || v === undefined) return null;
                return <circle key={i} cx={xFor(i)} cy={yFor(v)} r={i === hoverIdx ? 3.5 : 2} fill={s.color} />;
              })}
            </g>
          );
        })}

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

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10, fontSize: 12 }}>
        {series.map((s) => (
          <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: s.color, display: "inline-block" }} />
            <span style={{ color: "var(--ink-2)", fontWeight: s.isBrand ? 700 : 500 }}>{s.label}</span>
          </div>
        ))}
      </div>

      {hoverIdx !== null && (
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
            zIndex: 2,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4, color: "var(--ink)" }}>
            {new Date(data[hoverIdx].date).toLocaleDateString("es-ES", {
              day: "numeric",
              month: "short",
              year: "numeric",
              timeZone: "Europe/Madrid",
            })}
          </div>
          {series.map((s) => {
            const v = data[hoverIdx].values[s.key];
            return (
              <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ink-2)" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, display: "inline-block" }} />
                <span>{s.label}:</span>
                <b className="tnum">{v != null ? v.toFixed(1) : "—"}</b>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
