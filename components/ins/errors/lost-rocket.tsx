"use client";

import { useEffect, useRef } from "react";

/**
 * The console 404 scene, «Fuera de trayectoria» (CONSOLE-404-ROCKET-1, log
 * §388, approved design in `docs/design-reference/console-404-rocket-1/`).
 *
 * The rocket is the public 404's rocket (`components/not-found-mission.tsx`):
 * same hull, fins, nozzles and window, same palette, flying up and to the
 * right. Read `.claude/rules/mission-rocket.md` before touching either.
 *
 * Nothing here means anything. The rocket takes off along the route that led
 * to the destination, veers off, and its dotted heading misses the target
 * marked 404. There is no bar, ring fill or counter that could read as
 * progress. With `prefers-reduced-motion` the scene stays on its last frame,
 * which tells the same story.
 *
 * One clock drives everything: `render(t, now)` is a pure function of the
 * entrance time `t` and the ambient clock `now`, drawn imperatively in a
 * single `requestAnimationFrame` loop that stops while the scene is off
 * screen or the tab is hidden.
 */

type Geo = {
  W: number;
  H: number;
  planet: [number, number, number];
  p1: string;
  p2: string;
  lost: string;
  target: [number, number];
  tr: number;
  sc: number;
  stars: number;
  trail: number;
  dash: string;
  dot: number;
};

const GEO: Record<"wide" | "stack", Geo> = {
  wide: {
    W: 976,
    H: 680,
    planet: [560, 2010, 1400],
    p1: "M520 720 C590 610 640 540 690 470",
    p2: "M690 470 C712 440 728 400 745 338",
    lost: "M790 238 C806 200 822 166 842 120",
    target: [905, 160],
    tr: 24,
    sc: 1.45,
    stars: 70,
    trail: 3.6,
    dash: "30 22",
    dot: 14
  },
  stack: {
    W: 358,
    H: 340,
    planet: [180, 1540, 1250],
    p1: "M96 380 C124 330 148 296 175 255",
    p2: "M175 255 C190 233 200 210 210 172",
    lost: "M229 128 C236 106 244 86 256 58",
    target: [300, 64],
    tr: 16,
    sc: 0.74,
    stars: 34,
    trail: 2.6,
    dash: "18 14",
    dot: 10
  }
};

/** Below this width the copy leaves the scene and sits under it. */
const STACK_QUERY = "(max-width: 1099px)";
const ENTRANCE_MS = 3200;

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function starField(g: Geo, seed: number) {
  const r = rng(seed);
  const far: Array<[number, number, number]> = [];
  const near: Array<[number, number, number]> = [];
  for (let i = 0; i < g.stars; i++) far.push([r() * g.W, r() * g.H * 0.86, 0.6 + r() * 0.7]);
  for (let i = 0; i < g.stars / 3; i++) near.push([r() * g.W, r() * g.H * 0.86, 1.1 + r() * 0.6]);
  return { far, near };
}

/* easing: the same curves the prototype used */
const seg = (t: number, a: number, b: number) => (t <= a ? 0 : t >= b ? 1 : (t - a) / (b - a));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const A = (a1: number, a2: number) => 1 - 3 * a2 + 3 * a1;
  const B = (a1: number, a2: number) => 3 * a2 - 6 * a1;
  const C = (a1: number) => 3 * a1;
  const calc = (t: number, a1: number, a2: number) => ((A(a1, a2) * t + B(a1, a2)) * t + C(a1)) * t;
  const slope = (t: number, a1: number, a2: number) => 3 * A(a1, a2) * t * t + 2 * B(a1, a2) * t + C(a1);
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const s = slope(t, x1, x2);
      if (!s) break;
      t -= (calc(t, x1, x2) - x) / s;
    }
    return calc(t, y1, y2);
  };
}
const flight = bezier(0.55, 0, 0.12, 1);
const f2 = (n: number) => n.toFixed(2);

