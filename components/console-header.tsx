"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

/**
 * La cabecera de la consola (HEADER-FLAT-1, 2026-08-15).
 *
 * Es plana —sin fondo ni borde— mientras la pantalla está arriba del todo, y
 * se materializa en cristal translúcido al desplazar. Es el tratamiento que la
 * portada pública ya tenía y que el fundador pidió llevar a la consola
 * ("en la pública la cabecera es plana, fundiéndose más con la página").
 *
 * **Por qué hace falta detectar el scroll, que no es lo que parece.** La
 * cabecera NO solapa el contenido: es hermana de `.dash-content`, que es quien
 * scrollea (`.shell` es `overflow:hidden` a `100dvh`). Así que nada pasa nunca
 * por debajo de ella y la legibilidad no está en juego — a diferencia de una
 * cabecera fija sobre el documento. Lo que sí pasa es que, sin borde, el
 * contenido que sube se recorta contra un canto invisible y parece cortado.
 * El fondo al desplazar existe para dar ese canto, no para tapar nada.
 *
 * El listener va sobre `.dash-content` y no sobre `window` por lo mismo: la
 * ventana no scrollea en la consola, así que `window.scrollY` sería siempre 0.
 */
export function ConsoleHeader({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const scroller = document.querySelector<HTMLElement>(".dash-content");
    if (!scroller) return;

    const sync = () => setScrolled(scroller.scrollTop > 2);
    // Al cambiar de pantalla el scroll vuelve arriba sin emitir evento, así que
    // se sincroniza también en cada navegación y no sólo al montar.
    sync();

    scroller.addEventListener("scroll", sync, { passive: true });
    return () => scroller.removeEventListener("scroll", sync);
  }, [pathname]);

  return <header className={scrolled ? "dash-header is-scrolled" : "dash-header"}>{children}</header>;
}
