"use client";

import { useRef, useState } from "react";
import { Ic } from "@/components/ins/ic";
import { prefersReducedMotion } from "./use-media";

/**
 * Slide to confirm (`slideHtml` / `bindSlides` in the prototype). A drag past
 * 86% of the track confirms; Enter or Space on the knob confirms too, so the
 * gesture is never the only way in. Reports once.
 */
export function SlideToConfirm({
  onConfirm,
  label = "Desliza para marcar como hecho",
  disabled = false,
}: {
  onConfirm: () => void;
  label?: string;
  disabled?: boolean;
}) {
  const track = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLButtonElement>(null);
  const fill = useRef<HTMLSpanElement>(null);
  const drag = useRef<{ x: number; dx: number } | null>(null);
  const [state, setState] = useState<"idle" | "back" | "nudge" | "ok">("idle");

  const max = () =>
    (track.current?.clientWidth ?? 0) - (knob.current?.offsetWidth ?? 0) - 8;

  function confirm() {
    if (state === "ok" || disabled) return;
    setState("ok");
    window.setTimeout(onConfirm, prefersReducedMotion() ? 0 : 260);
  }

  function release() {
    const s = drag.current;
    if (!s) return;
    drag.current = null;
    const k = knob.current;
    const f = fill.current;
    if (!k || !f) return;
    if (s.dx >= max() * 0.86) {
      k.style.transform = `translateX(${max()}px)`;
      f.style.width = "100%";
      confirm();
      return;
    }
    setState("back");
    k.style.transform = "";
    f.style.width = "";
    if (s.dx < 4) {
      window.requestAnimationFrame(() => setState("nudge"));
    }
  }

  return (
    <div
      ref={track}
      className={`slide${state === "ok" ? " ok" : state === "back" ? " back" : state === "nudge" ? " nudge" : ""}`}
    >
      <span className="fill" ref={fill} />
      <span className="lab">
        <span className={state === "ok" ? undefined : "shimmer"}>
          {state === "ok" ? "Hecha" : label}
        </span>
      </span>
      <button
        type="button"
        ref={knob}
        className="knob"
        aria-label="Marcar como hecho"
        disabled={disabled}
        onPointerDown={(e) => {
          if (disabled || state === "ok") return;
          drag.current = { x: e.clientX, dx: 0 };
          e.currentTarget.setPointerCapture(e.pointerId);
          setState("idle");
          e.stopPropagation();
        }}
        onPointerMove={(e) => {
          const s = drag.current;
          if (!s || !knob.current || !fill.current) return;
          s.dx = Math.max(0, Math.min(max(), e.clientX - s.x));
          knob.current.style.transform = `translateX(${s.dx}px)`;
          fill.current.style.width = `${s.dx + 56}px`;
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onClick={(e) => {
          if (e.detail === 0) confirm();
        }}
      >
        <Ic n="arrowr" />
      </button>
    </div>
  );
}
