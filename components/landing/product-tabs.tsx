"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Los mandos de «Cinco pantallas. Todo tu posicionamiento.» (HOME-2026-08
 * Fase B2).
 *
 * **Qué hace y qué no.** Las cinco pantallas son marcado del servidor; esto
 * sólo decide cuál lleva la clase `.on`. No monta ninguna, no las mueve y no
 * guarda nada: el estado es un número del 0 al 4.
 *
 * **Los mandos los pinta esta isla, no el servidor.** Sin JS no hay pestañas
 * —y por tanto no hay controles muertos—, y la pantalla que el servidor marcó
 * `.on` se ve entera. Misma decisión que en `RulesCarousel`, y por el mismo
 * motivo: un botón que existe y no responde es peor que un botón que no está.
 * El hueco lo reserva el CSS para que hidratar no mueva la página.
 *
 * **Una pastilla que se desplaza, y ninguna flecha.** El artboard móvil pone
 * dos flechas flotando sobre el marco (`.carrflecha`, `top:50%`), y así se
 * implementó primero. El fundador lo retiró el 2026-08-23 tras verlo: a esa
 * altura las flechas caen encima del contenido —tapaban el `21%` de un
 * competidor y mordían el titular de una recomendación— y el mando ya existe
 * dos dedos más arriba. La pastilla oscura pasa a ser un solo elemento que se
 * desliza entre pestañas, que es lo que enseña que la tira es un mando; el
 * borde derecho difuminado dice que hay más pestañas a la derecha, que era la
 * otra mitad del trabajo de las flechas.
 */

export type ProductTab = { id: string; label: string };

/** Geometría de la pestaña activa, medida del DOM. */
type Pastilla = { x: number; y: number; w: number; h: number };

export function ProductTabs({
  tabs,
  children
}: {
  tabs: readonly ProductTab[];
  /** El marco con las pantallas. Va DENTRO de esta isla, y no al lado, porque
      comparte con la tira el mismo estado. El marcado sigue siendo del
      servidor — se pasa como `children` y esta isla no lo re-renderiza. */
  children: React.ReactNode;
}) {
  const [indice, setIndice] = useState(0);
  const [presentes, setPresentes] = useState<readonly ProductTab[]>([]);
  const [pastilla, setPastilla] = useState<Pastilla | null>(null);
  const [borde, setBorde] = useState({ iz: false, de: false });
  const tiraRef = useRef<HTMLDivElement | null>(null);
  const botonesRef = useRef<(HTMLButtonElement | null)[]>([]);

  /**
   * SÓLO SE PINTA LA PESTAÑA QUE TIENE PANTALLA. La tira no puede adelantarse
   * a las pantallas: una pestaña sin su panel abre un marco vacío, que es un
   * control roto con aspecto de sección terminada. Se comprueba contra el DOM
   * en vez de confiar en que la lista y el marcado estén sincronizados, así
   * que mientras se añaden pantallas la tira crece sola y nunca miente.
   */
  useEffect(() => {
    setPresentes(tabs.filter((t) => document.getElementById(t.id)));
  }, [tabs]);

  // La clase `.on` vive en el DOM del servidor; aquí sólo se mueve.
  useEffect(() => {
    if (presentes.length === 0) return;
    const activo = presentes[Math.min(indice, presentes.length - 1)];
    for (const t of tabs) {
      document.getElementById(t.id)?.classList.toggle("on", t.id === activo.id);
    }
  }, [indice, presentes, tabs]);

  /**
   * La pastilla se mide, no se calcula: las pestañas son texto y su ancho
   * depende de la fuente que acabe cargando. Va en `useLayoutEffect` para que
   * el primer fotograma ya la tenga colocada — con `useEffect` se vería
   * saltar desde la esquina en la primera pintura. Mientras no haya medida, el
   * CSS deja el fondo oscuro en la propia pestaña, así que no hay ningún
   * instante con la pestaña activa en blanco sobre blanco.
   */
  const medir = useCallback(() => {
    const b = botonesRef.current[indice];
    if (!b) return;
    setPastilla({ x: b.offsetLeft, y: b.offsetTop, w: b.offsetWidth, h: b.offsetHeight });
  }, [indice]);

  useLayoutEffect(() => {
    medir();
  }, [medir, presentes]);

  // Al cambiar de anchura cambian el alto de la pestaña (40 → 44px) y el
  // reparto de la tira, así que la medida caduca.
  useEffect(() => {
    if (typeof ResizeObserver !== "function") return;
    const tira = tiraRef.current;
    if (!tira) return;
    const ro = new ResizeObserver(() => medir());
    ro.observe(tira);
    return () => ro.disconnect();
  }, [medir]);

  // En móvil la tira se desplaza para que la pestaña activa quede a la vista:
  // con cinco y una pantalla de 375px, las dos últimas nacen fuera del encuadre.
  useEffect(() => {
    const tira = tiraRef.current;
    const activa = botonesRef.current[indice];
    if (!tira || !activa) return;
    const izq = activa.offsetLeft - (tira.clientWidth - activa.clientWidth) / 2;
    tira.scrollTo({ left: Math.max(0, izq), behavior: "smooth" });
  }, [indice, presentes]);

  /**
   * El difuminado de los bordes es lo que queda del trabajo de las flechas:
   * decir que hay más pestañas fuera del encuadre. Se apaga en el extremo que
   * ya está al final, porque un borde difuminado donde no hay nada más es una
   * promesa falsa. El `mask-image` se aplica a la caja visible, no al
   * contenido, así que no se desplaza con el scroll.
   */
  useEffect(() => {
    const tira = tiraRef.current;
    if (!tira) return;
    const mirar = () => {
      const max = tira.scrollWidth - tira.clientWidth;
      setBorde({ iz: tira.scrollLeft > 4, de: max > 4 && tira.scrollLeft < max - 4 });
    };
    mirar();
    tira.addEventListener("scroll", mirar, { passive: true });
    window.addEventListener("resize", mirar);
    return () => {
      tira.removeEventListener("scroll", mirar);
      window.removeEventListener("resize", mirar);
    };
  }, [presentes, indice]);

  // Con una sola pantalla no hay nada que elegir, y una tira de una pestaña es
  // ruido: se pinta el marco sin mandos.
  if (presentes.length < 2) return <div className="lp-prod-viewport">{children}</div>;

  return (
    <>
      <div
        className={`lp-prod-tabs ${pastilla ? "con-pastilla" : ""} ${borde.iz ? "mas-iz" : ""} ${borde.de ? "mas-de" : ""}`}
        ref={tiraRef}
        role="tablist"
        aria-label="Pantallas del producto"
      >
        {pastilla ? (
          <span
            className="lp-prod-pastilla"
            aria-hidden="true"
            style={{
              transform: `translate(${pastilla.x}px, ${pastilla.y}px)`,
              width: `${pastilla.w}px`,
              height: `${pastilla.h}px`
            }}
          />
        ) : null}
        {presentes.map((t, n) => (
          <button
            type="button"
            key={t.id}
            ref={(el) => {
              botonesRef.current[n] = el;
            }}
            className={`lp-prod-tab ${n === indice ? "on" : ""}`}
            onClick={() => setIndice(n)}
            role="tab"
            aria-selected={n === indice}
            aria-controls={t.id}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="lp-prod-viewport">{children}</div>
    </>
  );
}
