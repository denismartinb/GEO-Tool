"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Ic } from "@/components/ins/ic";

/** Pila de avisos de la consola (`toast()` del prototipo): como mucho tres, con «Deshacer». */

type ToastItem = { id: number; title: string; sub?: string; icon: string; undo?: () => void; out: boolean };
type ToastApi = (title: string, sub?: string, icon?: string, undo?: () => void) => void;

const ToastCtx = createContext<ToastApi>(() => {});

export function useToast(): ToastApi {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const kill = useCallback((id: number) => {
    setItems((cur) => cur.map((t) => (t.id === id ? { ...t, out: true } : t)));
    setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), 220);
  }, []);

  const toast = useCallback<ToastApi>(
    (title, sub, icon = "checkc", undo) => {
      const id = ++idRef.current;
      setItems((cur) => [...cur, { id, title, sub, icon, undo, out: false }].slice(-3));
      setTimeout(() => kill(id), 5200);
    },
    [kill]
  );

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="ins">
        <div className="toasts" aria-live="polite">
          {items.map((t) => (
            <div key={t.id} className={`toast${t.out ? " out" : ""}`}>
              <Ic n={t.icon} />
              <div className="tx">
                {t.title}
                {t.sub ? <span>{t.sub}</span> : null}
              </div>
              {t.undo ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    t.undo?.();
                    kill(t.id);
                  }}
                >
                  Deshacer
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </ToastCtx.Provider>
  );
}
