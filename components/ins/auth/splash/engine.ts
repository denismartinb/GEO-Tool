import { hex } from "../fx";
import { G_C, G_DOT_ANGLE, G_DOT_R, G_RI, G_RM, G_RO, gMarkInner, gPoint } from "./g-mark";
import { LANDING_AT, TAIL_MS, ease, lerp, seg, type SplashVariant } from "./timeline";

/**
 * The three app splashes (log §382), drawn over the real login: one clock `t`
 * in ms, SVG for the mark and its decor, a canvas for the mist. Everything
 * here is ambience; no number on screen stands for a measurement. The G flies
 * to the lockup of the login (`.au-lock svg`), measured live, and the form
 * enters staggered once `onRelease` fires.
 */
interface Opts {
  root: HTMLElement;
  variant: SplashVariant;
  lockG: SVGElement;
  lockW: HTMLElement;
  onRelease: () => void;
  onDone: () => void;
}

const f2 = (n: number) => n.toFixed(2);
const DP = gPoint(G_DOT_ANGLE);
const SVGNS = "http://www.w3.org/2000/svg";

interface St {
  t: number;
  playing: boolean;
  mistA: number;
  gather: number;
  ringA: number;
  en: number;
  ph: number;
  lit: number;
  gx: SVGElement;
  gn: SVGElement;
  gb: SVGElement;
  gd: SVGElement;
  gsvg: SVGElement;
  ping: SVGElement | null;
  halo: SVGElement | null;
  paper: HTMLElement;
  decor: SVGElement;
  q: <T extends Element>(sel: string) => T;
  qa: (sel: string) => Element[];
  ex: Record<string, Element | Element[]>;
}

function setDraw(el: SVGElement, p: number) {
  el.style.strokeDashoffset = String(100 * (1 - p));
  el.style.opacity = p > 0 ? "1" : "0";
}
function drawG(st: St, x: number, n: number, b: number, d: number) {
  setDraw(st.gx, x);
  setDraw(st.gn, n);
  setDraw(st.gb, b);
  st.gd.setAttribute("r", Math.max(0, G_DOT_R * d).toFixed(2));
}
function pingSvg() {
  return (
    `<circle class="halo" cx="0" cy="0" r="0" fill="var(--amber,#ffb020)" opacity="0"/>` +
    `<circle class="ping" cx="${f2(DP[0])}" cy="${f2(DP[1])}" r="30" fill="none" stroke="var(--amber,#ffb020)" stroke-width="2" vector-effect="non-scaling-stroke" opacity="0"/>`
  );
}
function ping(st: St, k: number) {
  if (!st.ping) return;
  if (k <= 0 || k >= 1) {
    st.ping.setAttribute("opacity", "0");
    return;
  }
  st.ping.setAttribute("r", f2(30 + 70 * ease.o(k)));
  st.ping.setAttribute("opacity", f2(0.7 * (1 - k)));
}

interface Variant {
  decor: () => string;
  init: (st: St) => void;
  render: (st: St, t: number) => void;
}

const OFF = "var(--ink-4,#9aa4b3)";
const BLUE = "var(--blue,#2563eb)";

const calibre: Variant = {
  decor() {
    let h = '<g class="ticks">';
    for (let i = 0; i <= 100; i++) {
      const a = 46 + i * 2.7;
      const maj = i % 10 === 0;
      const p = gPoint(a, maj ? 186 : 192);
      const q = gPoint(a, 212);
      h += `<line x1="${f2(p[0])}" y1="${f2(p[1])}" x2="${f2(q[0])}" y2="${f2(q[1])}" stroke="${OFF}" stroke-width="${maj ? 5 : 4}" stroke-linecap="round"/>`;
    }
    return `${h}</g>${pingSvg()}<circle class="bead" r="9" fill="var(--amber,#ffb020)"/>`;
  },
  init(st) {
    st.ex.ticks = st.qa(".ticks line");
    st.ex.tg = st.q(".ticks");
    st.ex.bead = st.q(".bead");
    st.lit = -1;
  },
  render(st, t) {
    const ticks = st.ex.ticks as SVGElement[];
    const tg = st.ex.tg as SVGElement;
    const bead = st.ex.bead as SVGElement;
    const p = ease.io(seg(t, 80, 1000));
    const n = Math.round(p * 100) + (p > 0 ? 0 : -1);
    if (n !== st.lit) {
      for (let i = 0; i < ticks.length; i++) ticks[i].setAttribute("stroke", i <= n ? BLUE : OFF);
      st.lit = n;
    }
    const q = ease.io(seg(t, 1000, 1550));
    tg.setAttribute("transform", `translate(146 146) scale(${f2(1 - 0.3 * q)}) translate(-146 -146)`);
    tg.style.opacity = String(1 - q);
    const m = seg(t, 1350, 1700);
    const r = lerp(201, G_RM, ease.io(m));
    const rad = lerp(9, 30, ease.back(m));
    const pos = gPoint(46 + 270 * p, r);
    bead.setAttribute("cx", f2(pos[0]));
    bead.setAttribute("cy", f2(pos[1]));
    bead.setAttribute("r", f2(rad));
    bead.style.opacity = String(t < 1700 ? seg(t, 0, 160) : 0);
    if (st.halo) {
      st.halo.setAttribute("cx", f2(pos[0]));
      st.halo.setAttribute("cy", f2(pos[1]));
      st.halo.setAttribute("r", f2(rad * 1.7));
      st.halo.setAttribute("opacity", String(t < 1700 ? f2(0.12 * seg(t, 0, 160)) : 0));
    }
    drawG(st, ease.o(seg(t, 980, 1180)), ease.io(seg(t, 1080, 1430)), ease.io(seg(t, 1330, 1650)), t >= 1700 ? 1 : 0);
    ping(st, seg(t, 1700, 2300));
    st.mistA = seg(t, LANDING_AT.calibre - 100, LANDING_AT.calibre + 700);
  }
};

