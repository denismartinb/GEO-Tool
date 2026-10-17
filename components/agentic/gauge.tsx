"use client";

import { useEffect, useRef } from "react";
import { animate } from "motion";
import { agenticBand } from "@/lib/agentic-audit/api-contract";

/** Circumference of the r=53 ring in a 120 viewBox. */
const RING = 333;

/**
 * PageSpeed-style ring (AGENTIC-COMMERCE-1). The colour band comes from
 * `agenticBand`, the same thresholds the score uses (0–49 / 50–89 / 90–100).
 * `label` replaces the number in the middle (Interoperabilidad shows «2/4»).
 * Fills once when `play` turns true; with reduced motion it is painted full.
 */
export function Gauge({
  value,
  label,
  big = false,
  play = true
}: {
  value: number;
  label?: string;
  big?: boolean;
  play?: boolean;
}) {
  const fg = useRef<SVGCircleElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);

  useEffect(() => {
    const set = (x: number) => {
      if (fg.current) fg.current.style.strokeDashoffset = String(RING * (1 - x / 100));
      if (text.current) text.current.textContent = label ?? String(Math.round(x));
    };
    if (!play) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduce) {
      set(value);
      shown.current = value;
      return;
    }
    const controls = animate(shown.current, value, {
      duration: 1.1,
      ease: [0.2, 0.8, 0.2, 1],
      onUpdate: (x) => {
        shown.current = x;
        set(x);
      }
    });
    return () => controls.stop();
  }, [value, label, play]);

  const band = agenticBand(value);
  return (
    <span className={`ca-gw ca-${band}${big ? " ca-big" : ""}`}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="ca-bg" cx="60" cy="60" r="53" />
        <circle
          ref={fg}
          className="ca-fg"
          cx="60"
          cy="60"
          r="53"
          style={play ? undefined : { strokeDashoffset: RING * (1 - value / 100) }}
        />
      </svg>
      <span ref={text} className="ca-v">
        {label ?? (play ? "0" : String(value))}
      </span>
    </span>
  );
}
