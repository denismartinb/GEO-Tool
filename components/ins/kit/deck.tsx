"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import { Ic } from "@/components/ins/ic";
import { MOBILE_QUERY, prefersReducedMotion, useMedia } from "./use-media";

/**
 * Swipe deck (`makeDeck` in the prototype). Desktop: stacked plates with
 * buttons, drag and arrow keys. Mobile: native scroll-snap. The plates are
 * React nodes; the deck only decides their position and height, so a plate can
 * hold anything, including a server-rendered slot.
 */

export type Plate = { id: string; done: boolean; node: ReactNode };

type PlateApi = {
  index: number;
  count: number;
  next: () => void;
  lastLabel: string;
};
const PlateCtx = createContext<PlateApi | null>(null);

/** What a plate needs to draw its «Siguiente» button. Null outside a deck. */
export function useDeckPlate(): PlateApi | null {
  return useContext(PlateCtx);
}

export function NextButton({ className = "" }: { className?: string }) {
  const plate = useDeckPlate();
  if (!plate) return null;
  const last = plate.index === plate.count - 1;
  return (
    <button
      type="button"
      className={`btn ghost dk-next ${className}`.trim()}
      onClick={plate.next}
    >
      {last ? plate.lastLabel : "Siguiente"}
      <Ic n="arrowr" sm />
    </button>
  );
}