const compas: Variant = {
  decor() {
    const ring = (r: number) => `M${G_C + r} 146A${r} ${r} 0 1 1 ${G_C - r} 146A${r} ${r} 0 1 1 ${G_C + r} 146`;
    const dp = gPoint(G_DOT_ANGLE, 196);
    const tp = gPoint(G_DOT_ANGLE, 214);
    const axes = ["M146 146H392", "M146 146H-100", "M146 146V-100", "M146 146V392"]
      .map((d) => `<path class="guide ax" d="${d}" pathLength="100" stroke-dasharray="100 101"/>`)
      .join("");
    return (
      `<g class="gd">` +
      `<path class="guide c1" d="${ring(G_RO)}" pathLength="100" stroke-dasharray="100 101"/>` +
      `<path class="guide c2" d="${ring(G_RI)}" pathLength="100" stroke-dasharray="100 101"/>` +
      `<path class="guide c3" d="${ring(G_RM)}" pathLength="100" stroke-dasharray="1.2 1.4" opacity="0"/>` +
      axes +
      `<path class="guide rad" d="M146 146L${f2(dp[0])} ${f2(dp[1])}" stroke-dasharray="4 5" opacity="0"/>` +
      `<path class="guide bars" d="M150 119H300M150 173H300" stroke-dasharray="4 5" opacity="0"/>` +
      `<g class="lbl" opacity="0"><text class="gtxt" x="152" y="-2">R 140</text><text class="gtxt" x="152" y="52">R 86</text><text class="gtxt" x="${f2(tp[0] + 4)}" y="${f2(tp[1] - 4)}">316°</text></g>` +
      `<g class="xh" opacity="0"><path class="guide" d="M${f2(DP[0] - 16)} ${f2(DP[1])}h32M${f2(DP[0])} ${f2(DP[1] - 16)}v32" style="opacity:1"/></g></g>`
    );
  },
  init(st) {
    st.ex.gd = st.q(".gd");
    st.ex.c1 = st.q(".c1");
    st.ex.c2 = st.q(".c2");
    st.ex.c3 = st.q(".c3");
    st.ex.ax = st.qa(".ax");
    st.ex.rad = st.q(".rad");
    st.ex.bars = st.q(".bars");
    st.ex.lbl = st.q(".lbl");
    st.ex.xh = st.q(".xh");
  },
  render(st, t) {
    const e = st.ex as Record<string, SVGElement & SVGElement[]>;
    e.c1.style.strokeDashoffset = String(100 * (1 - ease.io(seg(t, 0, 650))));
    e.c2.style.strokeDashoffset = String(100 * (1 - ease.io(seg(t, 120, 760))));
    e.c3.setAttribute("opacity", f2(0.6 * seg(t, 500, 800)));
    const a = ease.io(seg(t, 40, 560));
    e.ax.forEach((el: SVGElement) => {
      el.style.strokeDashoffset = String(100 * (1 - a));
    });
    e.rad.setAttribute("opacity", f2(0.8 * seg(t, 380, 700)));
    e.bars.setAttribute("opacity", f2(0.8 * seg(t, 480, 760)));
    e.lbl.setAttribute("opacity", f2(seg(t, 360, 700)));
    e.xh.setAttribute("opacity", f2(seg(t, 820, 1000) * (1 - seg(t, 1380, 1600))));
    const F = 1 - ease.io(seg(t, 1520, 1900));
    e.gd.style.opacity = String(F);
    st.paper.style.opacity = String(0.75 * seg(t, 0, 500) * F);
    drawG(st, ease.o(seg(t, 600, 820)), ease.io(seg(t, 760, 1170)), ease.io(seg(t, 1100, 1470)), ease.back(seg(t, 1380, 1660)));
    st.mistA = seg(t, LANDING_AT.compas - 100, LANDING_AT.compas + 700);
  }
};

