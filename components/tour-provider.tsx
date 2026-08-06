"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { ProductTour } from "@/components/product-tour";
import { hasSeenTour, markTourSeen } from "@/lib/onboarding/tour-steps";

/**
 * ONBOARDING-TOUR-1 — el tour como popup de la consola.
 *
 * Dos maneras de que aparezca, ambas pedidas por el fundador:
 *   1. solo, la primera vez que alguien entra en la consola;
 *   2. a demanda, desde «¿Qué es el GEO?» del menú lateral.
 *
 * El «ya lo he visto» va en `localStorage` y no en una columna de usuario a
 * propósito: una migración de esquema está prohibida sin aprobación explícita
 * (CLAUDE.md). El coste, declarado y no escondido: el popup reaparece en un
 * navegador nuevo o tras limpiar el almacenamiento. Para un tour descartable
 * de un clic es preferible a tocar el esquema; si algún día molesta, la
 * conversión a columna es una fase con su propio Task Intake.
 */

type TourContextValue = { open: () => void };

const TourContext = createContext<TourContextValue | null>(null);

/**
 * Abre el tour desde cualquier cliente por debajo del provider. Devuelve un
 * `open` inerte si no hay provider, para que un componente compartido con la
 * landing no reviente allí.
 */
export function useTour(): TourContextValue {
  return useContext(TourContext) ?? { open: () => {} };
}

export function TourProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    setIsOpen(false);
    markTourSeen(typeof window === "undefined" ? null : window.localStorage);
  }, []);

  // Primera visita. Se decide en el cliente tras montar, nunca en el render
  // inicial: `localStorage` no existe en el servidor y leerlo durante el
  // render daría una discrepancia de hidratación.
  useEffect(() => {
    if (hasSeenTour(window.localStorage)) return;
    setIsOpen(true);
  }, []);

  // Escape cierra, y mientras está abierto el fondo no hace scroll.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen, close]);

  const value = useMemo(() => ({ open }), [open]);

  return (
    <TourContext.Provider value={value}>
      {children}
      {isOpen && (
        <div
          className="ptour-scrim"
          role="dialog"
          aria-modal="true"
          aria-label="Aprende cómo funciona GenScore"
          // Pinchar fuera cierra; pinchar dentro no debe cerrar, de ahí la
          // comprobación de que el objetivo es el propio scrim.
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <ProductTour variant="modal" onClose={close} />
        </div>
      )}
    </TourContext.Provider>
  );
}
