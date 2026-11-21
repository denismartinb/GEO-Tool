"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Ic } from "@/components/ins/ic";
import { Motion } from "@/components/ins/kit/motion";

/**
 * Side sheet (`pshOpen` in the prototype): a right panel on desktop and a
 * bottom sheet on mobile, one at a time. Rendered into `document.body` under
 * its own `.ins`, so no ancestor's transform can trap its `position: fixed`.
 * Esc and the scrim close it, Tab stays inside it and focus goes back to the
 * trigger. Shared by Prompts, Competidores and Páginas citadas.
 */
export function Sheet({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const [on, setOn] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const ret = useRef<HTMLElement | null>(null);

  useEffect(() => {
    ret.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.classList.add("psh-on");
    const raf = window.requestAnimationFrame(() => setOn(true));
    const t = window.setTimeout(() => {
      const el = panel.current;
      (el?.querySelector<HTMLElement>("[data-autofocus]") ?? el?.querySelector<HTMLElement>(".psh-x"))?.focus();
    }, 40);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t);
      document.body.classList.remove("psh-on");
      ret.current?.focus?.({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const focusable = Array.from(
        panel.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]),input:not([disabled]),textarea:not([disabled]),a[href]",
        ),
      ).filter((x) => x.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="ins">
      <div
        className={`psh-scrim${on ? " on" : ""}`}
        style={{ display: "block" }}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        ref={panel}
        className={`psh${on ? " on" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        <Motion id={`sheet:${label}`}>{children}</Motion>
      </aside>
    </div>,
    document.body,
  );
}

/** Head of a sheet: kicker and extra actions on the top line, then the title. */
export function SheetHead({
  title,
  kicker,
  extra,
  onClose,
}: {
  title: ReactNode;
  kicker?: ReactNode;
  extra?: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="psh-h">
      <div className="psh-top">
        {kicker}
        <span style={{ flex: 1 }} />
        {extra}
        <button type="button" className="navb psh-x" aria-label="Cerrar" onClick={onClose}>
          <Ic n="x" />
        </button>
      </div>
      <h2>{title}</h2>
    </div>
  );
}