const bruma: Variant = {
  decor: pingSvg,
  init() {},
  render(st, t) {
    st.mistA = seg(t, 0, 350);
    st.gather = t < 1900 ? ease.io(seg(t, 200, 1350)) : 1 - ease.io(seg(t, 1900, 2750));
    st.ringA = 1 - seg(t, 1300, 1750);
    if (t > 200 && t < 1350) st.en = Math.max(st.en, 0.8);
    const g = ease.o(seg(t, 1250, 1700));
    drawG(st, 1, 1, 1, ease.back(seg(t, 1650, 1920)));
    st.gsvg.style.opacity = String(g);
    st.gsvg.style.transform = `scale(${f2(1.06 - 0.06 * g)})`;
    ping(st, seg(t, 1900, 2450));
  }
};

const VARIANTS: Record<SplashVariant, Variant> = { calibre, compas, bruma };

const SPLASH_CSS = `
.sp-root{position:fixed;inset:0;z-index:60;cursor:pointer;overflow:hidden;transition:opacity .35s ease}
.sp-root.sp-out{opacity:0;pointer-events:none}
.sp-mist{position:absolute;inset:0;width:100%;height:100%}
.sp-paper{position:absolute;inset:0;opacity:0;background-image:radial-gradient(circle,color-mix(in oklab,var(--blue) 30%,transparent) 1px,transparent 1.4px);background-size:22px 22px;background-position:center;-webkit-mask-image:radial-gradient(closest-side,#000 30%,transparent);mask-image:radial-gradient(closest-side,#000 30%,transparent)}
.sp-decor{position:absolute;overflow:visible;pointer-events:none}
.sp-hero{position:absolute;transform-origin:0 0;will-change:transform}
.sp-hero svg{display:block;width:100%;height:100%;overflow:visible}
.sp-decor .guide{fill:none;stroke:var(--blue);stroke-width:1;vector-effect:non-scaling-stroke;opacity:.55}
.sp-decor .gtxt{font:500 20px ui-monospace,monospace;fill:var(--blue)}
`;

