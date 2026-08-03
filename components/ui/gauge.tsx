"use client";

import { useId } from "react";

type GaugeProps = {
  value: number;
  max?: number;
  size?: number;
  stroke?: number;
  label?: string;
  /**
   * "ring" (default) is the 270° dial Overview/Prompts/the landing hero have
   * always used — unchanged, so adding this prop repaints nothing.
   *
   * "semi" is the half-circle from the approved Auditoría web mockup
   * (`docs/design-reference/web-audit-issues-1/opcion-b-rev4-aprobada.html`,
   * "Salud del sitio"). Founder review 2026-08-03, second time on this same
   * point: swapping web-audit's bespoke SVG for this shared component fixed
   * the consistency complaint but not the shape — "el gauge sigue sin ser el
   * diseño atractivo que metimos como referencia". Kept as a variant of the
   * ONE gauge component rather than a second bespoke SVG, so the two shapes
   * can never drift in gradient, numeral face or band colours.
   */
  variant?: "ring" | "semi";
};

export function Gauge({
  value,
  max = 100,
  size = 132,
  stroke = 13,
  label = "/ 100",
  variant = "ring"
}: GaugeProps) {
  const uid = useId().replace(/:/g, "g");
  const semi = variant === "semi";
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  // Degrees run clockwise from the top. "semi" sweeps left→top→right, leaving
  // the flat side down; "ring" keeps its original gap at the bottom.
  const start = semi ? 270 : 135;
  const sweep = semi ? 180 : 270;
  // The half-circle only ever paints the top half, so the box is cropped to
  // it — otherwise every consumer would inherit ~half a gauge of dead space.
  const boxHeight = semi ? size / 2 + stroke / 2 : size;
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
    <div className={`gauge-wrap${semi ? " gauge-semi" : ""}`} style={{ width: size, height: boxHeight }}>
      <svg width={size} height={boxHeight}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--brand-blue-2)" />
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
