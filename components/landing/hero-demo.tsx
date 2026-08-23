"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Los mandos de la demo del hero (HOME-2026-08 Fase A2).
 *
 * **Es lo primero que ve alguien que llega, y por eso el marcado NO es suyo.**
 * Las cinco escenas las sirve el servidor (`HeroDemoScenes`) con la 0 ya
 * puesta: quien llegue con la red a medias, con JS bloqueado o antes de
 * hidratar lee la escena que engancha —ChatGPT recomendando a tus rivales sin
 * nombrarte— entera y quieta. Esta isla sólo mueve la clase `on`, pinta el
 * raíl y mueve el cursor. Misma arquitectura que `ProductTabs`.
 *
 * **Un solo reloj.** Todo el avance sale de un `setInterval` sobre `escena`;
 * dentro de cada escena, las animaciones son CSS con `fill: both`, así que a
 * los ~2,5 s la escena está en un fotograma final estable. Eso es lo que
 * permite al `ux-pilot` fijar una escena, esperar y fotografiar algo
 * determinista — con animaciones encadenadas a mano fotografiaría un fotograma
 * al azar y su veredicto no valdría nada
 * (`.claude/rules/onboarding.md`, «Un solo reloj»).
 *
 * **No se reproduce sola fuera de pantalla, y se para al llegar al final.** Un
 * `IntersectionObserver` arranca el reloj cuando la demo se ve y lo para
 * cuando se va; al llegar a la escena 4 se detiene y no vuelve a empezar. Una
 * animación que nadie mira es CPU y batería a cambio de nada, y un bucle
 * perpetuo en el hero convierte la historia en un salvapantallas.
 *
 * **Tocar el raíl apaga la reproducción automática para siempre.** Quien elige
 * una escena está leyéndola; que se la lleve el reloj cuatro segundos después
 * es exactamente lo que hace que una demo se sienta un anuncio.
 *
 * **El cursor apunta a ELEMENTOS, no a coordenadas** — la lección del tour
 * (`.claude/rules/onboarding.md`). Cada escena declara el `id` al que señala y
 * se resuelve su centro real contra la caja de la demo; si el elemento no está
 * a esa anchura, el cursor vuelve a su reposo en vez de apuntar al vacío.
 */

/**
 * TODAS las escenas apuntan a algo. Al principio sólo lo hacían la 0 y la 3, y
 * el cursor se quedaba quieto tres cambios seguidos: sin movimiento, las
 * escenas se leen como diapositivas y no como una demostración (fundador,
 * 2026-08-23: «es importante que aparezca el cursor y comience a moverse al
 * hacer scroll, si no no parece una animación»).
 */
const ESCENAS = [
  { id: "hx-sc-0", label: "La respuesta", apunta: "hx-foco", clic: false },
  { id: "hx-sc-1", label: "Tu puntuación", apunta: "hx-dial-1", clic: false },
  { id: "hx-sc-2", label: "Competidores", apunta: "hx-fila-tuya", clic: false },
  { id: "hx-sc-3", label: "La solución", apunta: "hx-generar", clic: true },
  { id: "hx-sc-4", label: "El resultado", apunta: "hx-evo", clic: false }
] as const;

const PASO_MS = 4600;

/**
 * Cuánto de la demo tiene que verse para que arranque.
 *
 * Antes era un `threshold: 0.35` a secas y eso, en un móvil donde la demo mide
 * más que media pantalla, se cumple cuando todavía está casi toda por debajo
 * del pliegue: la historia se reproducía sola mientras nadie la miraba y quien
 * llegaba se la encontraba por el final (fundador, 2026-08-23). Se mide contra
 * **lo que puede llegar a verse** —el mínimo entre el alto de la demo y el de
 * la ventana— y no contra la demo entera, porque con un `ratio` alto a secas
 * una demo más alta que la pantalla no arranca jamás
 * (`.claude/rules/onboarding.md`, la misma trampa del tour).
 */
const VISIBLE_MINIMO = 0.7;

/**
 * `activo: false` es el reposo: fuera del marco, abajo a la derecha e
 * invisible. No es «sin cursor» — el elemento existe y está colocado, que es
 * justo lo que permite que su primer cambio de coordenadas se vea como un
 * viaje y no como una aparición.
 */
