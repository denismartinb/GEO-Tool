"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Los mandos del carrusel de «El cambio de reglas» (HOME-2026-08 Fase B1).
 *
 * **Por qué existe.** El artboard MÓVIL nunca tuvo las dos tarjetas apiladas:
 * tiene un carrusel de dos diapositivas con sus puntitos y sus flechas, y la de
 * «siguiente» pulsando hasta que se pulsa. La primera implementación las apiló
 * y con eso se perdió lo único que la sección tiene que contar — que se PASA
 * del SEO al GEO, no que existan los dos por separado (fundador, 2026-08-22).
 * El artboard de escritorio sí las pone lado a lado con la flecha en medio, así
 * que el carrusel es sólo del móvil y este componente se apaga por encima de
 * 560px.
 *
 * **Se desliza con el dedo, no sólo con los botones.** El artboard intercambia
 * diapositivas (`display:none` y un fundido); aquí la pista es un contenedor
 * con `scroll-snap`, que es lo que la gente hace de verdad en un teléfono. Se
 * gana además que **sin JS sigue funcionando**: la pista se desliza igual y lo
 * único que falta son los mandos, que es justo lo que este componente pinta.
 * Por eso los mandos los pinta él y no el servidor: un botón que existe pero no
 * responde es peor que un botón que no está.
 *
 * **El hueco lo reserva el CSS, no este componente.** `.lp-rules-navslot` mide
 * lo mismo con mandos y sin ellos, así que la hidratación no mueve la página.
 */

const ANCHO_CARRUSEL = "(max-width: 560px)";

export function RulesCarousel({ track, slide }: { track: string; slide: string }) {
  const [enCarrusel, setEnCarrusel] = useState(false);
  const [total, setTotal] = useState(0);
  const [indice, setIndice] = useState(0);
  const [tocado, setTocado] = useState(false);
  const pistaRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(ANCHO_CARRUSEL);
    const aplicar = () => setEnCarrusel(mq.matches);
    aplicar();
    mq.addEventListener("change", aplicar);
    return () => mq.removeEventListener("change", aplicar);
  }, []);

  useEffect(() => {
    const pista = document.querySelector<HTMLElement>(track);
    if (!pista) return;
    pistaRef.current = pista;

    if (!enCarrusel) {
      // Fuera del carrusel la pista es una rejilla normal y no debe ser una
      // parada de tabulador ni anunciarse como un grupo.
      pista.removeAttribute("tabindex");
      pista.removeAttribute("role");
      pista.removeAttribute("aria-label");
      return;
    }

    // Un contenedor que se desplaza tiene que poder recorrerse con el teclado.
    pista.setAttribute("tabindex", "0");
    pista.setAttribute("role", "group");
    pista.setAttribute("aria-label", "Búsqueda tradicional frente a respuesta generativa");
    // Se cuentan las diapositivas, no los hijos: la flecha del escritorio
    // sigue en el marcado (oculta) y contarla daría un puntito de más.
    setTotal(pista.querySelectorAll(slide).length);

    const alScroll = () => {
      const paso = Math.max(1, pista.clientWidth);
      const n = Math.round(pista.scrollLeft / paso);
      setIndice(n);
      if (n > 0) setTocado(true);
    };
    pista.addEventListener("scroll", alScroll, { passive: true });
    alScroll();
    return () => pista.removeEventListener("scroll", alScroll);
  }, [enCarrusel, track, slide]);

  const ir = useCallback((n: number) => {
    const pista = pistaRef.current;
    if (!pista) return;
    setTocado(true);
    pista.scrollTo({ left: n * pista.clientWidth, behavior: "smooth" });
  }, []);

  if (!enCarrusel || total < 2) return null;

  return (
    <div className="lp-rules-nav">
      <div className="lp-rules-dots" aria-hidden="true">
        {Array.from({ length: total }, (_, n) => (
          <span key={n} className={`lp-rules-dot ${n === indice ? "on" : ""}`} />
        ))}
      </div>
      <div className="lp-rules-arrows">
        <button
          type="button"
          className="lp-rules-navbtn"
          onClick={() => ir(indice - 1)}
          disabled={indice <= 0}
          aria-label="Tarjeta anterior"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <button
          type="button"
          className={`lp-rules-navbtn go ${tocado ? "" : "late"}`}
          onClick={() => ir(indice + 1)}
          disabled={indice >= total - 1}
          aria-label="Tarjeta siguiente"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
