"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

import { ProductTour } from "@/components/product-tour";
import { markTourSeen } from "@/app/dashboard/actions";

/**
 * ONBOARDING-TOUR-1 — el tour como popup de la consola.
 *
 * Dos maneras de que aparezca, ambas pedidas por el fundador:
 *   1. solo, la primera vez que alguien entra en la consola;
 *   2. a demanda, desde «¿Qué es el GEO?» del menú lateral.
 *
 * El «ya lo he visto» vive en `profiles.onboarding_tour_seen_at`
 * (ONBOARDING-TOUR-PERSIST-1, 2026-08-25) y llega como prop leída
 * server-side en `app/dashboard/layout.tsx` — antes vivía en `localStorage`
 * y reaparecía en cualquier navegador nuevo, que era justo la queja que
 * motivó el cambio.
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

export function TourProvider({
  children,
  hasSeenTour
}: {
  children: ReactNode;
  /** Leído server-side en `app/dashboard/layout.tsx`, único punto de montaje. */
  hasSeenTour: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  // La marca de «visto» se escribe AL MOSTRARLO, no al cerrarlo. Escribirla al
  // cerrar convertía «salta en el primer acceso» en «salta en cada carga hasta
  // que lo cierres»: quien miraba el popup y pinchaba en el menú, o recargaba,
  // se lo volvía a encontrar encima, indefinidamente. Lo encontró el `ux-pilot`
  // el 2026-08-07 — nunca cierra nada, así que se topó con el popup tapando
  // Páginas citadas y la campana en las tres anchuras (ver log §40).
  //
  // El coste asumido: si alguien recarga en el primer segundo y se lo pierde,
  // ya no vuelve solo. Para eso está «¿Qué es el GEO?» en el menú lateral, que
  // es justo la puerta de vuelta que el fundador pidió.
  //
  // Y no se abre en `/dashboard`, que es una ruta puente: su página no pinta
  // nada, sólo redirige al proyecto más reciente. Abrir ahí gastaba el tour sin
  // que nadie lo viera — el popup se montaba, escribía la marca, y la redirección
  // se lo llevaba por delante. Como el primer login aterriza justo en
  // `/dashboard`, el efecto era que **el tour no salía nunca** en el momento
  // para el que se hizo. Lo cazó el `ux-pilot` el 2026-08-07: veía el popup en
  // Prompts, Competidores o Páginas citadas, y jamás en Visión general.
  const pathname = usePathname();

  // El efecto sólo debe disparar una vez por montaje del provider — sin esta
  // guarda, una navegación a `/dashboard` y de vuelta reevaluaría la
  // condición con `hasSeenTour` todavía en su valor inicial (el layout no se
  // remonta entre rutas del dashboard) y podría reabrirlo.
  const hasCheckedRef = useRef(false);

  useEffect(() => {
    if (pathname === "/dashboard") return;
    if (hasCheckedRef.current) return;
    hasCheckedRef.current = true;
    if (hasSeenTour) return;
    setIsOpen(true);
    startTransition(() => {
      markTourSeen();
    });
  }, [pathname, hasSeenTour]);

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
