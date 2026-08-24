"use client";

import { useEffect } from "react";

/**
 * Convierte la FAQ de la portada en acordeón por debajo de 560px, que es como
 * la tiene el artboard móvil, y la deja abierta por encima, como la tiene el de
 * escritorio.
 *
 * **Por qué la página se sirve con todo abierto y esto cierra, y no al revés.**
 * Son `<details>` reales, así que sin JavaScript el visitante ve las seis
 * preguntas con sus seis respuestas: largo, pero completo y legible. Servirlas
 * cerradas habría dejado la sección **inservible sin JS** y, peor, habría
 * escondido de la primera pintura el mismo texto que el `FAQPage` afirma —
 * justo lo que este producto audita en las webs de sus clientes.
 *
 * **No hay `role` ni `aria-expanded` que poner.** `<details>`/`<summary>` ya
 * son el acordeón del navegador: teclado, lector de pantalla y buscar-en-la-
 * página funcionan solos, incluso con el contenido plegado. Un acordeón hecho
 * a mano con `div`s habría necesitado los tres y aun así buscaría peor.
 *
 * Sólo se toca el atributo `open`; ni una clase, ni un estilo. El aspecto lo
 * pone el CSS a partir de `[open]`.
 */
export function FaqAccordion({ selector }: { selector: string }) {
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(max-width: 560px)");

    const aplicar = () => {
      const items = Array.from(document.querySelectorAll<HTMLDetailsElement>(selector));
      if (items.length === 0) return;
      if (!mq.matches) {
        // En escritorio la lista va abierta entera: es una lista, no un menú.
        for (const it of items) it.open = true;
        return;
      }
      // En móvil sólo la primera, como el artboard. Se respeta lo que el
      // visitante haya abierto ya: sólo se pliega en el primer paso a móvil.
      if (items.some((it) => it.dataset.plegado === "1")) return;
      items.forEach((it, i) => {
        it.open = i === 0;
        it.dataset.plegado = "1";
      });
    };

    aplicar();
    mq.addEventListener("change", aplicar);
    return () => mq.removeEventListener("change", aplicar);
  }, [selector]);

  return null;
}
