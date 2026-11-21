import type { CSSProperties } from "react";

/** Axis range and gridlines for a 0-100 series: round numbers a little outside the data. */
export function chartRange(vals: readonly number[]): {
  min: number;
  max: number;
  grid: number[];
} {
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo;
  const step = span > 30 ? 10 : 5;
  let min = Math.max(0, Math.floor((lo - 2) / step) * step);
  let max = Math.min(100, Math.ceil((hi + 2) / step) * step);
  if (max - min < step * 2) max = Math.min(100, min + step * 2);
  if (max - min < step * 2) min = Math.max(0, max - step * 2);
  const grid: number[] = [];
  for (let v = min + step; v < max; v += step) grid.push(v);
  return { min, max, grid };
}

/** Thin line chart (`lineChart()` in the prototype). Dates are already formatted, e.g. "4 oct". */
export function LineChart({
  vals,
  dates,
  label,
  w = 560,
  h = 170,
}: {
  vals: readonly number[];
  dates: readonly string[];
  label: string;
  w?: number;
  h?: number;
}) {
  const { min, max, grid } = chartRange(vals);
  const L = 26;
  const R = 14;
  const T = 12;
  const B = 26;
  const Y = (v: number) => T + (1 - (v - min) / (max - min)) * (h - T - B);
  const X = (i: number) => L + (i * (w - L - R)) / (vals.length - 1);
  const last = vals.length - 1;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
      {grid.map((v) => (
        <g key={v}>
          <line x1={L} x2={w - R} y1={Y(v)} y2={Y(v)} stroke="var(--rule-2)" />
          <text className="ax" x={L - 8} y={Y(v) + 3.5} textAnchor="end">
            {v}
          </text>
        </g>
      ))}
      {vals.map((_, i) => (
        <g key={`x${i}`}>
          <line
            x1={X(i)}
            x2={X(i)}
            y1={h - B}
            y2={h - B + 5}
            stroke="var(--ink-4)"
          />
          <text className="ax" x={X(i)} y={h - 6} textAnchor="middle">
            {i === 0 || i === last ? dates[i] : dates[i].replace(/ \S+$/, "")}
          </text>
        </g>
      ))}
      <line x1={L} x2={w - R} y1={h - B} y2={h - B} stroke="var(--ink-4)" />
      <polyline
        points={vals
          .map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`)
          .join(" ")}
        fill="none"
        stroke="var(--blue)"
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {vals.map((v, i) => (
        <circle
          key={`c${i}`}
          cx={X(i)}
          cy={Y(v)}
          r={i === last ? 4 : 2}
          fill={i === last ? "var(--blue)" : "var(--surface)"}
          stroke="var(--blue)"
          strokeWidth={1.5}
        />
      ))}
      <text
        className="ax s"
        x={X(last)}
        y={Y(vals[last]) - 10}
        textAnchor="middle"
      >
        {vals[last]}
      </text>
    </svg>
  );
}

/** Tick ring accent (`tickRing()`), used by the agentic card. */
export function TickRing({ value, label }: { value: number; label: string }) {
  const cx = 60;
  const cy = 60;
  const on = Math.round(value * 0.6);
  return (
    <svg
      className="tring dial"
      viewBox="0 0 120 120"
      role="img"
      aria-label={`${label} ${value} de 100`}
    >
      {Array.from({ length: 60 }, (_, i) => {
        const a = ((-90 + i * 6) * Math.PI) / 180;
        return (
          <line
            key={i}
            className={`t ${i < on ? "on" : ""}`}
            style={{ "--d": `${i * 12}ms` } as CSSProperties}
            x1={(cx + 44 * Math.cos(a)).toFixed(1)}
            y1={(cy + 44 * Math.sin(a)).toFixed(1)}
            x2={(cx + 54 * Math.cos(a)).toFixed(1)}
            y2={(cy + 54 * Math.sin(a)).toFixed(1)}
          />
        );
      })}
      <text
        x="60"
        y="64"
        textAnchor="middle"
        style={{
          font: "300 30px var(--font)",
          fill: "var(--ink)",
          letterSpacing: "-.04em",
        }}
      >
        {value}
      </text>
      <text
        x="60"
        y="80"
        textAnchor="middle"
        style={{ font: "500 10px var(--font)", fill: "var(--ink-3)" }}
      >
        /100
      </text>
    </svg>
  );
}