/** Runs the splash on `opts.root`; returns a cleanup that also ends it at once. */
export function runSplash(opts: Opts): () => void {
  const { root, variant, lockG, lockW } = opts;
  const v = VARIANTS[variant];
  const L0 = LANDING_AT[variant];
  const T = L0 + TAIL_MS;
  const W = root.clientWidth || window.innerWidth;
  const H = root.clientHeight || window.innerHeight;
  const phone = W <= 760;
  const S = phone ? 140 : 168;
  const hx = (W - S) / 2;
  const hy = phone ? Math.round(H * 0.45 - S / 2) : (H - S) / 2;

  root.innerHTML =
    `<style>${SPLASH_CSS}</style><canvas class="sp-mist" aria-hidden="true"></canvas><div class="sp-paper"></div>` +
    `<svg class="sp-decor" viewBox="-146 -146 584 584" style="left:${hx - S / 2}px;top:${hy - S / 2}px;width:${S * 2}px;height:${S * 2}px" aria-hidden="true">${v.decor()}</svg>` +
    `<div class="sp-hero" style="left:${hx}px;top:${hy}px;width:${S}px;height:${S}px"><svg viewBox="0 0 292 292" aria-hidden="true" xmlns="${SVGNS}">${gMarkInner("spg")}</svg></div>`;

  const q = <E extends Element>(sel: string) => root.querySelector(sel) as unknown as E;
  const hero = q<HTMLElement>(".sp-hero");
  const cv = q<HTMLCanvasElement>(".sp-mist");
  const ctx = cv.getContext("2d");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);

  const cs = getComputedStyle(root);
  const ink = hex(cs.getPropertyValue("--ink").trim());
  const bl = hex(cs.getPropertyValue("--blue").trim());

  const st: St = {
    t: 0,
    playing: true,
    mistA: 0,
    gather: 0,
    ringA: 1,
    en: 0,
    ph: 0,
    lit: -1,
    gx: q(".g-x"),
    gn: q(".g-n"),
    gb: q(".g-b"),
    gd: q(".g-d"),
    gsvg: q(".sp-hero svg"),
    ping: root.querySelector(".ping"),
    halo: root.querySelector(".halo"),
    paper: q(".sp-paper"),
    decor: q(".sp-decor"),
    q,
    qa: (sel) => [].slice.call(root.querySelectorAll(sel)),
    ex: {}
  };
  st.gsvg.style.transformOrigin = "50% 50%";
  v.init(st);

  // Where the G lands: the real lockup of the login, centre to centre.
  const lr = lockG.getBoundingClientRect();
  const sc = (lr.height || 27) / S;
  const tx = lr.left + lr.width / 2 - (S * sc) / 2 - hx;
  const ty = lr.top + lr.height / 2 - (S * sc) / 2 - hy;

  let released = false;
  let landed = false;
  let finished = false;
  let raf = 0;
  let last = performance.now();

  const finish = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    root.removeEventListener("click", go);
    document.removeEventListener("keydown", onKey);
    lockG.style.opacity = "";
    lockW.style.opacity = "";
    lockW.style.transform = "";
    opts.onRelease();
    root.classList.add("sp-out");
    opts.onDone();
  };

  const go = (e?: Event) => {
    e?.stopPropagation();
    if (st.t < L0) st.t = L0;
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") go();
  };
  root.addEventListener("click", go);
  document.addEventListener("keydown", onKey);

  const mist = (dt: number) => {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    const A = st.mistA;
    const K = st.gather;
    if (A <= 0) return;
    st.ph += dt * 0.00034 * (1 + st.en * 2.5);
    st.en *= 0.965;
    const n = 13;
    const amp = Math.min(H, W * 1.2);
    const step = K > 0.02 ? 6 : 8;
    const cx = hx + S / 2;
    const cy = hy + S / 2;
    const u0 = S / 292;
    for (let i = 0; i < n; i++) {
      const kk = i / n;
      const r = (G_RI + (G_RO - G_RI) * ((i + 0.5) / n)) * u0;
      const off = i * 0.55 + st.ph * 0.9;
      ctx.beginPath();
      for (let x = 0; x <= W + step; x += step) {
        const u = x / W;
        const y =
          H * 0.5 +
          Math.sin(u * 3.1 + st.ph + kk * 2.4) * amp * 0.15 * (1 - kk * 0.4) +
          Math.cos(u * 6.6 - st.ph * 0.7 + kk * 5) * amp * 0.035 +
          (kk - 0.5) * H * 0.78;
        let px = x;
        let py = y;
        if (K > 0) {
          const th = off + u * Math.PI * 2;
          px = lerp(x, cx + r * Math.cos(th), K);
          py = lerp(y, cy + r * Math.sin(th), K);
        }
        if (x === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      const base = (0.05 + kk * 0.15) * (1 + st.en * 0.6);
      const a = lerp(base, 0.55 * st.ringA, K) * A;
      const mix = Math.max(0.18, K);
      const col = ink.map((c, j) => Math.round(c + (bl[j] - c) * mix));
      if (K > 0.05) {
        ctx.strokeStyle = `rgba(${col},${a.toFixed(3)})`;
      } else {
        const gr = ctx.createLinearGradient(0, 0, W, 0);
        gr.addColorStop(0, `rgba(${col},${(a * 0.35).toFixed(3)})`);
        gr.addColorStop(0.5, `rgba(${col},${a.toFixed(3)})`);
        gr.addColorStop(1, `rgba(${col},${(a * 0.45).toFixed(3)})`);
        ctx.strokeStyle = gr;
      }
      ctx.lineWidth = lerp(0.6 + kk * 1.05, 1.1, K);
      ctx.stroke();
    }
  };

  const render = () => {
    const t = st.t;
    v.render(st, t);
    const f = ease.io(seg(t, L0, L0 + 760));
    hero.style.transform = `translate(${f2(tx * f)}px,${f2(ty * f)}px) scale(${(1 + (sc - 1) * f).toFixed(4)})`;
    const w = ease.o(seg(t, L0 + 600, L0 + 950));
    lockW.style.opacity = String(w);
    lockW.style.transform = `translateX(${f2(-8 * (1 - w))}px)`;
    if (!released && t >= L0 + 430) {
      released = true;
      opts.onRelease();
    }
    if (!landed && t >= L0 + 760) {
      landed = true;
      lockG.style.opacity = "1";
      hero.style.opacity = "0";
    }
  };

  lockG.style.opacity = "0";
  lockW.style.opacity = "0";
  render();
  const loop = (now: number) => {
    const dt = Math.min(50, now - last);
    last = now;
    if (st.playing) st.t += dt;
    if (st.t >= T) {
      st.t = T;
      render();
      mist(dt);
      finish();
      return;
    }
    render();
    mist(dt);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  return () => {
    if (!finished) {
      finished = true;
      cancelAnimationFrame(raf);
      root.removeEventListener("click", go);
      document.removeEventListener("keydown", onKey);
      lockG.style.opacity = "";
      lockW.style.opacity = "";
      lockW.style.transform = "";
      opts.onRelease();
    }
  };
}
