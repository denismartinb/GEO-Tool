"use client";

import { useEffect, useRef } from "react";
import { animate, stagger } from "motion";
import { AGENT_SCENE_MARKUP } from "@/components/agentic/agent-scene-markup";

/**
 * AGENTIC-COMMERCE-1: the agent shopping scene of `/comercio-agentico`,
 * ported from the approved prototype (`docs/design-reference/agentic-commerce-1/`).
 *
 * One script per step, Motion for everything that moves. The height of the
 * frame is fixed in CSS on both layouts, so nothing below it jumps while the
 * chat scrolls like a messaging app.
 *
 * - `run` invalidates whatever is in flight: jumping to a step or leaving the
 *   viewport bumps it and every pending wait rejects with `CANCEL`.
 * - `fast` paints the steps before the chosen one instantly.
 * - It only plays while visible (IntersectionObserver) and stops when it
 *   leaves the screen.
 * - `prefers-reduced-motion: reduce` paints the last step and never animates.
 *
 * Illustration only: the stores, prices and dates are invented, and nothing
 * here reads data.
 */

type Keyframes = Record<string, unknown>;
type Opts = Record<string, unknown>;

const CANCEL = Symbol("cancel");
const SPRING = { type: "spring", stiffness: 380, damping: 30, mass: 0.9 } as const;
const STEP_SECONDS = [8.2, 6.4, 5.6, 6.4, 5.2];
const USER_TEXT =
  "Cómprame unas zapatillas de trail como las mías, talla 42, por menos de 100 € y que lleguen antes del sábado.";
const HELLO =
  '<div class="ca-msg ca-ag">Hola, soy tu agente de compras. ¿Qué te busco hoy?<span class="ca-sugg"><i>Zapatillas de trail</i><i>Un regalo</i><i>La compra de la semana</i></span></div>';
const SHOE =
  '<svg viewBox="0 0 120 70" aria-hidden="true"><path d="M8 50c10-2 22-14 30-26 4-6 10-8 14-4l10 10c6 6 16 9 26 10l18 2c6 1 8 5 7 10l-1 6H10c-4 0-6-4-2-8z" fill="#0f766e"/><path d="M8 58h100v6H8z" fill="#0b1426"/></svg>';
const CHECK =
  '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CLOCK = ["17:42", "17:42", "17:43"];
