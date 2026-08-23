"use client";

import { Fragment, useCallback, useEffect, useRef } from "react";

/**
 * «Qué cambia, punto por punto»: la tabla SEO ↔ GEO que el artboard abre desde
 * el párrafo de «El cambio de reglas» (HOME-2026-08, la última pieza que
 * faltaba de esa sección).
 *
 * **Sin JavaScript el enlace lleva a `/geo`, no a ninguna parte.** En el
 * marcado del servidor la frase es un enlace normal a la página que explica
 * esto mismo con más sitio; esta isla intercepta el clic y abre la tabla en su
 * lugar. Así no hay ningún control muerto y quien no ejecute JS —o quien abra
 * en pestaña nueva— acaba en contenido de verdad, que es más de lo que da un
 * modal que no se abre.
 *
 * **El `<dialog>` SÍ va en el HTML servido** —React lo pinta como cualquier
 * componente de cliente—, sólo que sin `open` el navegador lo esconde. Es
 * decir: la tabla se sirve, no se indexa como contenido visible, y sin JS no
 * estorba. No hay que confundirlo con «no está».
 *
 * **Es un `<dialog>` nativo con `showModal()`.** Eso trae la trampa de foco,
 * el cierre con `Esc`, el fondo inerte y el `::backdrop` sin escribir ni una
 * línea de gestión de teclado — todo lo que un modal a mano se deja a medias.
 *
 * **La última fila no dice lo que dice el artboard.** Ahí pone «No hay una
 * herramienta de medición unificada», que en la portada de una herramienta de
 * medición unificada es a la vez falso y un tiro en el pie. Lo que sí es
 * cierto, y es el argumento, es que el dato no llega solo: hay que
 * preguntárselo a los motores, prompt a prompt.
 */

type Fila = { seo: string; seoFuerte?: string; geo: string; geoFuerte?: string };

const FILAS: Fila[] = [
  { seo: "Diez enlaces azules.", seoFuerte: "Elige el usuario.", geo: "Una respuesta.", geoFuerte: "La elige el modelo." },
  { seo: "Ganas", seoFuerte: "posición en una lista.", geo: "Ganas", geoFuerte: "menciones y citas." },
  {
    seo: "Optimizas",
    seoFuerte: "palabras clave y enlaces.",
    geo: "Optimizas",
    geoFuerte: "entidades, evidencia y fuentes de terceros."
  },
  {
    seo: "Te lo mide Search Console, y el dato llega solo.",
    geo: "El dato no llega solo:",
    geoFuerte: "hay que preguntárselo a los motores, prompt a prompt."
  }
];

export function RulesModal({ triggerId }: { triggerId: string }) {
  const dialogo = useRef<HTMLDialogElement | null>(null);

  const abrir = useCallback((e: Event) => {
    // Un clic con modificador, o con el botón central, es «ábrelo aparte». Se
    // deja pasar al enlace: quien pide una pestaña nueva quiere `/geo`.
    const m = e as MouseEvent;
    if (m.metaKey || m.ctrlKey || m.shiftKey || m.altKey || m.button !== 0) return;
    if (typeof dialogo.current?.showModal !== "function") return;
    e.preventDefault();
    dialogo.current.showModal();
  }, []);

  useEffect(() => {
    const disparador = document.getElementById(triggerId);
    if (!disparador) return;
    disparador.addEventListener("click", abrir);
    return () => disparador.removeEventListener("click", abrir);
  }, [triggerId, abrir]);

  // Clic en el `::backdrop`. El evento llega con el `<dialog>` como `target`
  // porque el fondo no es un nodo propio, así que se compara contra la caja:
  // fuera de ella es el fondo.
  const alFondo = useCallback((e: React.MouseEvent<HTMLDialogElement>) => {
    const d = dialogo.current;
    if (!d || e.target !== d) return;
    const r = d.getBoundingClientRect();
    const dentro =
      e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!dentro) d.close();
  }, []);

  return (
    <dialog className="lp-modal" ref={dialogo} onClick={alFondo} aria-labelledby="lp-modal-t">
      <div className="lp-modal-box">
        <button
          type="button"
          className="lp-modal-x"
          onClick={() => dialogo.current?.close()}
          aria-label="Cerrar"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <div className="lp-kicker">El cambio de reglas</div>
        <h3 className="lp-modal-h" id="lp-modal-t">Qué cambia, punto por punto</h3>

        <div className="lp-modal-tabla">
          <div className="lp-modal-cab seo">
            <span className="q">SEO tradicional</span>
            <span className="c">desde 1998</span>
          </div>
          <div className="lp-modal-cab geo">
            <span className="q">Posicionamiento GEO</span>
            <span className="c">hoy</span>
          </div>
          {/* Las dos celdas son hijas DIRECTAS de la rejilla, no un envoltorio
              por fila: envueltas, cada par contaría como una sola celda y las
              dos columnas se irían al garete. */}
          {FILAS.map((f) => (
            <Fragment key={f.seo + f.geo}>
              <div className="lp-modal-celda seo">
                {f.seo} {f.seoFuerte ? <b>{f.seoFuerte}</b> : null}
              </div>
              <div className="lp-modal-celda geo">
                {f.geo} {f.geoFuerte ? <b>{f.geoFuerte}</b> : null}
              </div>
            </Fragment>
          ))}
        </div>
      </div>
    </dialog>
  );
}