export function Deck({
  plates,
  idx,
  onIdx,
  label,
  lastLabel = "Terminar",
  onLast,
  keys = true,
}: {
  plates: Plate[];
  idx: number;
  onIdx: (i: number) => void;
  label: string;
  lastLabel?: string;
  /** «Siguiente» on the last plate. */
  onLast?: () => void;
  /** Arrow keys move this deck (only the topmost deck should listen). */
  keys?: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mobile = useMedia(MOBILE_QUERY);
  const cur = Math.max(0, Math.min(plates.length - 1, idx));
  const lock = useRef(false);

  const go = useCallback(
    (i: number) => {
      onIdx(Math.max(0, Math.min(plates.length - 1, i)));
    },
    [onIdx, plates.length],
  );

  /* Position and height of the stack (desktop) or reset (mobile). */
  const layout = useCallback(() => {
    const root = el.current;
    if (!root) return;
    const cards = Array.from(root.querySelectorAll<HTMLElement>(":scope>.dk"));
    if (!cards.length) return;
    if (mobile) {
      cards.forEach((c) => {
        c.style.height = "";
        c.removeAttribute("data-pos");
        c.removeAttribute("inert");
        c.removeAttribute("aria-hidden");
      });
      root.style.height = "";
      return;
    }
    cards.forEach((c, i) => {
      const p = i - cur;
      c.dataset.pos = p < 0 ? "prev" : p > 2 ? "far" : String(p);
      if (p === 0) {
        c.removeAttribute("inert");
        c.removeAttribute("aria-hidden");
      } else {
        c.setAttribute("inert", "");
        c.setAttribute("aria-hidden", "true");
      }
    });
    const front = cards[cur];
    front.style.height = "";
    const h = front.offsetHeight;
    cards.forEach((c, i) => {
      if (i !== cur) c.style.height = `${h}px`;
    });
    root.style.height = `${h + 30}px`;
  }, [cur, mobile]);

  useLayoutEffect(() => {
    layout();
  }, [layout, plates]);

  useEffect(() => {
    const root = el.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (!lock.current) layout();
    });
    const front = root.querySelectorAll<HTMLElement>(":scope>.dk")[cur];
    if (front) ro.observe(front);
    return () => ro.disconnect();
  }, [cur, layout, plates.length]);

  /* Mobile: a programmatic move scrolls the track; a scroll reports its plate. */
  useEffect(() => {
    const root = el.current;
    if (!root || !mobile) return;
    const c = root.querySelectorAll<HTMLElement>(":scope>.dk")[cur];
    if (!c) return;
    const pl = parseFloat(getComputedStyle(root).paddingLeft) || 0;
    const target = c.offsetLeft - pl;
    if (Math.abs(root.scrollLeft - target) > 4) {
      lock.current = true;
      root.scrollTo({
        left: target,
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
      window.setTimeout(() => (lock.current = false), 400);
    }
  }, [cur, mobile]);

  useEffect(() => {
    const root = el.current;
    if (!root || !mobile) return;
    const onScroll = () => {
      if (lock.current) return;
      const pl = parseFloat(getComputedStyle(root).paddingLeft) || 0;
      let best = 0;
      let bd = Infinity;
      root.querySelectorAll<HTMLElement>(":scope>.dk").forEach((c, i) => {
        const d = Math.abs(c.offsetLeft - pl - root.scrollLeft);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      if (best !== cur) onIdx(best);
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => root.removeEventListener("scroll", onScroll);
  }, [mobile, cur, onIdx]);

  /* Drag the front plate (desktop). */
  useEffect(() => {
    const root = el.current;
    if (!root || mobile) return;
    let st: { x: number; c: HTMLElement; dx: number; cap: boolean } | null =
      null;
    const down = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (
        e.button !== 0 ||
        target.closest("button,a,.slide,input,textarea,select,summary")
      )
        return;
      const c = target.closest<HTMLElement>('.dk[data-pos="0"]');
      if (c) st = { x: e.clientX, c, dx: 0, cap: false };
    };
    const move = (e: PointerEvent) => {
      if (!st) return;
      st.dx = e.clientX - st.x;
      if (Math.abs(st.dx) < 6) return;
      if (!st.cap) {
        st.c.setPointerCapture(e.pointerId);
        st.cap = true;
        st.c.classList.add("drag");
      }
      st.c.style.transform = `translateX(${st.dx}px) rotate(${st.dx / 40}deg)`;
    };
    const end = () => {
      if (!st) return;
      const { c, dx } = st;
      c.classList.remove("drag");
      c.style.transform = "";
      st = null;
      if (dx < -90) go(cur + 1);
      else if (dx > 90) go(cur - 1);
    };
    root.addEventListener("pointerdown", down);
    root.addEventListener("pointermove", move);
    root.addEventListener("pointerup", end);
    root.addEventListener("pointercancel", end);
    return () => {
      root.removeEventListener("pointerdown", down);
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerup", end);
      root.removeEventListener("pointercancel", end);
    };
  }, [mobile, cur, go]);

  useEffect(() => {
    if (!keys) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      if (
        (e.target as HTMLElement | null)?.closest(
          "input,textarea,select,[contenteditable]",
        )
      )
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      go(cur + (e.key === "ArrowRight" ? 1 : -1));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [keys, cur, go]);

  return (
    <div
      className="deck"
      ref={el}
      aria-roledescription="mazo"
      aria-label={label}
    >
      {plates.map((p, i) => (
        <PlateCtx.Provider
          key={p.id}
          value={{
            index: i,
            count: plates.length,
            lastLabel,
            next: () => (i < plates.length - 1 ? go(i + 1) : onLast?.()),
          }}
        >
          <article
            className="dk"
            data-id={p.id}
            aria-label={`${i + 1} de ${plates.length}`}
          >
            {p.node}
          </article>
        </PlateCtx.Provider>
      ))}
    </div>
  );
}

/** Progress ticks under the heading (`progressTicks` in the prototype). */
export function ProgressTicks({
  plates,
  idx,
  onGo,
  labels = true,
}: {
  plates: Array<{ id: string; done: boolean }>;
  idx: number;
  onGo: (i: number) => void;
  labels?: boolean;
}) {
  return (
    <div className="ptk" role="tablist" aria-label="Progreso">
      {plates.map((p, i) => (
        <button
          key={p.id}
          type="button"
          role="tab"
          aria-label={`Paso ${i + 1}`}
          aria-selected={i === idx}
          className={`${i === idx ? "cur" : ""}${p.done ? " done" : ""}`.trim()}
          onClick={() => onGo(i)}
        >
          {labels ? (
            <span className="num">{String(i + 1).padStart(2, "0")}</span>
          ) : null}
          <i />
        </button>
      ))}
      <span className="cnt num">{`${Math.min(idx + 1, plates.length)} / ${plates.length}`}</span>
    </div>
  );
}
