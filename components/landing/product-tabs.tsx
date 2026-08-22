"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Los mandos de «Cinco pantallas. Todo tu posicionamiento.» (HOME-2026-08
 * Fase B2).
 *
 * **Qué hace y qué no.** Las cinco pantallas son marcado del servidor; esto
 * sólo decide cuál lleva la clase `.on`. No monta ninguna, no las mueve y no
 * guarda nada: el estado es un número del 0 al 4.
 *
 * **Los mandos los pinta esta isla, no el servidor.** Sin JS no hay pestañas
 * ni flechas —y por tanto no hay controles muertos—, y la pantalla que el
 * servidor marcó `.on` se ve entera. Misma decisión que en `RulesCarousel`, y
 * por el mismo motivo: un botón que existe y no responde es peor que un botón
 * que no está. El hueco lo reserva el CSS para que hidratar no mueva la
 * página.
 *
 * **La tira de pestañas y las flechas son el mismo estado en dos formas.** En
 * escritorio el diseño pone las cinco pestañas centradas; en móvil, una tira
 * que se desplaza más dos flechas sobre el marco. Las dos mandan sobre el
 * mismo índice, así que cambiar de anchura no pierde la pantalla elegida.
 *
 * **La flecha de «siguiente» late hasta el primer uso**, como la del carrusel
 * de «El cambio de reglas» y la del tour: existe para conseguir ese primer
 * gesto y no se apaga sola hasta que llega (`.claude/rules/onboarding.md`).
 */

export type ProductTab = { id: string; label: string };

export function ProductTabs({
  tabs,
  panel,
  children
}: {
  tabs: readonly ProductTab[];
  panel: string;
  /** El marco con las pantallas. Va DENTRO de esta isla, y no al lado, porque
      las flechas del móvil se posicionan contra él: centradas en el envoltorio
      común caían sobre la tira de pestañas. El marcado sigue siendo del
      servidor — se pasa como `children` y esta isla no lo re-renderiza. */
  children: React.ReactNode;
}) {
  const [indice, setIndice] = useState(0);
  const [tocado, setTocado] = useState(false);
  const [presentes, setPresentes] = useState<readonly ProductTab[]>([]);
  const tiraRef = useRef<HTMLDivElement | null>(null);

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

  // En móvil la tira se desplaza para que la pestaña activa quede a la vista:
  // con cinco y una pantalla de 375px, las dos últimas nacen fuera del encuadre.
  useEffect(() => {
    const tira = tiraRef.current;
    if (!tira) return;
    const activa = tira.children[indice] as HTMLElement | undefined;
    if (!activa) return;
    const izq = activa.offsetLeft - (tira.clientWidth - activa.clientWidth) / 2;
    tira.scrollTo({ left: Math.max(0, izq), behavior: "smooth" });
  }, [indice, presentes]);

  const ir = useCallback(
    (n: number) => {
      setTocado(true);
      setIndice(Math.min(presentes.length - 1, Math.max(0, n)));
    },
    [presentes.length]
  );

  // Con una sola pantalla no hay nada que elegir, y una tira de una pestaña es
  // ruido: se pinta el marco sin mandos.
  if (presentes.length < 2) return <div className="lp-prod-viewport">{children}</div>;

  return (
    <>
      <div className="lp-prod-tabs" ref={tiraRef} role="tablist" aria-label="Pantallas del producto">
        {presentes.map((t, n) => (
          <button
            type="button"
            key={t.id}
            className={`lp-prod-tab ${n === indice ? "on" : ""}`}
            onClick={() => ir(n)}
            role="tab"
            aria-selected={n === indice}
            aria-controls={t.id}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="lp-prod-viewport">
        {children}
        <div className="lp-prod-arrows" aria-hidden="true">
          <button
          type="button"
          className={`lp-prod-arrow iz ${indice <= 0 ? "oculta" : ""}`}
          onClick={() => ir(indice - 1)}
          disabled={indice <= 0}
          tabIndex={-1}
          aria-label="Pantalla anterior"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <button
          type="button"
          className={`lp-prod-arrow de ${indice >= presentes.length - 1 ? "oculta" : ""} ${tocado ? "" : "late"}`}
          onClick={() => ir(indice + 1)}
          disabled={indice >= presentes.length - 1}
          tabIndex={-1}
          aria-label="Pantalla siguiente"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
          </button>
        </div>
      </div>
    </>
  );
}
