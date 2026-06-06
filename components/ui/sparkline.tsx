"use client";

import { useId } from "react";

type SparklineProps = {
  data: number[];
  w?: number;
  h?: number;
  color?: string;
  fill?: boolean;
};

export function Sparkline({ data, w = 92, h = 30, color = "var(--accent)", fill = true }: SparklineProps) {
  const uid = useId().replace(/:/g, "g");

  if (!data.length || data.length < 2) {
    return <svg width={w} height={h} />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const rng = max - min || 1;

  const pts: [number, number][] = data.map((v, i) => [
    (i / (data.length - 1)) * w,
    h - ((v - min) / rng) * (h - 4) - 2,
  ]);

  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${w} ${h} L0 ${h} Z`;
  const last = pts[pts.length - 1];
  const gid = `sg${uid}`;

  return (
    <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.16" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#${gid})`} />}
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.4" fill={color} />
    </svg>
  );
}
