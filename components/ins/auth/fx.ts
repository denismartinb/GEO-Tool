/**
 * Bruma, the ambient background of the entry screens (log §351). The effect
 * never claims a measurement: it reacts only to the form (typing makes the
 * lines flow a touch faster, opening the account tints them blue), stands still
 * under `prefers-reduced-motion`, and its loop stops when the canvas leaves the
 * page. Port of `auMist` in `docs/design-reference/console-instrumento-1`.
 */
export const AU_N = 72;

/** `en`: energy (decays), `st`: 0 email, 1 email accepted, 2 account opened. */
export const AUFX = { en: 0, st: 0 };

export function setAuthState(lit: number, done = false) {
  const st = done ? 2 : lit > 0 ? 1 : 0;
  if (st > AUFX.st) AUFX.en = 1;
  AUFX.st = st;
  const sc = document.querySelector<HTMLElement>(".sc-auth");
  if (sc) sc.dataset.st = String(st);
}

export function bumpAuthEnergy() {
  AUFX.en = Math.min(1, AUFX.en + 0.25);
}

export function hex(c: string): [number, number, number] {
  const m = c.match(/^#([0-9a-f]{6})$/i);
  if (!m) return [120, 130, 150];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const rgba = (c: number[], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;

/** Starts the loop on `cv`; returns a stop function. */
export function startMist(cv: HTMLCanvasElement): () => void {
  const ctx = cv.getContext("2d");
  if (!ctx) return () => {};
  const rm = window.matchMedia("(prefers-reduced-motion: reduce)");
  let w = 0;
  let h = 0;
  let t0 = performance.now();
  let k = 0;
  let ph = 0;
  let last = 0;
  let tint = 0;
  let stopped = false;
  let raf = 0;
  let col = { ink: [11, 18, 32] as number[], blue: [37, 99, 235] as number[] };

  const css = (n: string, d: string) => getComputedStyle(cv).getPropertyValue(n).trim() || d;
  const size = () => {
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    w = r.width;
    h = r.height;
    cv.width = w * dpr;
    cv.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const pal = () => {
    col = { ink: hex(css("--ink", "#0b1220")), blue: hex(css("--blue", "#2563eb")) };
  };
  size();
  pal();

  const draw = (t: number) => {
    const dt = last ? Math.min(50, t - last) : 16;
    last = t;
    ph += dt * 0.00034 * (1 + AUFX.en * 2.5);
    tint += ((AUFX.st === 2 ? 1 : 0) - tint) * 0.04;
    const n = 13;
    const amp = Math.min(h, w * 1.2);
    const step = 8;
    for (let i = 0; i < n; i++) {
      const kk = i / n;
      ctx.beginPath();
      for (let x = 0; x <= w + step; x += step) {
        const u = x / w;
        const y =
          h * 0.5 +
          Math.sin(u * 3.1 + ph + kk * 2.4) * amp * 0.15 * (1 - kk * 0.4) +
          Math.cos(u * 6.6 - ph * 0.7 + kk * 5) * amp * 0.035 +
          (kk - 0.5) * h * 0.78;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      const a = (0.05 + kk * 0.15) * (1 + AUFX.en * 0.6);
      const mix = Math.max(tint, 0.18);
      const base = col.ink.map((v, j) => Math.round(v + (col.blue[j] - v) * mix));
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, rgba(base, a * 0.35));
      g.addColorStop(0.5, rgba(base, a));
      g.addColorStop(1, rgba(base, a * 0.45));
      ctx.strokeStyle = g;
      ctx.lineWidth = 0.6 + kk * 1.05;
      ctx.stroke();
    }
  };

  const frame = (now: number) => {
    if (stopped || !cv.isConnected) return;
    const r = cv.getBoundingClientRect();
    if (Math.abs(r.width - w) > 1 || Math.abs(r.height - h) > 1) size();
    if (++k % 40 === 0) pal();
    ctx.clearRect(0, 0, w, h);
    draw(now - t0);
    AUFX.en *= 0.965;
    if (!rm.matches) raf = requestAnimationFrame(frame);
  };
  t0 = performance.now();
  raf = requestAnimationFrame(frame);
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}
