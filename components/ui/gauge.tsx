"use client";

import { useId } from "react";

type GaugeProps = {
  value: number;
  max?: number;
  size?: number;
  stroke?: number;
  label?: string;
};

export function Gauge({ value, max = 100, size = 132, stroke = 13, label = "/ 100" }: GaugeProps) {
  const uid = useId().replace(/:/g, "g");
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const start = 135;
  const sweep = 270;
  const frac = Math.max(0, Math.min(1, value / max));

  function polar(deg: number): [number, number] {
    const a = ((deg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }

  function arc(fromDeg: number, toDeg: number): string {
    const [x1, y1] = polar(fromDeg);
    const [x2, y2] = polar(toDeg);
    const large = toDeg - fromDeg > 180 ? 1 : 0;
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }

  const bandColor = value >= 70 ? "var(--pos)" : value >= 40 ? "var(--accent)" : "var(--warn)";
  const gid = `gg${uid}`;

  return (
    <div className="gauge-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6d63f0" />
            <stop offset="100%" stopColor={bandColor} />
          </linearGradient>
        </defs>
        <path
          d={arc(start, start + sweep)}
          fill="none"
          stroke="var(--surface-sunk)"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        {frac > 0.005 && (
          <path
            d={arc(start, start + sweep * frac)}
            fill="none"
            stroke={`url(#${gid})`}
            strokeWidth={stroke}
            strokeLinecap="round"
          />
        )}
      </svg>
      <div className="gauge-center">
        <div>
          <div className="gauge-num tnum">{value}</div>
          <div className="gauge-cap">{label}</div>
        </div>
      </div>
    </div>
  );
}
