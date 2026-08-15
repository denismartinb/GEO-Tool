"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import {
  AUTOPLAY_THROUGH_STEP_INDEX,
  TOUR_DURATION_MS,
  TOUR_STEPS,
  freezeTimeFor,
  holdTimeFor,
  stepIndexAt
} from "@/lib/onboarding/tour-steps";

/**
 * ONBOARDING-TOUR-1 — el tour «Aprende cómo funciona».
 *
 * Referencia de diseño (aprobada): `docs/design-reference/onboarding-tour-1/`.
 * Su README lista los invariantes que este componente tiene que conservar.
 *
 * Dos variantes de la misma pieza:
 *   "hero"  → integrado en el hero de la landing, dentro de `.browserframe`.
 *   "modal" → popup de bienvenida en la consola (ver `tour-provider.tsx`).
 *
 * Por qué la animación se escribe a mano sobre el DOM y no con estado de React:
 * son ~40 propiedades recalculadas a 60 fps a partir de un único reloj. Pasar
 * eso por `useState` sería un re-render por fotograma. React se queda con lo
 * que cambia ocho veces en cincuenta segundos (el paso activo) y el bucle
 * escribe el resto por refs.
 *
 * Los números son ilustrativos y están declarados como tales en el README. El
 * salto de 48 a 71 del último paso enseña el MECANISMO (cada escaneo recalcula
 * la puntuación), no promete una cifra: el subtítulo está escrito así a
 * propósito y no debe reescribirse como una garantía.
 */

type Variant = "hero" | "modal";

const DOMAIN = "miempresa.io";

/** Seis escaneos hasta 48, y un séptimo a 71 que sólo existe en el paso 8. */
const TREND = [31, 34, 33, 39, 43, 48];
const TREND_AFTER = [...TREND, 71];

type Waypoint = {
  t: number;
  sel?: string;
  /** Alternativa para móvil, donde el mini-menú no existe. */
  mob?: string;
  xy?: [number, number];
  off?: [number, number];
};

/**
 * Recorrido del cursor. Cada waypoint apunta a un ELEMENTO, no a coordenadas:
 * se resuelve su centro real en cada fotograma, así que el recorrido sigue
 * siendo correcto a cualquier ancho y con cualquier tipografía.
 */
const PATH: Waypoint[] = [
  { t: 0, xy: [112, 118] },
  { t: 1000, sel: "[data-pt=field]", off: [-20, 0] },
  { t: 2100, sel: "[data-pt=field]", off: [-20, 0] },
  { t: 2600, xy: [93, 10] },
  { t: 9300, xy: [93, 12] },
  { t: 10000, sel: "[data-pt=score3]", off: [12, 8] },
  { t: 14700, sel: "[data-pt=score3]", off: [12, 8] },
  { t: 16900, sel: "[data-pt=dot4]" },
  { t: 20400, sel: "[data-pt=dot4]" },
  { t: 21200, sel: "[data-nav='5']", mob: "[data-act='5'] .pt-h" },
  { t: 23000, sel: "[data-nav='5']", mob: "[data-act='5'] .pt-h" },
  { t: 24200, sel: "[data-rec='0'] .pt-reccta" },
  { t: 26900, sel: "[data-rec='0'] .pt-reccta" },
  { t: 27600, sel: "[data-pt=genbtn]" },
  { t: 31000, sel: "[data-pt=genbtn]" },
  { t: 32700, sel: "[data-pt=applybtn]" },
  { t: 34900, sel: "[data-pt=applybtn]" },
  { t: 35800, sel: "[data-nav='4']", mob: "[data-act='7'] .pt-h" },
  { t: 37400, sel: "[data-nav='4']", mob: "[data-act='7'] .pt-h" },
  { t: 38600, sel: "[data-au='0']" },
  { t: 41300, sel: "[data-au='0']" },
  { t: 42300, sel: "[data-pt=score8]", off: [14, 10] },
  { t: TOUR_DURATION_MS, sel: "[data-pt=score8]", off: [14, 10] }
];

const CLICKS = [2100, 21600, 28000, 33100, 36200];

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const seg = (t: number, a: number, b: number) => ease(clamp01((t - a) / (b - a)));
const lin = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));

/** Arco de 270° empezando en 135°, idéntico al componente `Gauge` del producto. */
function arcPath(size: number, stroke: number, fromDeg: number, toDeg: number): string {
  const r = (size - stroke) / 2;
  const c = size / 2;
  const polar = (deg: number): [number, number] => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [c + r * Math.cos(rad), c + r * Math.sin(rad)];
  };
  const [x1, y1] = polar(fromDeg);
  const [x2, y2] = polar(toDeg);
  const large = toDeg - fromDeg > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/**
 * En la landing el lienzo va dentro del cromo de navegador ya aprobado
 * (`.browserframe`, log de decisiones §1). El subtítulo y los controles se
 * quedan FUERA: son de la página de marketing, no de la app que se enseña —
 * meterlos dentro haría creer que el producto tiene botones «Atrás /
 * Siguiente» en su propia interfaz.
 */
function StageFrame({ variant, children }: { variant: Variant; children: ReactNode }) {
  if (variant !== "hero") return <>{children}</>;
  return (
    <div className="browserframe pt-frame">
      <div className="bf-bar">
        <span className="bf-dot" style={{ background: "#f06360" }} />
        <span className="bf-dot" style={{ background: "#f6be4f" }} />
        <span className="bf-dot" style={{ background: "#5ac15a" }} />
        <span className="bf-url">genscore.es/dashboard</span>
      </div>
      {children}
    </div>
  );
}

