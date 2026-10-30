"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Ic } from "@/components/ins/ic";
import { useLayer } from "@/components/ins/layer";
import { AffiliateDialog, DemoDialog } from "@/components/ins/menus";
import { useShellData } from "@/components/ins/shell-context";
import { useTour } from "@/components/tour-provider";
import { INS_NAV_FLAT, navHref } from "@/lib/ins/nav";

/* Barra de comandos ⌘K / Ctrl+K (`cmdk` del prototipo v51). */

type Cmd = { group: string; label: string; icon: string; run: () => void };

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const CmdCtx = createContext<{ open: () => void }>({ open: () => {} });
export function useCommandPalette() {
  return useContext(CmdCtx);
}

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false);
  const [on, setOn] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const d = useShellData();
  const { dlg } = useLayer();
  const { open: openTour } = useTour();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setQ("");
    setSel(0);
    setShown(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setOn(true)));
    setTimeout(() => inputRef.current?.focus(), 20);
  }, []);

  const close = useCallback(() => {
    setOn(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setShown(false), 200);
  }, []);

  const cmds = useMemo<Cmd[]>(() => {
    const list: Cmd[] = [];
    const pid = d.project?.id;
    if (pid) {
      for (const n of INS_NAV_FLAT) {
        list.push({ group: "Pantallas", label: n.label, icon: n.icon, run: () => router.push(navHref(pid, n)) });
      }
      list.push({ group: "Acciones", label: "Descargar informe", icon: "download", run: () => window.open(`/informe/${pid}`, "_blank", "noopener") });
    }
    // ANDROID-TWA-1: en la app no hay cambio de plan ni afiliados (log §381).
    list.push(
      { group: "Cuenta", label: "Tu perfil", icon: "c-user", run: () => router.push("/dashboard/settings") },
      ...(d.inApp ? [] : [{ group: "Cuenta", label: "Cambiar de plan", icon: "c-card", run: () => router.push("/dashboard/settings?openPlan=pro#plan") }]),
      { group: "Cuenta", label: "Ver el tour", icon: "c-rocket", run: () => openTour() },
      { group: "Cuenta", label: "Hablar con nosotros", icon: "c-video", run: () => dlg(<DemoDialog />, { label: "Hablar con nosotros", narrow: true }) },
      ...(d.inApp ? [] : [{ group: "Cuenta", label: "Programa de afiliados", icon: "c-hand", run: () => dlg(<AffiliateDialog />, { label: "Programa de afiliados", narrow: true }) }]),
      { group: "Cuenta", label: "Añadir dominio", icon: "plus", run: () => router.push("/dashboard/projects/new") }
    );
    return list;
  }, [d.project?.id, router, openTour, dlg]);

  const list = useMemo(() => {
    const f = fold(q.trim());
    return cmds.filter((c) => fold(c.label).includes(f));
  }, [cmds, q]);
  const cur = Math.min(sel, Math.max(0, list.length - 1));

  const run = useCallback(
    (i: number) => {
      const c = list[i];
      if (!c) return;
      close();
      setTimeout(c.run, 60);
    },
    [list, close]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (shown) close();
        else open();
      } else if (e.key === "Escape" && shown) {
        close();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shown, open, close]);

  let lastGroup = "";
  return (
    <CmdCtx.Provider value={{ open }}>
      {children}
      {shown ? (
        <div className="ins">
          <div className={`scrim${on ? " on" : ""}`} onClick={close} />
          <div className={`cmdk${on ? " on" : ""}`} role="dialog" aria-modal="true" aria-label="Barra de comandos">
            <div className="q">
              <Ic n="search" className="" />
              <input
                ref={inputRef}
                value={q}
                placeholder="Busca una pantalla o una acción"
                autoComplete="off"
                role="combobox"
                aria-controls="clist"
                aria-expanded="true"
                aria-activedescendant={list.length ? `co${cur}` : undefined}
                onChange={(e) => {
                  setQ(e.target.value);
                  setSel(0);
                }}
                onKeyDown={(e) => {
                  const n = Math.max(1, list.length);
                  if (e.key === "ArrowDown") {
                    setSel((cur + 1) % n);
                    e.preventDefault();
                  } else if (e.key === "ArrowUp") {
                    setSel((cur - 1 + n) % n);
                    e.preventDefault();
                  } else if (e.key === "Enter") run(cur);
                }}
              />
              <kbd>Esc</kbd>
            </div>
            <div className="list" id="clist" role="listbox">
              {list.length === 0 ? (
                <div className="empty">Nada con «{q}».</div>
              ) : (
                list.map((c, i) => {
                  const head = c.group !== lastGroup;
                  lastGroup = c.group;
                  return (
                    <div key={`${c.group}-${c.label}`} style={{ display: "contents" }}>
                      {head ? <div className="g">{c.group}</div> : null}
                      <button type="button" className="it" role="option" id={`co${i}`} aria-selected={i === cur} onClick={() => run(i)}>
                        <Ic n={c.icon} />
                        {c.label}
                        {i === cur ? <span className="k">↵</span> : null}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}
    </CmdCtx.Provider>
  );
}