function Scene({ kind }: { kind: "wide" | "stack" }) {
  const g = GEO[kind];
  const id = `nf4${kind}`;
  const { far, near } = starField(g, kind === "wide" ? 7 : 11);
  const [px, py, pr] = g.planet;
  const xs = g.tr * 0.38;
  const ticks = Array.from({ length: 36 }, (_, i) => {
    const a = (i * 10 * Math.PI) / 180;
    const r0 = g.tr * 1.32;
    const r1 = g.tr * (i % 3 === 0 ? 1.62 : 1.5);
    return [r0 * Math.cos(a), r0 * Math.sin(a), r1 * Math.cos(a), r1 * Math.sin(a)];
  });
  const stars = (list: Array<[number, number, number]>) =>
    list.flatMap(([x, y, r], i) => [
      <circle key={`a${i}`} cx={f2(x)} cy={f2(y)} r={f2(r)} />,
      <circle key={`b${i}`} cx={f2(x + g.W)} cy={f2(y)} r={f2(r)} />
    ]);

  return (
    <svg
      className={`er-rk-svg ${kind}`}
      data-kind={kind}
      viewBox={`0 0 ${g.W} ${g.H}`}
      preserveAspectRatio={kind === "wide" ? "xMaxYMid slice" : "xMidYMid meet"}
      role="img"
      aria-label="Un cohete se ha salido de su trayectoria hacia un destino que no existe"
    >
      <defs>
        <linearGradient id={`${id}e`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b4a7a" />
          <stop offset="1" stopColor="#0a1728" />
        </linearGradient>
        <radialGradient id={`${id}g`} cx="72%" cy="38%" r="60%">
          <stop offset="0" stopColor="#2563eb" stopOpacity=".28" />
          <stop offset="1" stopColor="#2563eb" stopOpacity="0" />
        </radialGradient>
        <mask id={`${id}m1`} maskUnits="userSpaceOnUse">
          <path data-r="m1" d={g.p1} stroke="#fff" strokeWidth="14" fill="none" />
        </mask>
        <mask id={`${id}m2`} maskUnits="userSpaceOnUse">
          <path data-r="m2" d={g.p2} stroke="#fff" strokeWidth="14" fill="none" />
        </mask>
        <mask id={`${id}m3`} maskUnits="userSpaceOnUse">
          <path data-r="m3" d={g.lost} stroke="#fff" strokeWidth="14" fill="none" strokeLinecap="round" />
        </mask>
      </defs>
      <rect width={g.W} height={g.H} fill="#081223" />
      <rect width={g.W} height={g.H} fill={`url(#${id}g)`} />
      <g data-r="far" fill="#cfe0ff" opacity=".45">
        {stars(far)}
      </g>
      <g data-r="near" fill="#eaf1ff" opacity=".9">
        {stars(near)}
      </g>
      <circle cx={px} cy={py} r={pr + 10} fill="none" stroke="rgba(9,197,214,.16)" strokeWidth="16" />
      <circle cx={px} cy={py} r={pr + 2} fill="none" stroke="rgba(127,227,236,.5)" strokeWidth="2" />
      <circle cx={px} cy={py} r={pr} fill={`url(#${id}e)`} />

      <g className="er-rk-anim">
        {[g.p1, g.p2].map((d, i) => (
          <path
            key={d}
            d={d}
            mask={`url(#${id}m${i + 1})`}
            fill="none"
            stroke="#4f7bff"
            strokeWidth={g.trail}
            strokeLinecap="round"
            strokeDasharray={g.dash}
          />
        ))}
        <path
          d={g.lost}
          mask={`url(#${id}m3)`}
          fill="none"
          stroke="#7f9dc9"
          strokeWidth={g.trail * 0.75}
          strokeLinecap="round"
          strokeDasharray={`1 ${g.dot}`}
        />
        <g transform={`translate(${g.target[0]} ${g.target[1]})`}>
          <g data-r="ticks" strokeWidth="1.6" strokeLinecap="round">
            {ticks.map(([x1, y1, x2, y2], i) => (
              <line key={i} x1={f2(x1)} y1={f2(y1)} x2={f2(x2)} y2={f2(y2)} stroke="#3a4d6e" opacity=".75" />
            ))}
          </g>
          <circle data-r="ring" r={g.tr} fill="none" stroke="#7f9dc9" strokeWidth="1.6" strokeDasharray="3 7" />
          {[`M${-xs} ${-xs}L${xs} ${xs}`, `M${xs} ${-xs}L${-xs} ${xs}`].map((d, i) => (
            <path
              key={d}
              data-r={`x${i}`}
              d={d}
              pathLength={1}
              stroke="#a9bde0"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeDasharray="1 1"
            />
          ))}
          <text data-r="label" className="er-rk-label" y={g.tr * 1.62 + 22} textAnchor="middle">
            404
          </text>
        </g>
        <g data-r="rocket">
          <path data-r="th0" d="M186 218 q-7 9 -11 20 q9 -5 13 -13 Z" fill="#7fe3ec" />
          <path data-r="th1" d="M214 218 q7 9 11 20 q-9 -5 -13 -13 Z" fill="#7fe3ec" />
          <rect x="184" y="208" width="9" height="8" rx="2" fill="#8fa8cc" />
          <rect x="196" y="208" width="9" height="9" rx="2" fill="#8fa8cc" />
          <rect x="208" y="208" width="9" height="8" rx="2" fill="#8fa8cc" />
          <path d="M184 188 L174 210 L184 206 Z" fill="#3f6fd8" />
          <path d="M217 188 L227 210 L217 206 Z" fill="#3f6fd8" />
          <path d="M200 138 q16 16 16 39 v30 h-32 v-30 q0 -23 16 -39 Z" fill="#d7e2f5" />
          <path d="M200 138 q16 16 16 39 h-32 q0 -23 16 -39 Z" fill="#eef4ff" />
          <circle cx="200" cy="176" r="6.5" fill="#0b1426" />
          <circle cx="200" cy="176" r="4" fill="#09c5d6" />
        </g>
      </g>
      <path data-r="p1" d={g.p1} fill="none" stroke="none" />
      <path data-r="p2" d={g.p2} fill="none" stroke="none" />
    </svg>
  );
}

type Rig = {
  g: Geo;
  q: (r: string) => SVGElement;
  p1: SVGPathElement;
  p2: SVGPathElement;
  L1: number;
  L2: number;
  L3: number;
  ticks: SVGLineElement[];
};

function rig(svg: SVGSVGElement, g: Geo): Rig {
  const q = (r: string) => svg.querySelector(`[data-r="${r}"]`) as SVGElement;
  const p1 = q("p1") as SVGPathElement;
  const p2 = q("p2") as SVGPathElement;
  const L1 = p1.getTotalLength();
  const L2 = p2.getTotalLength();
  const L3 = (q("m3") as SVGPathElement).getTotalLength();
  q("m1").setAttribute("stroke-dasharray", `${L1} ${L1 + 1}`);
  q("m2").setAttribute("stroke-dasharray", `${L2} ${L2 + 1}`);
  q("m3").setAttribute("stroke-dasharray", `${L3} ${L3 + 1}`);
  return { g, q, p1, p2, L1, L2, L3, ticks: Array.from(q("ticks").querySelectorAll("line")) };
}

function pointAt(k: Rig, d: number) {
  const first = d <= k.L1;
  const path = first ? k.p1 : k.p2;
  const L = first ? k.L1 : k.L2;
  const x = first ? d : d - k.L1;
  const a = Math.max(0, Math.min(L - 2, x - 1));
  const p = path.getPointAtLength(Math.min(L, x));
  const q0 = path.getPointAtLength(a);
  const q1 = path.getPointAtLength(a + 2);
  return { x: p.x, y: p.y, a: (Math.atan2(q1.y - q0.y, q1.x - q0.x) * 180) / Math.PI + 90 };
}

function render(k: Rig, t: number, now: number) {
  const { g, q } = k;
  const d = flight(seg(t, 250, 2650)) * (k.L1 + k.L2);
  const pos = pointAt(k, d);
  // the veer: a damped roll that settles like a spring
  const wobble = t > 1500 ? 14 * Math.exp(-(t - 1500) / 420) * Math.sin((t - 1500) / 105) : 0;
  const bob = Math.sin(now / 950) * g.sc * 2.8;
  const roll = Math.sin(now / 1400) * 2;
  const on = easeOut(seg(t, 200, 520));
  const rocket = q("rocket");
  rocket.setAttribute(
    "transform",
    `translate(${f2(pos.x)} ${f2(pos.y + bob)}) rotate(${f2(pos.a + wobble + roll)}) scale(${f2(g.sc * (0.6 + 0.4 * on))}) translate(-200 -188)`
  );
  rocket.setAttribute("opacity", f2(on));
  const thrust = t < 2650 ? 1.25 : 1;
  [186, 214].forEach((x, i) => {
    const s = thrust * (0.75 + 0.25 * Math.sin(now / (i ? 70 : 90) + i));
    q(`th${i}`).setAttribute("transform", `translate(${x} 218) scale(1 ${f2(s)}) translate(${-x} -218)`);
  });
  q("m1").setAttribute("stroke-dashoffset", f2(k.L1 - Math.min(d, k.L1)));
  q("m2").setAttribute("stroke-dashoffset", f2(k.L2 - Math.max(0, d - k.L1)));
  q("m3").setAttribute("stroke-dashoffset", f2(k.L3 * (1 - easeInOut(seg(t, 2350, 3100)))));
  q("far").setAttribute("transform", `translate(${f2(-((now * 0.006) % g.W))} 0)`);
  q("near").setAttribute("transform", `translate(${f2(-((now * 0.014) % g.W))} 0)`);
  k.ticks.forEach((line, i) => {
    const s = 1800 + i * 22;
    const lit = seg(t, s, s + 140);
    const dim = seg(t, s + 260, s + 900);
    line.setAttribute("stroke", lit > 0 && dim < 1 ? "#5b93ff" : "#3a4d6e");
    line.setAttribute("opacity", f2(lit > 0 ? lerp(1, 0.75, dim) : 0));
  });
  const ring = q("ring");
  ring.setAttribute("opacity", f2(seg(t, 1700, 2100)));
  ring.setAttribute("transform", `rotate(${f2(now / 60)})`);
  [0, 1].forEach((i) =>
    q(`x${i}`).setAttribute("stroke-dashoffset", f2(1 - easeOut(seg(t, 2350 + i * 140, 2650 + i * 140))))
  );
  q("label").setAttribute("opacity", f2(easeOut(seg(t, 2600, 3000))));
}

export function LostRocket() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const stackMq = window.matchMedia(STACK_QUERY);
    const reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const rigs = new Map<string, Rig>();
    const rigFor = () => {
      const kind = stackMq.matches ? "stack" : "wide";
      let k = rigs.get(kind);
      if (!k) {
        const svg = el.querySelector(`svg[data-kind="${kind}"]`) as SVGSVGElement;
        k = rig(svg, GEO[kind]);
        rigs.set(kind, k);
      }
      return k;
    };

    let t = reduceMq.matches ? ENTRANCE_MS : 0;
    let clock = 0;
    let raf = 0;
    let prev = 0;
    let visible = true;
    const draw = () => render(rigFor(), t, clock);
    draw();
    el.classList.add("is-ready");
    if (reduceMq.matches) {
      const redraw = () => draw();
      stackMq.addEventListener("change", redraw);
      return () => stackMq.removeEventListener("change", redraw);
    }

    const frame = (ts: number) => {
      const dt = prev ? Math.min(50, ts - prev) : 16;
      prev = ts;
      clock += dt;
      if (t < ENTRANCE_MS) t = Math.min(ENTRANCE_MS, t + dt);
      draw();
      raf = requestAnimationFrame(frame);
    };
    const start = () => {
      if (!raf && visible && document.visibilityState === "visible") {
        prev = 0;
        raf = requestAnimationFrame(frame);
      }
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
      else stop();
    });
    io.observe(el);
    const onVis = () => (document.visibilityState === "visible" ? start() : stop());
    document.addEventListener("visibilitychange", onVis);
    start();
    return () => {
      stop();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <div className="er-rk" ref={root}>
      <Scene kind="wide" />
      <Scene kind="stack" />
    </div>
  );
}
