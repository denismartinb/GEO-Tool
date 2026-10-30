"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Ic } from "@/components/ins/ic";

/*
 * CONSOLE-INSTRUMENTO-1 F1: capa de popovers, diálogos y hojas inferiores
 * (`overlays.js` del prototipo v51). En móvil el popover es una hoja inferior.
 * Esc cierra, el foco vuelve al disparador y un cambio de ruta lo cierra.
 */

type PopOpts = { w?: number; align?: "start" | "end"; label?: string; onClose?: () => void };
type DlgOpts = { label?: string; narrow?: boolean; onClose?: () => void };

type Layer =
  | { kind: "pop"; id: number; anchor: HTMLElement; node: ReactNode; opts: PopOpts }
  | { kind: "dlg"; id: number; node: ReactNode; opts: DlgOpts; ret: HTMLElement | null };

type LayerApi = {
  pop: (anchor: HTMLElement, node: ReactNode, opts?: PopOpts) => void;
  dlg: (node: ReactNode, opts?: DlgOpts) => void;
  close: () => void;
};

const LayerCtx = createContext<LayerApi | null>(null);

export function useLayer(): LayerApi {
  const ctx = useContext(LayerCtx);
  if (!ctx) throw new Error("useLayer debe usarse dentro de <InsLayerProvider>");
  return ctx;
}

function useMobile() {
  const [mob, setMob] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width:760px)");
    const sync = () => setMob(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return mob;
}

export function InsLayerProvider({ children }: { children: ReactNode }) {
  const [layer, setLayer] = useState<Layer | null>(null);
  const [on, setOn] = useState(false);
  const idRef = useRef(0);
  const retRef = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();

  const layerRef = useRef<Layer | null>(null);
  layerRef.current = layer;

  const close = useCallback(() => {
    layerRef.current?.opts.onClose?.();
    setOn(false);
    const reduce = window.matchMedia("(prefers-reduced-motion:reduce)").matches;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setLayer(null), reduce ? 0 : 200);
    const r = retRef.current;
    retRef.current = null;
    r?.focus?.({ preventScroll: true });
  }, []);

  const mount = useCallback((next: Layer, ret: HTMLElement | null) => {
    if (timer.current) clearTimeout(timer.current);
    retRef.current = ret;
    setOn(false);
    setLayer(next);
    requestAnimationFrame(() => requestAnimationFrame(() => setOn(true)));
  }, []);

  const pop = useCallback<LayerApi["pop"]>(
    (anchor, node, opts = {}) => mount({ kind: "pop", id: ++idRef.current, anchor, node, opts }, anchor),
    [mount]
  );
  const dlg = useCallback<LayerApi["dlg"]>(
    (node, opts = {}) => {
      const ret = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      mount({ kind: "dlg", id: ++idRef.current, node, opts, ret }, ret);
    },
    [mount]
  );

  useEffect(() => {
    if (!layer) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [layer, close]);

  // Un cambio de ruta cierra lo que esté abierto.
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current !== pathname) {
      lastPath.current = pathname;
      setOn(false);
      setLayer(null);
      retRef.current = null;
    }
  }, [pathname]);

  return (
    <LayerCtx.Provider value={{ pop, dlg, close }}>
      {children}
      {layer && typeof document !== "undefined"
        ? createPortal(
            <div className="ins">
              <div id="xo-layer">
                <LayerView layer={layer} on={on} close={close} />
              </div>
            </div>,
            document.body
          )
        : null}
    </LayerCtx.Provider>
  );
}

function LayerView({ layer, on, close }: { layer: Layer; on: boolean; close: () => void }) {
  const mob = useMobile();
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (layer.kind !== "pop" || mob) return;
    const a = layer.anchor.getBoundingClientRect();
    const w = Math.min(layer.opts.w ?? 340, window.innerWidth - 24);
    const raw = (layer.opts.align ?? "end") === "end" ? a.right - w : a.left;
    const left = Math.max(12, Math.min(raw, window.innerWidth - w - 12));
    let top = a.bottom + 8;
    const h = boxRef.current?.offsetHeight ?? 0;
    if (top + h > window.innerHeight - 12) top = Math.max(12, a.top - h - 8);
    setPos({ left, top, width: w });
  }, [layer, mob]);

  useEffect(() => {
    const t = setTimeout(() => boxRef.current?.focus({ preventScroll: true }), 40);
    return () => clearTimeout(t);
  }, [layer.id]);

  const label = (layer.kind === "pop" ? layer.opts.label : layer.opts.label) ?? "Menú";

  if (layer.kind === "pop" && !mob) {
    return (
      <div className={`xo-w${on ? " on" : ""}`}>
        <div className="xo-click" onClick={close} />
        <div
          ref={boxRef}
          tabIndex={-1}
          className="xo-box xo-pop"
          role="dialog"
          aria-label={label}
          style={pos ? { left: pos.left, top: pos.top, width: pos.width } : { left: 0, top: 0, width: layer.opts.w ?? 340, visibility: "hidden" }}
        >
          {layer.node}
        </div>
      </div>
    );
  }
  if (layer.kind === "pop") {
    return (
      <div className={`xo-w${on ? " on" : ""}`}>
        <div className="xo-scrim" onClick={close} />
        <div ref={boxRef} tabIndex={-1} className="xo-box xo-sheet" role="dialog" aria-modal="true" aria-label={label}>
          <span className="xo-grab" aria-hidden="true" />
          {layer.node}
        </div>
      </div>
    );
  }
  return (
    <div className={`xo-w${on ? " on" : ""}`}>
      <div className="xo-scrim" onClick={close} />
      <div
        ref={boxRef}
        tabIndex={-1}
        className={`xo-box xo-dlg${layer.opts.narrow ? " xo-narrow" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {layer.node}
      </div>
    </div>
  );
}

/** Botón de cierre de los diálogos (`xoX`). */
export function XoClose({ label = "Cerrar" }: { label?: string }) {
  const { close } = useLayer();
  return (
    <button type="button" className="xo-x" onClick={close} aria-label={label}>
      <Ic n="x" />
    </button>
  );
}