type Cursor = { x: number; y: number; clic: boolean; activo: boolean };

export function HeroDemo({ target }: { target: string }) {
  const [escena, setEscena] = useState(0);
  const [auto, setAuto] = useState(true);
  const [montada, setMontada] = useState(false);
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [aLaVista, setALaVista] = useState(false);
  const reloj = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => setMontada(true), []);

  /**
   * ¿Se está viendo la demo? Es estado propio y no un detalle del reloj porque
   * lo usan dos cosas: la reproducción automática, que no debe correr mientras
   * nadie mira, y el cursor, que entra desde fuera del marco justo en ese
   * instante — que es lo que hace que al bajar hasta aquí se vea empezar algo.
   */
  useEffect(() => {
    const caja = document.querySelector<HTMLElement>(target);
    if (!caja) return;
    if (typeof IntersectionObserver !== "function") {
      setALaVista(true);
      return;
    }
    const ojo = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          // Contra lo que PUEDE verse, no contra la demo entera: en un móvil
          // la demo mide más que media pantalla y `intersectionRatio` nunca
          // llegaría al umbral.
          const alcanzable = Math.min(e.boundingClientRect.height, window.innerHeight);
          const visible = e.intersectionRect.height;
          setALaVista(alcanzable > 0 && visible / alcanzable >= VISIBLE_MINIMO);
        }
      },
      // Muchos pasos: sin ellos el observador sólo avisa al cruzar 0, y la
      // fracción que nos importa se alcanza sin que salte ningún evento.
      { threshold: Array.from({ length: 21 }, (_, i) => i / 20) }
    );
    ojo.observe(caja);
    return () => ojo.disconnect();
  }, [target]);

  // La clase `on` vive en el marcado del servidor; aquí sólo se mueve.
  useEffect(() => {
    ESCENAS.forEach((e, n) => {
      document.getElementById(e.id)?.classList.toggle("on", n === escena);
    });
  }, [escena]);

  // El reloj sólo corre mientras la demo se ve, y se detiene solo en la última
  // escena. Un bucle perpetuo en el hero convierte la historia en un
  // salvapantallas, y uno fuera de pantalla es batería a cambio de nada.
  // Sin movimiento no hay reproducción automática: la escena 0 se queda
  // puesta y el raíl es la única forma de avanzar. No es una degradación, es
  // el contrato — igual que en el tour. Se lee una vez al montar y vive fuera
  // del efecto porque la barra de avance necesita saberlo también.
  const [quieto, setQuieto] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const leer = () => setQuieto(mq.matches);
    leer();
    mq.addEventListener("change", leer);
    return () => mq.removeEventListener("change", leer);
  }, []);

  useEffect(() => {
    if (!auto || !aLaVista || quieto) return;

    const parar = () => {
      if (reloj.current) clearInterval(reloj.current);
      reloj.current = null;
    };
    reloj.current = setInterval(() => {
      setEscena((n) => {
        if (n >= ESCENAS.length - 1) {
          parar();
          return n;
        }
        return n + 1;
      });
    }, PASO_MS);
    return parar;
  }, [auto, aLaVista, quieto]);

  /**
   * El cursor. Se mide contra la caja en cada cambio de escena y se vuelve a
   * medir al cambiar de tamaño: sus coordenadas son las del elemento real, no
   * unas fijas — la lección del tour.
   *
   * **Mientras la demo no se ve, no se coloca.** Así el primer movimiento que
   * hace es entrar desde su posición de reposo —fuera del marco, abajo a la
   * derecha— hasta lo que señala la escena 0, justo cuando bajas hasta aquí.
   * Aparecer ya puesto era lo que hacía que las escenas se leyeran como
   * diapositivas (fundador, 2026-08-23).
   */
  useEffect(() => {
    const colocar = () => {
      const caja = document.querySelector<HTMLElement>(target);
      if (!caja) return;
      const c = caja.getBoundingClientRect();
      // El reposo se mide contra la caja, igual que los destinos: un par de
      // coordenadas fijas dejaría el cursor dentro del marco en una anchura y
      // a media pantalla de distancia en otra.
      const reposo: Cursor = {
        x: Math.round(c.width - 18),
        y: Math.round(c.height + 26),
        clic: false,
        activo: false
      };
      if (!aLaVista) return setCursor(reposo);
      const spec = ESCENAS[escena];
      const meta = document.getElementById(spec.apunta);
      if (!meta) return setCursor(reposo);
      const m = meta.getBoundingClientRect();
      // Un elemento oculto a esta anchura mide 0×0: apuntar ahí sería señalar
      // la esquina superior izquierda de la nada.
      if (m.width === 0 || m.height === 0) return setCursor(reposo);
      setCursor({
        x: Math.round(m.left - c.left + m.width / 2),
        y: Math.round(m.top - c.top + m.height / 2),
        clic: spec.clic,
        activo: true
      });
    };
    // DOS pasadas, y las dos hacen falta. La primera, a los 160ms, es la que
    // separa el reposo del destino y por tanto lo que se ve como un
    // movimiento; pero a esa altura la escena todavía se está animando y hay
    // dianas que crecen mientras tanto —la tarjeta de evolución gana alto
    // según se dibuja la curva—, así que el cursor se quedaba 14px por debajo
    // de su centro. La segunda, ya con las animaciones asentadas (~2,5s,
    // `.claude/rules/onboarding.md`), lo recoloca sobre lo que de verdad hay.
    const relojes = [setTimeout(colocar, aLaVista ? 160 : 0)];
    if (aLaVista) relojes.push(setTimeout(colocar, 1_400));
    window.addEventListener("resize", colocar);
    return () => {
      relojes.forEach(clearTimeout);
      window.removeEventListener("resize", colocar);
    };
  }, [escena, target, aLaVista]);

  /**
   * ¿Hay de verdad un reloj corriendo ahora mismo? Es la condición exacta del
   * efecto de arriba, y por eso la barra no puede mentir: si esto es falso, no
   * hay siguiente escena que anunciar.
   */
  const corriendo = auto && aLaVista && !quieto && escena < ESCENAS.length - 1;

  const ir = useCallback((n: number) => {
    setAuto(false);
    setEscena(n);
  }, []);

  // Sin JS no hay raíl y no hay cursor: la escena 0 se lee sola.
  if (!montada) return null;

  return (
    <>
      {/* Se pinta en cuanto hay coordenadas —las de reposo, invisible y fuera
          del marco— y no cuando hay destino. Es la diferencia entre verlo
          llegar y encontrárselo ya puesto. Antes de la primera medida no se
          pinta nada: montarlo en 0,0 lo enseñaría un fotograma en la esquina. */}
      {cursor ? (
      <span
        className={`lp-hx-cur ${cursor.activo ? "activo" : ""} ${cursor.clic ? "clic" : ""}`}
        aria-hidden="true"
        style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }}
      >
        <span className="ring" />
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M5 3l14 8.5-6.2 1.2L9.6 19 5 3z"
            fill="#0f1729"
            stroke="#fff"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      ) : null}

      {/* La barra de avance. Sólo existe mientras el reloj CORRE de verdad: si
          la demo está fuera de pantalla, si alguien tocó el raíl o si se llegó
          a la última escena, no hay nada que anunciar y la barra no se pinta.
          Una barra que avanza sin que vaya a pasar nada es progreso falso, que
          es exactamente lo que CLAUDE.md prohíbe en el producto y no hay
          motivo para permitirse en la portada.

          `key={escena}` la remonta en cada cambio: sin eso la animación CSS no
          se reinicia y la segunda escena heredaría la barra ya llena. */}
      {corriendo ? (
        <span className="lp-hx-avance" aria-hidden="true">
          <span className="f" key={escena} style={{ animationDuration: `${PASO_MS}ms` }} />
        </span>
      ) : null}

      <div className="lp-hx-rail" role="tablist" aria-label="Escenas de la demostración">
        {ESCENAS.map((e, n) => (
          <button
            type="button"
            key={e.id}
            className={`lp-hx-step ${n === escena ? "on" : ""}`}
            onClick={() => ir(n)}
            role="tab"
            aria-selected={n === escena}
            aria-controls={e.id}
          >
            <span className="b" aria-hidden="true" />
            {e.label}
          </button>
        ))}
      </div>
    </>
  );
}
