"use client";

import { useEffect, useRef } from "react";
import { engineSpriteKey } from "./engine";

/**
 * Pendulum wave (`pendulumSvg()` + `penFrame()` in the prototype): one pendulum
 * per engine, ambient only. It never encodes progress. Runs only while on
 * screen and not hidden; `prefers-reduced-motion` paints one fixed frame.
 */
export function PendulumWave({ providers }: { providers: readonly string[] }) {
  const ref = useRef<SVGSVGElement>(null);
  const keys = providers.map((p) => engineSpriteKey(p)).filter((k): k is string => k !== null);
  const width = Math.max(1, keys.length) * 100;

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const groups = Array.from(svg.querySelectorAll<SVGGElement>("g[data-x]"));
    const frame = (t: number) => {
      groups.forEach((g, i) => {
        const x = Number(g.dataset.x);
        const period = 24 / (15 + i);
        const th = 0.42 * Math.cos((2 * Math.PI * t) / period);
        const bx = x + 88 * Math.sin(th);
        const by = 8 + 88 * Math.cos(th);
        const [line, bob, use] = Array.from(g.children);
        line.setAttribute("x2", bx.toFixed(2));
        line.setAttribute("y2", by.toFixed(2));
        bob.setAttribute("cx", bx.toFixed(2));
        bob.setAttribute("cy", by.toFixed(2));
        use.setAttribute("x", (bx - 7).toFixed(2));
        use.setAttribute("y", (by - 7).toFixed(2));
      });
    };

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let visible = true;
    let acc = 0;
    let t0 = 0;
    const loop = (ts: number) => {
      if (!t0) t0 = ts - acc;
      acc = ts - t0;
      frame(acc / 1000);
      raf = requestAnimationFrame(loop);
    };
    const sync = () => {
      const run = visible && !document.hidden && !reduce.matches;
      if (run && !raf) raf = requestAnimationFrame(loop);
      else if (!run && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
        t0 = 0;
      }
      if (reduce.matches) frame(3.1);
    };
    const io = new IntersectionObserver((es) => {
      visible = es[0].isIntersecting;
      sync();
    });
    io.observe(svg);
    document.addEventListener("visibilitychange", sync);
    reduce.addEventListener("change", sync);
    sync();
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      reduce.removeEventListener("change", sync);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [keys.length]);

  return (
    <svg ref={ref} viewBox={`0 0 ${width} 118`} aria-hidden="true">
      <line className="rail" x1="10" x2={width - 10} y1="8" y2="8" />
      {keys.map((k, i) => {
        const x = 50 + i * 100;
        return (
          <g key={k}>
            <path className="arc" d={`M${x - 38} 88 A88 88 0 0 0 ${x + 38} 88`} />
            <g data-x={x}>
              <line className="str" x1={x} y1="8" x2={x} y2="96" />
              <circle className="bob" cx={x} cy="96" r="13" />
              <use href={`#e-${k}`} x={x - 7} y="89" width="14" height="14" style={{ color: "var(--ink)" }} />
            </g>
            <circle cx={x} cy="8" r="2" fill="var(--ink-3)" />
          </g>
        );
      })}
    </svg>
  );
}
