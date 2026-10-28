"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Ic } from "@/components/ins/ic";

/**
 * Full-screen layer for a deck over any list (`openFocus` in the prototype).
 * Rendered into `document.body` under its own `.ins`, so no ancestor's
 * transform can trap its `position: fixed`. Esc closes; focus returns to the
 * trigger.
 */
export function FocusLayer({
  title,
  onClose,
  step,
  prevDisabled,
  nextDisabled,
  children,
}: {
  title: string;
  onClose: () => void;
  step: (delta: -1 | 1) => void;
  prevDisabled: boolean;
  nextDisabled: boolean;
  children: ReactNode;
}) {
  const [on, setOn] = useState(false);
  const ret = useRef<HTMLElement | null>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    ret.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    document.body.classList.add("fo");
    const raf = window.requestAnimationFrame(() => setOn(true));
    const t = window.setTimeout(() => closeBtn.current?.focus(), 60);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t);
      document.body.classList.remove("fo");
      ret.current?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="ins">
      <div
        className={`focus${on ? " on" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="fh">
          <button
            type="button"
            ref={closeBtn}
            className="navb"
            aria-label="Salir del modo foco"
            onClick={onClose}
          >
            <Ic n="x" />
          </button>
          <div className="tt">
            <span>Modo foco</span>
            <b>{title}</b>
          </div>
          <div className="ctl">
            <button
              type="button"
              className="navb"
              aria-label="Anterior"
              disabled={prevDisabled}
              onClick={() => step(-1)}
            >
              <Ic n="chevl" />
            </button>
            <button
              type="button"
              className="navb"
              aria-label="Siguiente"
              disabled={nextDisabled}
              onClick={() => step(1)}
            >
              <Ic n="chevr" />
            </button>
          </div>
        </div>
        <div className="fb">
          <div>{children}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