export function ProductTour({
  variant,
  onClose,
  onFinish,
  ctaHref
}: {
  variant: Variant;
  onClose?: () => void;
  onFinish?: () => void;
  /**
   * Destino del botón del último paso. En la landing es un enlace de verdad
   * (`/signup`) y no un `onClick`: es la llamada a la acción del hero, tiene
   * que poder abrirse en otra pestaña y ser rastreable como enlace.
   */
  ctaHref?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stepIdx, setStepIdx] = useState(0);

  /**
   * La pista del botón «Siguiente» (fundador, 2026-08-07).
   *
   * El problema no es que el botón sea poco visible —es azul, sólido y está
   * solo en su esquina— sino que la mirada está arriba, en el lienzo, y hay
   * que bajarla. De ahí las dos mitades: el halo trae la mirada, la flecha
   * dice hacia dónde.
   *
   * Arranca en el mismo instante que el paso 1 (fundador, 2026-08-08): no
   * espera a que el paso se detenga. Así el botón ya está invitando al clic
   * mientras el paso 1 todavía se reproduce solo, no sólo después.
   *
   *   "idle" → aún no ha arrancado el tour
   *   "on"   → en bucle hasta que se pulse el botón
   *   "done" → ya se ha pulsado; no vuelve en toda la sesión
   */
  const [hint, setHint] = useState<"idle" | "on" | "done">("idle");
  const hintRef = useRef<"idle" | "on" | "done">("idle");

  const setHintState = useCallback((next: "idle" | "on" | "done") => {
    hintRef.current = next;
    setHint(next);
  }, []);

  /** Gasta la pista. Idempotente: una vez apagada no se vuelve a encender. */
  const endHint = useCallback(() => {
    if (hintRef.current === "done") return;
    hintRef.current = "done";
    setHint("done");
  }, []);

  // Estado de reproducción fuera de React: lo lee y escribe el bucle.
  //
  // La reproducción automática se detiene al acabar el primer paso: encadenar
  // los ocho no da tiempo a leer el subtítulo antes de que cambie la pantalla
  // (fundador, 2026-08-07). A partir de ahí manda «Siguiente».
  //
  // En la landing arranca parado: no empieza hasta que el lienzo se ve entero,
  // porque si no el visitante llega al hero con el paso 1 ya empezado o
  // terminado. En el popup siempre está entero delante, así que arranca solo.
  const clock = useRef({
    t: 0,
    last: null as number | null,
    playing: variant === "modal",
    holdAt: holdTimeFor(AUTOPLAY_THROUGH_STEP_INDEX) as number | null
  });
  const firedClick = useRef(0);
  /** El lienzo ya ha llegado a verse entero alguna vez (sólo landing). */
  const hasStarted = useRef(variant === "modal");
  /** Se paró porque se salió de pantalla, no porque acabara el paso. */
  const pausedByScroll = useRef(false);

  const isLast = stepIdx === TOUR_STEPS.length - 1;

  /** Salta a un paso, lo reproduce entero y se detiene al acabarlo. */
  const goToStep = useCallback((i: number) => {
    const idx = Math.max(0, Math.min(TOUR_STEPS.length - 1, i));
    const step = TOUR_STEPS[idx];
    clock.current.t = step.from;
    clock.current.holdAt = holdTimeFor(idx);
    clock.current.playing = true;
    firedClick.current = step.from;
    // Navegar a mano cuenta como arrancar: si el usuario ya ha tocado el tour,
    // volver a entrar en pantalla no debe reiniciar nada.
    hasStarted.current = true;
    pausedByScroll.current = false;
    endHint();
    setStepIdx(idx);
  }, [endHint]);

  /** Congela un paso donde su animación ya se ha desarrollado. */
  const freezeStep = useCallback((i: number) => {
    clock.current.t = freezeTimeFor(i);
    clock.current.holdAt = null;
    clock.current.playing = false;
    firedClick.current = clock.current.t;
    hasStarted.current = true;
    pausedByScroll.current = false;
    endHint();
    setStepIdx(i);
  }, [endHint]);

  useEffect(() => {
    const root = rootRef.current;
    const stage = stageRef.current;
    if (!root || !stage) return;

    const q = <T extends Element>(sel: string) => root.querySelector<T>(sel);
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Sin movimiento: se muestra el fotograma final y ya. No es una
    // degradación, es el contrato — nada se anima nunca.
    if (reduced) {
      clock.current.t = TOUR_DURATION_MS;
      clock.current.playing = false;
      clock.current.holdAt = null;
      firedClick.current = TOUR_DURATION_MS;
      hasStarted.current = true;
    } else if (variant === "modal") {
      // El popup siempre está entero delante, así que el reloj arranca en el
      // montaje — y la pista, con él.
      setHintState("on");
    }

    const trackAttrs: Array<[string, number, number]> = [
      ["[data-pt=track3]", 92, 10],
      ["[data-pt=track8]", 92, 10],
      ["[data-pt=track7]", 74, 8]
    ];
    trackAttrs.forEach(([sel, size, stroke]) => {
      q<SVGPathElement>(sel)?.setAttribute("d", arcPath(size, stroke, 135, 405));
    });

    function setGauge(sel: string, frac: number, size: number, stroke: number) {
      const el = q<SVGPathElement>(sel);
      if (!el) return;
      el.setAttribute("d", frac <= 0.005 ? "" : arcPath(size, stroke, 135, 135 + 270 * frac));
    }

    function drawChart(prefix: string, series: number[], progress: number, showDot: boolean) {
      const svg = q<SVGSVGElement>(`[data-pt=${prefix}]`);
      const grid = q<SVGGElement>(`[data-pt=${prefix}grid]`);
      const area = q<SVGPathElement>(`[data-pt=${prefix}area]`);
      const line = q<SVGPathElement>(`[data-pt=${prefix}line]`);
      const dot = q<SVGCircleElement>(`[data-pt=${prefix}dot]`);
      if (!svg || !grid || !area || !line || !dot) return null;
      const box = svg.getBoundingClientRect();
      const w = box.width;
      const h = box.height;
      if (!w || !h) return null;

      const padY = 9;
      // Escala ajustada a la serie, no fija: con una escala 0-100 los seis
      // primeros escaneos ocupan un cuarto de la altura y la mejora no se lee.
      const lo = Math.min(...series);
      const hi = Math.max(...series);
      const pad = Math.max(6, (hi - lo) * 0.28);
      const min = lo - pad;
      const max = hi + pad;
      const pts = series.map((v, i) => [
        (i / (series.length - 1)) * (w - 8) + 4,
        h - padY - ((v - min) / (max - min)) * (h - padY * 2)
      ]);

      let gridMarkup = "";
      for (let g = 0; g <= 2; g += 1) {
        const y = padY + (g / 2) * (h - padY * 2);
        gridMarkup += `<line x1="0" y1="${y.toFixed(1)}" x2="${w}" y2="${y.toFixed(1)}" stroke="#eef0f4" stroke-width="1"/>`;
      }
      grid.innerHTML = gridMarkup;

      const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
      line.setAttribute("d", d);
      const lastPt = pts[pts.length - 1];
      area.setAttribute("d", `${d} L${lastPt[0].toFixed(1)} ${h} L${pts[0][0].toFixed(1)} ${h} Z`);

      const len = line.getTotalLength();
      line.style.strokeDasharray = String(len);
      line.style.strokeDashoffset = String(len * (1 - progress));
      area.style.opacity = String(progress);

      dot.setAttribute("cx", lastPt[0].toFixed(1));
      dot.setAttribute("cy", lastPt[1].toFixed(1));
      dot.setAttribute("opacity", showDot ? "1" : "0");
      return { x: lastPt[0], y: lastPt[1] };
    }

    function pointAt(wp: Waypoint): [number, number] {
      let sel = wp.sel;
      // Un elemento con `display:none` mide 0x0: apuntar ahí dejaría el cursor
      // clavado en la esquina. Por eso los waypoints del menú llevan alternativa.
      if (sel && wp.mob) {
        const probe = stage!.querySelector(sel);
        if (!probe || probe.getBoundingClientRect().width === 0) sel = wp.mob;
      }
      if (sel) {
        const el = stage!.querySelector(sel);
        if (el) {
          const r = el.getBoundingClientRect();
          if (r.width > 0) {
            const s = stage!.getBoundingClientRect();
            const off = wp.off ?? [0, 0];
            return [
              ((r.left + r.width / 2 - s.left) / s.width) * 100 + (off[0] / s.width) * 100,
              ((r.top + r.height / 2 - s.top) / s.height) * 100 + (off[1] / s.height) * 100
            ];
          }
        }
      }
      return wp.xy ?? [50, 50];
    }

    function setStyle(sel: string, prop: string, value: string) {
      const el = q<HTMLElement>(sel);
      if (el) el.style.setProperty(prop, value);
    }
    function setText(sel: string, value: string) {
      const el = q<HTMLElement>(sel);
      if (el && el.textContent !== value) el.textContent = value;
    }
    function toggle(sel: string, cls: string, on: boolean) {
      q<HTMLElement>(sel)?.classList.toggle(cls, on);
    }

    function render(t: number) {
      const idx = stepIndexAt(t);
      const step = TOUR_STEPS[idx];

      TOUR_STEPS.forEach((s, i) => {
        toggle(`[data-act='${s.n}']`, "is-on", i === idx);
      });

      // El menú: el paso 1 no resalta nada («Nuevo dominio» no es una entrada).
      const navOn = step.n === 1 ? 0 : step.n === 5 || step.n === 6 ? 5 : step.n === 7 ? 4 : 1;
      [1, 2, 3, 4, 5].forEach((n) => toggle(`[data-nav='${n}']`, "is-on", n === navOn));

      // ---------- 1 — dominio, competidores y prompts ----------
      const typed = Math.round(lin(t, 1000, 2050) * DOMAIN.length);
      setText("[data-pt=typed]", DOMAIN.slice(0, typed));
      toggle("[data-pt=field]", "is-focus", t > 950 && t < 2600);
      setStyle(
        "[data-pt=caret]",
        "opacity",
        t > 950 && t < 2600 && Math.floor(t / 480) % 2 === 0 ? "1" : "0"
      );
      const loadDone = t >= 4900;
      setStyle("[data-pt=load]", "opacity", t > 2150 ? "1" : "0");
      toggle("[data-pt=load]", "is-done", loadDone);
      setText(
        "[data-pt=loadtxt]",
        loadDone ? "3 competidores y 10 prompts propuestos" : `Analizando ${DOMAIN} con IA…`
      );
      for (let c = 0; c < 3; c += 1) {
        const p = seg(t, 2500 + c * 180, 3200 + c * 180);
        setStyle(`[data-c='${c}']`, "opacity", String(p));
        setStyle(`[data-c='${c}']`, "transform", `translateY(${((1 - p) * 4).toFixed(1)}px)`);
      }
      for (let p1 = 0; p1 < 6; p1 += 1) {
        const p = seg(t, 3000 + p1 * 250, 3800 + p1 * 250);
        setStyle(`[data-p='${p1}']`, "opacity", String(p));
        setStyle(`[data-p='${p1}']`, "transform", `translateY(${((1 - p) * 5).toFixed(1)}px)`);
      }

      // ---------- 2 — escaneo ----------
      [6900, 7600, 8300].forEach((at, e) => toggle(`[data-eng='${e}']`, "is-done", t >= at));
      const p2 = lin(t, 5900, 8700);
      setStyle("[data-pt=scanbar]", "width", `${(p2 * 100).toFixed(1)}%`);
      setText("[data-pt=scannum]", `${Math.round(p2 * 30)} / 30`);

      // ---------- 3 — el GEO Score ----------
      const score3 = Math.round(seg(t, 9200, 11400) * 48);
      setText("[data-pt=score3]", String(score3));
      setGauge("[data-pt=fill3]", score3 / 100, 92, 10);
      [61, 44, 38, 27].forEach((target, m) => {
        const w = seg(t, 10400 + m * 300, 11600 + m * 300) * target;
        setStyle(`[data-comp='${m}'] .pt-sovfill`, "width", `${w.toFixed(1)}%`);
      });

      // ---------- 4 — escaneo continuo ----------
      const p4 = seg(t, 15800, 18800);
      const geo4 = drawChart("ch4", TREND, p4, t > 18600);
      const trendV = q<HTMLElement>("[data-pt=trendv]");
      if (trendV) trendV.innerHTML = `${Math.round(31 + p4 * 17)}<span>/ 100</span>`;
      setText("[data-pt=trenddelta]", `+${Math.round(p4 * 17)} pt en 5 escaneos`);
      setStyle("[data-pt=trenddelta]", "opacity", p4 > 0.08 ? "1" : "0");
      const tip = q<HTMLElement>("[data-pt=tip4]");
      if (tip && geo4) {
        // El último punto está pegado al borde derecho: sin acotar, el globo
        // se sale del lienzo.
        const half = tip.offsetWidth / 2;
        const wrapW = (tip.parentElement as HTMLElement).getBoundingClientRect().width;
        tip.style.left = `${Math.max(half + 2, Math.min(geo4.x, wrapW - half - 2))}px`;
        tip.style.top = `${Math.max(22, geo4.y)}px`;
      }
      toggle("[data-pt=tip4]", "is-on", t > 19000 && t < 20700);

      // ---------- 5 — recomendaciones ----------
      const zoom = t > 23600 && t < 26500;
      for (let r = 0; r < 3; r += 1) {
        const rec = q<HTMLElement>(`[data-rec='${r}']`);
        if (!rec) continue;
        rec.classList.toggle("is-focus", zoom && r === 0);
        rec.classList.toggle("is-dim", zoom && r !== 0);
        if (zoom) {
          rec.style.opacity = "";
          rec.style.transform = "";
        } else {
          const p = seg(t, 21200 + r * 260, 21900 + r * 260);
          rec.style.opacity = String(p);
          rec.style.transform = `translateY(${((1 - p) * 8).toFixed(1)}px)`;
        }
      }

      // ---------- 6 — generar la solución ----------
      const generating = t >= 28000 && t < 30400;
      const generated = t >= 30400;
      const genBtn = q<HTMLElement>("[data-pt=genbtn]");
      if (genBtn) {
        genBtn.classList.toggle("is-press", t >= 27950 && t < 28150);
        genBtn.classList.toggle("is-busy", generating);
        const want = generating
          ? '<span class="pt-spin"></span>Generando…'
          : generated
            ? "✓ Generado"
            : "Generar solución";
        if (genBtn.innerHTML !== want) genBtn.innerHTML = want;
      }
      setText(
        "[data-pt=genstate]",
        generating ? "Escribiendo el contenido con IA…" : generated ? "Contenido listo" : "Listo para generar"
      );
      // El bloque aparece cuando hay algo que enseñar, no antes.
      const vis6 = t < 28000 ? 0 : generating ? 0.35 : seg(t, 30400, 31400);
      setStyle("[data-pt=gen]", "opacity", String(vis6));
      setStyle("[data-pt=gen]", "transform", `translateY(${((1 - vis6) * 6).toFixed(1)}px)`);
      setText("[data-pt=genhead]", generating ? "Generando…" : "FAQ generado · listo para pegar");
      setStyle("[data-pt=genbody]", "filter", generating ? "blur(3px)" : "none");
      const applied = t >= 33250;
      const applyBtn = q<HTMLElement>("[data-pt=applybtn]");
      if (applyBtn) {
        applyBtn.classList.toggle("is-press", t >= 33050 && t < 33250);
        applyBtn.classList.toggle("is-done", applied);
        applyBtn.classList.toggle("pt-primary", !applied);
        const want = applied ? "✓ Aplicada" : "Marcar como aplicada";
        if (applyBtn.textContent !== want) applyBtn.textContent = want;
      }

      // ---------- 7 — auditoría técnica ----------
      const health = Math.round(seg(t, 36400, 38200) * 64);
      setText("[data-pt=health]", String(health));
      setGauge("[data-pt=fill7]", health / 100, 74, 8);
      for (let u = 0; u < 3; u += 1) {
        const p = seg(t, 37600 + u * 320, 38400 + u * 320);
        setStyle(`[data-au='${u}']`, "opacity", String(p));
        setStyle(`[data-au='${u}']`, "transform", `translateY(${((1 - p) * 6).toFixed(1)}px)`);
        toggle(`[data-au='${u}']`, "is-focus", u === 0 && t > 39000 && t < 41400);
      }

      // ---------- 8 — el siguiente escaneo ----------
      const p8 = seg(t, 42300, 45300);
      const score8 = Math.round(48 + p8 * 23);
      setText("[data-pt=score8]", String(score8));
      setGauge("[data-pt=fill8]", score8 / 100, 92, 10);
      drawChart("ch8", TREND_AFTER, p8, t > 45100);
      setText("[data-pt=delta8]", `+${Math.round(p8 * 23)} pt`);
      setStyle("[data-pt=delta8]", "opacity", p8 > 0.05 ? "1" : "0");
      const band = q<HTMLElement>("[data-pt=band8]");
      if (band) {
        const competitivo = score8 >= 70;
        band.textContent = competitivo ? "Franja «competitivo»" : "Franja «medio»";
        band.className = `pt-badge ${competitivo ? "pt-badge-pos" : "pt-badge-mid"}`;
      }
      setStyle("[data-pt=new8]", "opacity", String(seg(t, 45600, 46600)));

      // ---------- cursor ----------
      let a = PATH[0];
      let b = PATH[PATH.length - 1];
      for (let w = 0; w < PATH.length - 1; w += 1) {
        if (t >= PATH[w].t && t <= PATH[w + 1].t) {
          a = PATH[w];
          b = PATH[w + 1];
          break;
        }
      }
      if (t > PATH[PATH.length - 1].t) {
        a = PATH[PATH.length - 1];
        b = a;
      }
      const pa = pointAt(a);
      const pb = pointAt(b);
      const prog = a === b ? 1 : ease(clamp01((t - a.t) / (b.t - a.t)));
      const cx = pa[0] + (pb[0] - pa[0]) * prog;
      const cy = pa[1] + (pb[1] - pa[1]) * prog;
      setStyle("[data-pt=cursor]", "left", `${cx}%`);
      setStyle("[data-pt=cursor]", "top", `${cy}%`);
      setStyle("[data-pt=ripple]", "left", `${cx}%`);
      setStyle("[data-pt=ripple]", "top", `${cy}%`);

      return idx;
    }

    function fireClicks(prev: number, now: number) {
      if (reduced) return;
      const ripple = q<HTMLElement>("[data-pt=ripple]");
      if (!ripple) return;
      CLICKS.forEach((ct) => {
        if (prev < ct && now >= ct) {
          ripple.classList.remove("is-go");
          void ripple.offsetWidth; // fuerza el reinicio de la animación
          ripple.classList.add("is-go");
        }
      });
    }

    let raf = 0;
    let currentIdx = -1;
    function frame(now: number) {
      const c = clock.current;
      if (c.last === null) c.last = now;
      const dt = now - c.last;
      c.last = now;
      if (c.playing) {
        const prev = firedClick.current;
        c.t += dt;
        // Un paso por reproducción: se detiene al terminar el paso en curso,
        // tanto el primero (automático) como los que trae «Siguiente».
        if (c.holdAt !== null && c.t >= c.holdAt) {
          const wasLast = c.holdAt >= holdTimeFor(TOUR_STEPS.length - 1);
          c.t = c.holdAt;
          c.playing = false;
          c.holdAt = null;
          if (wasLast) onFinish?.();
        }
        if (c.t >= TOUR_DURATION_MS) {
          c.t = TOUR_DURATION_MS;
          c.playing = false;
          onFinish?.();
        }
        fireClicks(prev, c.t);
        firedClick.current = c.t;
      }
      const idx = render(c.t);
      if (idx !== currentIdx) {
        currentIdx = idx;
        setStepIdx(idx);
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    // En la landing el tour arranca cuando el lienzo se ve ENTERO, no cuando
    // asoma (fundador, 2026-08-07): entrando a 0,25 de visibilidad, quien
    // bajaba hasta el hero se lo encontraba con el paso 1 ya empezado. Y se
    // para al salir de pantalla, porque animar lo que nadie mira es gastar
    // batería a cambio de nada. En el popup siempre está entero delante.
    let io: IntersectionObserver | null = null;
    if (variant === "hero" && typeof IntersectionObserver === "function") {
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((en) => {
            const c = clock.current;
            if (reduced) return; // nada se anima nunca; el contrato manda.

            // «Entero» tiene que admitir el caso de que el lienzo sea más alto
            // que la ventana: con `ratio >= 0.98` a secas, en una pantalla
            // corta no se cumpliría jamás y el tour no arrancaría nunca.
            const tallerThanViewport = en.boundingClientRect.height > window.innerHeight;
            const fullyVisible = tallerThanViewport
              ? en.intersectionRect.height >= window.innerHeight * 0.9
              : en.intersectionRatio >= 0.98;

            if (fullyVisible) {
              if (!hasStarted.current) {
                hasStarted.current = true;
                c.playing = true;
                // Arranca con el paso 1, no cuando éste se detiene: el botón
                // ya invita al clic mientras el paso todavía se reproduce solo.
                if (hintRef.current === "idle") setHintState("on");
              } else if (pausedByScroll.current) {
                pausedByScroll.current = false;
                c.playing = true;
              }
              return;
            }

            if (!en.isIntersecting && c.playing) {
              c.playing = false;
              // El destino de parada se conserva: al volver, el paso termina
              // donde tenía que terminar en vez de seguir hasta el final.
              pausedByScroll.current = true;
            }
          });
        },
        { threshold: [0, 0.5, 0.9, 0.98, 1] }
      );
      io.observe(stage);
    }

    const onResize = () => render(clock.current.t);
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [variant, onFinish, setHintState]);

  const rootClass = `ptour ptour--${variant}`;

  return (
    <div className={rootClass} ref={rootRef}>
      {variant === "modal" && (
        <>
          <button type="button" className="pt-close" onClick={onClose} aria-label="Cerrar el tour">
            ✕
          </button>
          <div className="pt-head">
            <span className="pt-eyebrow">Tour de bienvenida</span>
            <h2 className="pt-title">Aprende cómo funciona</h2>
          </div>
        </>
      )}

      {/* Los ocho subtítulos se apilan en la misma celda y sólo uno es
          visible: así el contenedor mide siempre lo que el más alto y la
          pieza no da saltos de altura al avanzar de paso. */}
      <p className="pt-sub">
        {TOUR_STEPS.map((step, i) => (
          <span
            key={step.n}
            aria-hidden={i === stepIdx ? undefined : "true"}
            dangerouslySetInnerHTML={{ __html: step.sub }}
          />
        ))}
      </p>

      <StageFrame variant={variant}>
      <div className="pt-stage" ref={stageRef}>
        <aside className="pt-side">
          <div className="pt-sbrand">
            <span className="pt-sdot" />
            GenScore
          </div>
          <div className="pt-slabel">Analizar</div>
          <div className="pt-nav" data-nav="1">
            <i />
            Visión general
          </div>
          <div className="pt-nav" data-nav="2">
            <i />
            Prompts
          </div>
          <div className="pt-nav" data-nav="3">
            <i />
            Competidores
          </div>
          <div className="pt-nav" data-nav="4">
            <i />
            Auditoría web
          </div>
          <div className="pt-slabel">Actuar</div>
          <div className="pt-nav" data-nav="5">
            <i />
            Recomendaciones
          </div>
        </aside>

        <div className="pt-main">
          {/* 1 — dominio, competidores y prompts */}
          <section className={`pt-act${stepIdx === 0 ? " is-on" : ""}`} data-act="1">
            <p className="pt-h">Nuevo dominio</p>
            <p className="pt-hsub">Dominio y mercado</p>
            <div className="pt-card pt-fill">
              <div className="pt-field" data-pt="field">
                <span className="pt-fico" />
                <span data-pt="typed" />
                <span className="pt-caret" data-pt="caret" />
              </div>
              <div className="pt-load" data-pt="load" style={{ opacity: 0 }}>
                <span className="pt-spin" />
                <span className="pt-ok">✓</span>
                <span data-pt="loadtxt">Analizando {DOMAIN} con IA…</span>
              </div>
              <div className="pt-2col">
                <div>
                  <div className="pt-collabel">Competidores</div>
                  {["rival-uno.com", "rival-dos.es", "rival-tres.io"].map((c, i) => (
                    <span className="pt-chip" data-c={i} key={c} style={{ opacity: 0 }}>
                      {c}
                    </span>
                  ))}
                </div>
                <div className="pt-prompts">
                  <div className="pt-collabel">Prompts que se lanzarán</div>
                  {[
                    "mejores gafas graduadas online",
                    "alternativas a comprar en óptica",
                    "gafas de sol con receta baratas",
                    "qué marca de gafas dura más",
                    "gafas progresivas relación calidad precio"
                  ].map((p, i) => (
                    <div className="pt-pline" data-p={i} key={p} style={{ opacity: 0 }}>
                      {p}
                    </div>
                  ))}
                  <div className="pt-pmore" data-p="5" style={{ opacity: 0 }}>
                    y 5 más · todos editables
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 2 — escaneo */}
          <section className={`pt-act${stepIdx === 1 ? " is-on" : ""}`} data-act="2">
            <p className="pt-h">Escaneando {DOMAIN}</p>
            <p className="pt-hsub">30 lanzamientos en tres motores</p>
            <div className="pt-card pt-fill pt-center">
              <div className="pt-engines">
                {[
                  { name: "Gemini", color: "#4285f4" },
                  { name: "Claude", color: "#d97757" },
                  { name: "ChatGPT", color: "#10a37f" }
                ].map((e, i) => (
                  <div className="pt-eng" data-eng={i} key={e.name}>
                    <span className="pt-bulb" style={{ background: e.color }} />
                    {e.name}
                    <span className="pt-tick">✓</span>
                  </div>
                ))}
              </div>
              <div className="pt-bar">
                <i data-pt="scanbar" style={{ width: "0%" }} />
              </div>
              <div className="pt-barcap">
                <span>Respuestas recogidas</span>
                <span data-pt="scannum">0 / 30</span>
              </div>
            </div>
          </section>

          {/* 3 — el GEO Score */}
          <section className={`pt-act${stepIdx === 2 ? " is-on" : ""}`} data-act="3">
            <p className="pt-h">Visión general</p>
            <p className="pt-hsub">Señales reales · último escaneo hoy</p>
            <div className="pt-card pt-fill pt-center">
              <div className="pt-hero">
                <div className="pt-gwrap" style={{ width: 92, height: 92 }}>
                  <svg width="92" height="92" viewBox="0 0 92 92" aria-hidden="true">
                    <defs>
                      <linearGradient id="ptg3" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="var(--brand-blue-2)" />
                        <stop offset="100%" stopColor="var(--accent)" />
                      </linearGradient>
                    </defs>
                    <path data-pt="track3" fill="none" stroke="var(--surface-sunk)" strokeWidth={10} strokeLinecap="round" />
                    <path data-pt="fill3" fill="none" stroke="url(#ptg3)" strokeWidth={10} strokeLinecap="round" />
                  </svg>
                  <div className="pt-gcenter">
                    <div>
                      <div className="pt-gnum" data-pt="score3">0</div>
                      <div className="pt-gcap">/ 100</div>
                    </div>
                  </div>
                </div>
                <div className="pt-compose">
                  {[
                    { l: "Presencia (mención)", v: 61, c: "var(--accent)" },
                    { l: "Prominencia (posición)", v: 44, c: "#7c3aed" },
                    { l: "Cuota de voz", v: 38, c: "#0d9488" },
                    { l: "Autoridad (citas)", v: 27, c: "#e54563" }
                  ].map((row, i) => (
                    <div data-comp={i} key={row.l}>
                      <div className="pt-ctop">
                        <span className="pt-cl">{row.l}</span>
                        <span className="pt-cv">{row.v}%</span>
                      </div>
                      <div className="pt-sov">
                        <i className="pt-sovfill" style={{ background: row.c, width: 0 }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="pt-kpis">
                <div className="pt-kpi">
                  <div className="pt-kpil">Tasa de mención</div>
                  <div className="pt-kpiv">
                    61<span>%</span>
                  </div>
                </div>
                <div className="pt-kpi">
                  <div className="pt-kpil">Presión competitiva</div>
                  <div className="pt-kpiv">
                    42<span>%</span>
                  </div>
                </div>
                <div className="pt-kpi">
                  <div className="pt-kpil">Sentimiento</div>
                  <div className="pt-kpiv" style={{ fontSize: 13 }}>
                    Neutro
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 4 — escaneo continuo */}
          <section className={`pt-act${stepIdx === 3 ? " is-on" : ""}`} data-act="4">
            <p className="pt-h">Evolución de tu GEO Score</p>
            <p className="pt-hsub">Un punto por escaneo · automático</p>
            <div className="pt-card pt-fill pt-chartwrap">
              <div className="pt-trendhead">
                <div>
                  <div className="pt-trendv" data-pt="trendv">
                    31<span>/ 100</span>
                  </div>
                  <div className="pt-trendl">GEO Score actual</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <span className="pt-badge pt-badge-pos" data-pt="trenddelta" style={{ opacity: 0 }}>
                    +0 pt en 5 escaneos
                  </span>
                  {/* Cierto, no una frase de folleto: `lib/scan/cron.ts`
                      reescanea a diario en free/pro/agency y semanalmente en
                      starter. Si esa cadencia cambia, este texto cambia. */}
                  <span className="pt-badge pt-badge-mid">
                    <span className="pt-spin" style={{ width: 7, height: 7, borderWidth: 1.2 }} />
                    Escaneo automático a diario
                  </span>
                </div>
              </div>
              <div className="pt-chartbox">
                <svg data-pt="ch4" aria-hidden="true">
                  <defs>
                    <linearGradient id="ptchg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--brand-blue)" stopOpacity="0.22" />
                      <stop offset="100%" stopColor="var(--brand-blue)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <g data-pt="ch4grid" />
                  <path data-pt="ch4area" fill="url(#ptchg)" />
                  <path
                    data-pt="ch4line"
                    fill="none"
                    stroke="var(--brand-blue)"
                    strokeWidth={2.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle data-pt="ch4dot" r={3.6} fill="var(--brand-blue)" stroke="#fff" strokeWidth={2} opacity={0} />
                </svg>
              </div>
              <div className="pt-chartfoot">
                <span>hace 5 escaneos</span>
                <span>último</span>
              </div>
              <div className="pt-charttip" data-pt="tip4">
                48 · escaneo de hoy
              </div>
            </div>
          </section>

          {/* 5 — recomendaciones */}
          <section className={`pt-act${stepIdx === 4 ? " is-on" : ""}`} data-act="5">
            <p className="pt-h">Recomendaciones</p>
            <p className="pt-hsub">Ordenadas por impacto estimado</p>
            <div className="pt-recs pt-fill">
              {[
                { t: "Añade un FAQ a /precios", d: "4 prompts te citan sin responder a la pregunta", pts: "+9 pts est." },
                { t: "Marca Organization en schema.org", d: "Falta en 12 de 14 páginas", pts: "+6 pts est." },
                { t: "Compara tu producto con rival-uno", d: "Gana 3 prompts donde tú no apareces", pts: "+5 pts est." }
              ].map((rec, i) => (
                <div className="pt-rec" data-rec={i} key={rec.t} style={{ opacity: 0 }}>
                  <span className="pt-recpri">{i + 1}</span>
                  <span className="pt-recbody">
                    <span className="pt-rect">{rec.t}</span>
                    <span className="pt-recd">
                      {rec.d} · <b>{rec.pts}</b>
                    </span>
                  </span>
                  <span className="pt-reccta pt-ghost">Generar</span>
                </div>
              ))}
            </div>
          </section>

          {/* 6 — generar la solución */}
          <section className={`pt-act${stepIdx === 5 ? " is-on" : ""}`} data-act="6">
            <p className="pt-h">Añade un FAQ a /precios</p>
            <p className="pt-hsub">Impacto estimado +9 pts · esfuerzo bajo</p>
            <div className="pt-genstack">
              <div className="pt-rec">
                <span className="pt-recpri">1</span>
                <span className="pt-recbody">
                  <span className="pt-rect">Añade un FAQ a /precios</span>
                  <span className="pt-recd" data-pt="genstate">
                    Listo para generar
                  </span>
                </span>
                <span className="pt-reccta" data-pt="genbtn">
                  Generar solución
                </span>
              </div>
              <div className="pt-gen" data-pt="gen" style={{ opacity: 0 }}>
                <div className="pt-genhead">
                  <span data-pt="genhead">FAQ generado · listo para pegar</span>
                </div>
                <div className="pt-genbody" data-pt="genbody">
                  <div>
                    <div className="pt-qaq">¿Cuánto cuestan las gafas graduadas?</div>
                    <div className="pt-qaa">
                      Desde 95 € con cristales incluidos. El precio no cambia según la graduación.
                    </div>
                  </div>
                  <div>
                    <div className="pt-qaq">¿El envío y la devolución son gratis?</div>
                    <div className="pt-qaa">Sí, en toda España, con 30 días para devolver sin coste.</div>
                  </div>
                </div>
                <div className="pt-genfoot">
                  <span className="pt-minibtn">Copiar HTML</span>
                  <span className="pt-minibtn pt-primary" data-pt="applybtn">
                    Marcar como aplicada
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* 7 — auditoría técnica. Comprobaciones y pesos reales del diseño
              aprobado en docs/design-reference/web-audit-issues-1/. */}
          <section className={`pt-act${stepIdx === 6 ? " is-on" : ""}`} data-act="7">
            <p className="pt-h">Auditoría web</p>
            <p className="pt-hsub">14 páginas analizadas · hoy</p>
            <div className="pt-card pt-fill pt-center">
              <div className="pt-audittop">
                <div className="pt-gwrap" style={{ width: 74, height: 74 }}>
                  <svg width="74" height="74" viewBox="0 0 74 74" aria-hidden="true">
                    <defs>
                      <linearGradient id="ptg7" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="var(--brand-blue-2)" />
                        <stop offset="100%" stopColor="#ffb020" />
                      </linearGradient>
                    </defs>
                    <path data-pt="track7" fill="none" stroke="var(--surface-sunk)" strokeWidth={8} strokeLinecap="round" />
                    <path data-pt="fill7" fill="none" stroke="url(#ptg7)" strokeWidth={8} strokeLinecap="round" />
                  </svg>
                  <div className="pt-gcenter">
                    <div>
                      <div className="pt-gnum" data-pt="health" style={{ fontSize: 17 }}>
                        0
                      </div>
                      <div className="pt-gcap">salud</div>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="pt-auditt" style={{ fontSize: 10.5 }}>
                    Salud técnica del sitio
                  </div>
                  <div className="pt-auditd">Media de las 14 páginas analizadas</div>
                  <div style={{ marginTop: 5 }}>
                    <span className="pt-badge pt-badge-warn">3 arreglos disponibles</span>
                  </div>
                </div>
              </div>
              <div className="pt-auditlist">
                {[
                  { t: "4 páginas sin datos estructurados", d: "JSON-LD ausente · 15 pt por página", pts: "+6,0 pt" },
                  { t: "6 páginas sin meta descripción", d: "Metadatos · 5 pt por página", pts: "+3,0 pt" },
                  { t: "3 páginas con más de un H1", d: "Formato respuesta-primero · 5 pt por página", pts: "+1,1 pt" }
                ].map((row, i) => (
                  <div className="pt-auditrow" data-au={i} key={row.t} style={{ opacity: 0 }}>
                    <span className="pt-auditico">!</span>
                    <span className="pt-auditbody">
                      <span className="pt-auditt">{row.t}</span>
                      <span className="pt-auditd">{row.d}</span>
                    </span>
                    <span className="pt-auditpt">{row.pts}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* 8 — el siguiente escaneo */}
          <section className={`pt-act${stepIdx === 7 ? " is-on" : ""}`} data-act="8">
            <p className="pt-h">Visión general</p>
            <p className="pt-hsub">Escaneo posterior a las acciones aplicadas</p>
            <div className="pt-card pt-fill pt-center">
              <div className="pt-hero">
                <div className="pt-gwrap" style={{ width: 92, height: 92 }}>
                  <svg width="92" height="92" viewBox="0 0 92 92" aria-hidden="true">
                    <defs>
                      <linearGradient id="ptg8" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="var(--brand-blue-2)" />
                        <stop offset="100%" stopColor="var(--pos)" />
                      </linearGradient>
                    </defs>
                    <path data-pt="track8" fill="none" stroke="var(--surface-sunk)" strokeWidth={10} strokeLinecap="round" />
                    <path data-pt="fill8" fill="none" stroke="url(#ptg8)" strokeWidth={10} strokeLinecap="round" />
                  </svg>
                  <div className="pt-gcenter">
                    <div>
                      <div className="pt-gnum" data-pt="score8">48</div>
                      <div className="pt-gcap">/ 100</div>
                    </div>
                  </div>
                </div>
                <div className="pt-chartwrap" style={{ flex: "1 1 auto", minWidth: 0 }}>
                  <div className="pt-chartbox" style={{ minHeight: 76, height: 96 }}>
                    <svg data-pt="ch8" aria-hidden="true">
                      <g data-pt="ch8grid" />
                      <path data-pt="ch8area" fill="url(#ptchg)" />
                      <path
                        data-pt="ch8line"
                        fill="none"
                        stroke="var(--brand-blue)"
                        strokeWidth={2.2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <circle data-pt="ch8dot" r={3.6} fill="var(--pos)" stroke="#fff" strokeWidth={2} opacity={0} />
                    </svg>
                  </div>
                  <div className="pt-deltarow">
                    <span className="pt-badge pt-badge-pos" data-pt="delta8" style={{ opacity: 0 }}>
                      +0 pt
                    </span>
                    <span className="pt-badge pt-badge-mid" data-pt="band8">
                      Franja «medio»
                    </span>
                    <span className="pt-badge pt-badge-warn" data-pt="new8" style={{ opacity: 0 }}>
                      2 ajustes nuevos
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <span className="pt-ripple" data-pt="ripple" />
        <svg className="pt-cursor" data-pt="cursor" viewBox="0 0 22 22" aria-hidden="true">
          <path
            d="M4 2 L4 17.5 L8.1 13.6 L10.9 19.6 L13.6 18.3 L10.8 12.4 L16.4 12.2 Z"
            fill="var(--ink)"
            stroke="#ffffff"
            strokeWidth={1.4}
            strokeLinejoin="round"
          />
        </svg>
      </div>
      </StageFrame>

      <div className="pt-foot">
        <div className="pt-dots" role="tablist" aria-label="Pasos del tour">
          {TOUR_STEPS.map((step, i) => (
            <button
              key={step.n}
              type="button"
              role="tab"
              className={`pt-dot${i === stepIdx ? " is-on" : ""}`}
              aria-selected={i === stepIdx}
              aria-label={`Paso ${step.n} de ${TOUR_STEPS.length}`}
              onClick={() => freezeStep(i)}
            />
          ))}
        </div>
        <span className="pt-sp" />
        {variant === "modal" && (
          <a className="pt-lnk" href="/geo" target="_blank" rel="noopener noreferrer">
            ¿Qué es el GEO?
          </a>
        )}
        <button type="button" className="pt-btn" onClick={() => goToStep(stepIdx - 1)} disabled={stepIdx === 0}>
          ← Atrás
        </button>
        {isLast && ctaHref ? (
          <a className="pt-btn pt-primary" href={ctaHref}>
            Prueba gratis
          </a>
        ) : (
          <button
            type="button"
            className={`pt-btn pt-primary${hint === "on" ? " pt-hint" : ""}`}
            // La pista sólo se apaga con el CLIC (fundador, 2026-08-07). Ni el
            // ratón por encima ni el foco de teclado la cortan: existe para
            // conseguir ese clic, así que mientras no llegue no ha terminado su
            // trabajo.
            onClick={() => {
              endHint();
              if (isLast) {
                onClose?.();
                return;
              }
              goToStep(stepIdx + 1);
            }}
          >
            {isLast ? (
              "Ir a mi panel"
            ) : (
              <>
                Siguiente <span className="pt-arrow">→</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