const ACCENTS: Record<string, string> = { á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u" };

function row(fav: string, color: string, name: string, sub: string, right: string, cls = "") {
  return `<div class="ca-chc-r ${cls}"><span class="ca-fav" style="background:${color}">${fav}</span><div><b>${name}</b><small>${sub}</small></div>${right}</div>`;
}

function toList(el: Element | Element[] | NodeListOf<Element>): HTMLElement[] {
  if (Array.isArray(el)) return el as HTMLElement[];
  if (el instanceof Element) return [el as HTMLElement];
  return Array.from(el) as HTMLElement[];
}

function last(v: unknown) {
  return Array.isArray(v) ? v[v.length - 1] : v;
}

function applyFinal(el: Element | Element[] | NodeListOf<Element>, kf: Keyframes) {
  for (const e of toList(el)) {
    let t = "";
    if ("x" in kf) t += `translateX(${last(kf.x)}px) `;
    if ("y" in kf) t += `translateY(${last(kf.y)}px) `;
    if ("scale" in kf) t += `scale(${last(kf.scale)}) `;
    if ("rotate" in kf) t += `rotate(${last(kf.rotate)}deg)`;
    if (t) e.style.transform = t;
    if ("opacity" in kf) e.style.opacity = String(last(kf.opacity));
    if ("filter" in kf) e.style.filter = String(last(kf.filter));
    if ("width" in kf) e.style.width = String(last(kf.width));
    if ("height" in kf) e.style.height = String(last(kf.height));
  }
}

function startScene(root: HTMLElement): () => void {
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const $ = (name: string) => root.querySelector(`[data-r="${name}"]`) as HTMLElement;
  const list = $("flist");
  const txt = $("phtxt");
  const phst = $("phst");
  const url = $("weburl");
  const kb = $("kb");
  let run = 0;
  let fast = false;
  let cur = 0;
  let visible = false;
  let barAnim: { stop: () => void; pause: () => void } | null = null;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  // Motion's types are stricter than the keyframe bags this script builds.
  const A = (el: unknown, kf: Keyframes, opt?: Opts) =>
    (animate as unknown as (e: unknown, k: Keyframes, o?: Opts) => Promise<void> & { stop: () => void; pause: () => void })(
      el,
      kf,
      opt
    );

  function an(el: Element | Element[] | NodeListOf<Element>, kf: Keyframes, opt?: Opts): Promise<unknown> {
    if (fast || reduce) {
      applyFinal(el, kf);
      return Promise.resolve();
    }
    return A(el, kf, opt);
  }

  function wait(ms: number, id: number): Promise<void> {
    if (fast) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        timers.delete(t);
        if (id !== run) reject(CANCEL);
        else resolve();
      }, ms);
      timers.add(t);
    });
  }

  function addMsg(html: string, who: "me" | "ag", wide = false) {
    const m = document.createElement("div");
    m.className = `ca-msg ca-${who}${wide ? " ca-wide" : ""}`;
    m.innerHTML = html;
    list.appendChild(m);
    if (!(fast || reduce)) {
      const h = m.offsetHeight + 8;
      A(list, { y: [h, 0] }, SPRING);
      A(m, { opacity: [0, 1], scale: [0.84, 1], y: [10, 0] }, SPRING);
    }
    return m;
  }

  function morph(m: HTMLElement, html: string) {
    const h0 = m.offsetHeight;
    m.innerHTML = html;
    const d = m.offsetHeight - h0;
    if (!(fast || reduce)) {
      if (d > 0) A(list, { y: [d, 0] }, SPRING);
      A(Array.from(m.children), { opacity: [0, 1], y: [6, 0] }, { duration: 0.35, delay: stagger(0.06) });
    }
  }

  function agentSay(html: string, id: number, ms = 900, wide = false) {
    const m = addMsg('<span class="ca-dots"><i></i><i></i><i></i></span>', "ag");
    phst.textContent = "escribiendo…";
    return wait(ms, id).then(() => {
      if (wide) m.classList.add("ca-wide");
      morph(m, html);
      phst.textContent = "en línea";
      return m;
    });
  }

  const keys: Record<string, HTMLElement> = {};
  for (const k of Array.from(root.querySelectorAll<HTMLElement>(".ca-k"))) {
    if (k.dataset.k) keys[k.dataset.k] = k;
  }

  function flash(k: HTMLElement) {
    k.classList.add("ca-pr");
    const t = setTimeout(() => {
      timers.delete(t);
      k.classList.remove("ca-pr");
    }, 110);
    timers.add(t);
  }

  function press(ch: string) {
    const c = ch.toLowerCase();
    let k: HTMLElement | undefined;
    if (ch === "\n") k = keys.enter;
    else if (ch === " ") k = keys[" "];
    else k = keys[ACCENTS[c] || c] ?? keys.num;
    if (ch !== c && keys.shift) flash(keys.shift);
    if (k) flash(k);
  }

  function userType(text: string, id: number, time: string) {
    let p: Promise<unknown> = Promise.resolve();
    if (!fast) {
      txt.innerHTML = '<span></span><span class="ca-caret"></span>';
      const s = txt.firstChild as HTMLElement;
      for (let i = 0; i < text.length; i++) {
        p = p.then(() => {
          s.textContent = text.slice(0, i + 1);
          press(text[i]);
          return wait(text[i] === " " ? 70 : 42, id);
        });
      }
      p = p
        .then(() => wait(320, id))
        .then(() => {
          press("\n");
          A($("phsend"), { scale: [1, 0.8, 1] }, { duration: 0.32 });
        });
    }
    return p.then(() => {
      txt.innerHTML = '<span class="ca-ph-ph">Escribe un encargo</span>';
      addMsg(`${text}<span class="ca-meta">${time}<b>✓✓</b></span>`, "me");
      return an(kb, { height: [`${kb.offsetHeight}px`, "0px"] }, { duration: 0.45, ease: [0.32, 0.72, 0, 1] });
    });
  }

  const wsEls = Array.from(root.querySelectorAll<HTMLElement>(".ca-ws"));
  let curW = -1;

  function showWeb(i: number, address: string): Promise<unknown> {
    url.textContent = address;
    if (curW === i) return Promise.resolve();
    const out = wsEls[curW];
    const inn = wsEls[i];
    curW = i;
    for (const w of wsEls) {
      if (w !== inn && w !== out) {
        w.classList.remove("ca-on");
        w.style.opacity = "0";
      }
    }
    inn.classList.add("ca-on");
    const items = Array.from(inn.querySelectorAll<HTMLElement>(".ca-wi"));
    if (fast || reduce) {
      if (out) {
        out.classList.remove("ca-on");
        out.style.opacity = "0";
      }
      inn.style.opacity = "1";
      inn.style.transform = "none";
      inn.style.filter = "none";
      for (const x of items) {
        x.style.opacity = "1";
        x.style.transform = "none";
      }
      return Promise.resolve();
    }
    if (out) {
      A(out, { opacity: 0, y: -10, filter: ["blur(0px)", "blur(6px)"] }, { duration: 0.35 }).then(() => {
        if (wsEls[curW] !== out) out.classList.remove("ca-on");
      });
    }
    for (const x of items) x.style.opacity = "0";
    A(inn, { opacity: [0, 1], y: [14, 0], filter: ["blur(6px)", "blur(0px)"] }, { duration: 0.5, ease: [0.2, 0.8, 0.2, 1] });
    return A(items, { opacity: [0, 1], y: [12, 0] }, {
      delay: stagger(0.09, { startDelay: 0.15 }),
      type: "spring",
      stiffness: 300,
      damping: 28
    });
  }

  function reset() {
    list.innerHTML = HELLO;
    list.style.transform = "none";
    list.style.opacity = "1";
    kb.style.height = "";
    txt.innerHTML = '<span class="ca-ph-ph">Escribe un encargo</span>';
    phst.textContent = "en línea";
    url.textContent = "asistente de IA";
    for (const w of wsEls) {
      w.classList.remove("ca-on");
      w.style.opacity = "0";
    }
    curW = wsEls.length - 1;
    const idle = wsEls[curW];
    idle.classList.add("ca-on");
    idle.style.opacity = "1";
    idle.style.transform = "none";
    idle.style.filter = "none";
    $("stbad").style.opacity = "0";
    $("stok").style.opacity = "0";
    $("cbx").classList.remove("ca-try");
    $("skel").style.opacity = "1";
    $("loaded").style.opacity = "0";
    $("w1a").style.transform = "none";
    for (const p of Array.from(root.querySelectorAll(".ca-pf"))) p.classList.remove("ca-hit");
    $("undc").innerHTML = "";
    $("beam").style.opacity = "0";
    for (const k of ["f1", "f2", "f3"]) $(k).textContent = "";
    $("paybtn").textContent = "Esperando tu permiso";
    $("paybtn").classList.remove("ca-go");
    $("okc").style.transform = "none";
  }

  function setStep(i: number) {
    cur = i;
    const buttons = Array.from(root.querySelectorAll<HTMLElement>(".ca-sc-steps button"));
    buttons.forEach((b, j) => {
      b.classList.toggle("ca-cur", j === i);
      b.classList.toggle("ca-past", j < i);
      if (j === i) b.setAttribute("aria-current", "step");
      else b.removeAttribute("aria-current");
      const bar = b.querySelector<HTMLElement>(".ca-bar i");
      if (bar && j !== i) bar.style.width = j < i ? "100%" : "0%";
    });
    const bi = root.querySelectorAll<HTMLElement>(".ca-sc-steps .ca-bar i")[i];
    if (barAnim) {
      try {
        barAnim.stop();
      } catch {
        // already finished
      }
      barAnim = null;
    }
    if (reduce) bi.style.width = "100%";
    else {
      bi.style.width = "0%";
      barAnim = A(bi, { width: ["0%", "100%"] }, { duration: STEP_SECONDS[i], ease: "linear" });
    }
  }

  function stagRows(m: HTMLElement) {
    return an(Array.from(m.querySelectorAll(".ca-chc-r")), { opacity: [0, 1], x: [-10, 0] }, {
      delay: stagger(0.14, { startDelay: 0.1 }),
      type: "spring",
      stiffness: 320,
      damping: 26
    });
  }

  function setRow(r: Element, ok: boolean, sub: string) {
    (r.querySelector("small") as HTMLElement).textContent = sub;
    const s = r.querySelector(".ca-st-i") as HTMLElement;
    s.className = `ca-st-i ${ok ? "ca-ok" : "ca-bad"}`;
    s.textContent = ok ? "✓" : "✕";
    an(s, { scale: [0.4, 1] }, { type: "spring", stiffness: 600, damping: 16 });
  }

  const steps: Array<(id: number) => Promise<unknown>> = [
    (id) =>
      userType(USER_TEXT, id, CLOCK[0])
        .then(() => wait(450, id))
        .then(() => {
          showWeb(0, "asistente de IA · búsqueda");
          return agentSay(
            '<span class="ca-lead-t">Le pregunto a la IA qué tiendas encajan. Me nombra tres; una no llega a tiempo.</span><div class="ca-chc">' +
              row("R", "#7c3aed", "runnerspot.es", "La IA la recomienda", '<span class="ca-chip ca-c-gray">Sí</span>') +
              row("M", "#0f766e", "Tu tienda", "La IA la recomienda", '<span class="ca-chip ca-c-blue">Sí</span>', "ca-you") +
              row("C", "#94a3b8", "cimasport.es", "Llega en 5 días", '<span class="ca-chip ca-c-gray">No</span>', "ca-dim") +
              "</div>",
            id,
            1300,
            true
          );
        })
        .then((m) => {
          stagRows(m);
          return wait(2900, id);
        }),
    (id) => {
      let m: HTMLElement;
      return agentSay(
        '<span class="ca-lead-t">Entro en las dos para ver precio y stock.</span><div class="ca-chc">' +
          row("R", "#7c3aed", "runnerspot.es", "Entrando…", '<span class="ca-st-i ca-spin"></span>') +
          row("M", "#0f766e", "Tu tienda", "Entrando…", '<span class="ca-st-i ca-spin"></span>', "ca-you") +
          "</div>",
        id,
        800,
        true
      )
        .then((x) => {
          m = x;
          stagRows(m);
          showWeb(1, "runnerspot.es");
          return wait(1000, id);
        })
        .then(() => {
          $("cbx").classList.add("ca-try");
          an($("cbx"), { scale: [1, 0.82, 1] }, { duration: 0.3 });
          return wait(800, id);
        })
        .then(() => {
          an($("stbad"), { opacity: [0, 1], scale: [1.7, 1], rotate: [-12, -4] }, { type: "spring", stiffness: 520, damping: 17 });
          an($("w1a"), { x: [0, -7, 7, -4, 4, 0] }, { duration: 0.45 });
          setRow(m.querySelectorAll(".ca-chc-r")[0], false, "Se para en el anti-bots");
          return wait(1100, id);
        })
        .then(() => {
          url.textContent = "tutienda.es";
          an($("skel"), { opacity: [1, 0] }, { duration: 0.3 });
          an($("loaded"), { opacity: [0, 1], y: [8, 0] }, { duration: 0.45, delay: 0.2 });
          return wait(700, id);
        })
        .then(() => {
          an($("stok"), { opacity: [0, 1], scale: [1.7, 1], rotate: [-12, -4] }, { type: "spring", stiffness: 520, damping: 17 });
          setRow(m.querySelectorAll(".ca-chc-r")[1], true, "Entra sin problema");
          return wait(2000, id);
        });
    },
    (id) => {
      const tags = ["Precio 89 €", "Talla 42 en stock", "Llega el jueves", "Devolución 30 días"];
      const pfs = Array.from(root.querySelectorAll<HTMLElement>(".ca-pf"));
      return showWeb(2, "tutienda.es/cumbre-trail-3")
        .then(() => {
          an($("beam"), { opacity: [0, 1, 1, 0], y: [0, 250] }, { duration: 2.2, ease: "easeInOut" });
          let p: Promise<unknown> = Promise.resolve();
          pfs.forEach((pf, i) => {
            p = p
              .then(() => wait(i ? 420 : 300, id))
              .then(() => {
                pf.classList.add("ca-hit");
                const c = document.createElement("span");
                c.textContent = tags[i];
                $("undc").appendChild(c);
                an(c, { opacity: [0, 1], scale: [0.6, 1] }, { type: "spring", stiffness: 500, damping: 20 });
              });
          });
          return p;
        })
        .then(() =>
          agentSay(
            `<span class="ca-lead-t">Tu ficha lo explica todo, sin adivinar.</span><div class="ca-chc"><div class="ca-chc-p"><span class="ca-img">${SHOE}</span><div><b>Cumbre Trail 3</b><small>89,00 € · talla 42</small><div class="ca-chc-k"><span>En stock</span><span>Jueves</span><span>30 días</span></div></div></div></div>`,
            id,
            900,
            true
          )
        )
        .then((m) => {
          an(Array.from(m.querySelectorAll(".ca-chc-k span")), { opacity: [0, 1], scale: [0.6, 1] }, {
            delay: stagger(0.12, { startDelay: 0.2 }),
            type: "spring",
            stiffness: 500,
            damping: 18
          });
          return wait(2200, id);
        });
    },
    (id) => {
      let m: HTMLElement;
      const typeIn = (name: string, t: string): Promise<unknown> => {
        if (fast) {
          $(name).textContent = t;
          return Promise.resolve();
        }
        let p: Promise<unknown> = Promise.resolve();
        for (let i = 0; i < t.length; i++) {
          p = p.then(() => {
            $(name).textContent = t.slice(0, i + 1);
            return wait(20, id);
          });
        }
        return p;
      };
      return showWeb(3, "tutienda.es/checkout")
        .then(() => typeIn("f1", "A. García"))
        .then(() => typeIn("f2", "C/ Mayor 12, Madrid"))
        .then(() => typeIn("f3", "Tarjeta de un solo uso ···· 4821"))
        .then(() =>
          agentSay(
            '<span class="ca-lead-t">Todo cuadra con tu encargo. ¿La compro?</span><div class="ca-chc"><div class="ca-chc-pay"><div class="ca-line"><span>Cumbre Trail 3 · 42</span><span>89,00 €</span></div><div class="ca-line"><span>Envío</span><span>Gratis</span></div><div class="ca-line ca-tot"><span>Total</span><span>89,00 €</span></div><div class="ca-btns"><span class="ca-bt ca-p">Sí, cómprala</span><span class="ca-bt">Ahora no</span></div></div></div>',
            id,
            900,
            true
          )
        )
        .then((x) => {
          m = x;
          return wait(1700, id);
        })
        .then(() => {
          an(m.querySelector(".ca-bt.ca-p") as HTMLElement, { scale: [1, 0.9, 1.04, 1] }, { duration: 0.4 });
          return wait(450, id);
        })
        .then(() => {
          addMsg(`Sí, cómprala<span class="ca-meta">${CLOCK[2]}<b>✓✓</b></span>`, "me");
          $("paybtn").textContent = "Pagando…";
          $("paybtn").classList.add("ca-go");
          an($("paybtn"), { scale: [0.94, 1] }, { type: "spring", stiffness: 500, damping: 18 });
          return wait(1300, id);
        });
    },
    (id) =>
      showWeb(4, "tutienda.es/pedido")
        .then(() => {
          an($("okc"), { scale: [0, 1] }, { type: "spring", stiffness: 420, damping: 14 });
          an(Array.from(root.querySelectorAll(".ca-okc .ca-rg")), { scale: [1, 2.2], opacity: [0.9, 0] }, {
            duration: 1.2,
            delay: stagger(0.3, { startDelay: 0.15 })
          });
          return agentSay(
            `<div class="ca-chc ca-chc-done"><span class="ca-ck">${CHECK}</span><div><b>Hecho. Pedido confirmado en tu tienda.</b><small>Llega el jueves. Te aviso cuando salga.</small></div></div>`,
            id,
            900,
            true
          );
        })
        .then(() => wait(4300, id))
  ];

  function runFrom(start: number, autoplay: boolean) {
    const id = ++run;
    reset();
    fast = true;
    let p: Promise<unknown> = Promise.resolve();
    for (let i = 0; i < start; i++) p = p.then(() => steps[i](id));
    p = p
      .then(() => {
        fast = reduce;
        setStep(start);
        return steps[start](id);
      })
      .then(() => {
        fast = false;
      });
    if (reduce || !autoplay) {
      p.catch(() => undefined);
      return;
    }
    let k = start;
    const next = (): Promise<unknown> => {
      k++;
      const i = k % 5;
      let q: Promise<unknown> = Promise.resolve();
      if (i === 0) {
        q = an(list, { opacity: [1, 0] }, { duration: 0.45 }).then(() => {
          if (id !== run) throw CANCEL;
          reset();
          const h = kb.offsetHeight;
          kb.style.height = "0px";
          list.style.opacity = "0";
          return Promise.all([
            an(kb, { height: ["0px", `${h}px`] }, { duration: 0.5, ease: [0.32, 0.72, 0, 1] }),
            an(list, { opacity: [0, 1] }, { duration: 0.4, delay: 0.2 })
          ]).then(() => {
            kb.style.height = "";
          });
        });
      }
      return q.then(() => {
        if (id !== run) throw CANCEL;
        setStep(i);
        return steps[i](id);
      }).then(next);
    };
    p.then(next).catch((e) => {
      if (e !== CANCEL) console.error(e);
    });
  }

  function stop() {
    run++;
    if (barAnim) {
      try {
        barAnim.pause();
      } catch {
        // already finished
      }
    }
  }

  const stepsEl = $("steps");
  const onStep = (e: Event) => {
    const b = (e.target as HTMLElement).closest("button");
    if (!b) return;
    runFrom(Number(b.dataset.s), visible);
  };
  stepsEl.addEventListener("click", onStep);

  let observer: IntersectionObserver | null = null;
  if (reduce) {
    runFrom(4, false);
  } else if ("IntersectionObserver" in window) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (en.isIntersecting && !visible) {
            visible = true;
            runFrom(cur, true);
          } else if (!en.isIntersecting && visible) {
            visible = false;
            stop();
          }
        }
      },
      { threshold: 0.35 }
    );
    observer.observe(root);
  } else {
    visible = true;
    runFrom(0, true);
  }

  return () => {
    stop();
    observer?.disconnect();
    stepsEl.removeEventListener("click", onStep);
    for (const t of timers) clearTimeout(t);
    timers.clear();
  };
}

export function AgentScene() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    return startScene(ref.current);
  }, []);

  return (
    <div
      ref={ref}
      className="ca-scene"
      role="group"
      aria-label="Ilustración: un agente de IA recibe un encargo, compara tiendas, lee una ficha de producto y compra con el permiso de su usuario"
      dangerouslySetInnerHTML={{ __html: AGENT_SCENE_MARKUP }}
    />
  );
}
