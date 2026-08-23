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
 * a esa anchura, el cursor no se pinta en vez de apuntar al vacío.
 */

const ESCENAS = [
  { id: "hx-sc-0", label: "La respuesta", apunta: "hx-foco", clic: false },
  { id: "hx-sc-1", label: "Tu puntuación", apunta: null, clic: false },
  { id: "hx-sc-2", label: "Competidores", apunta: null, clic: false },
  { id: "hx-sc-3", label: "La solución", apunta: "hx-generar", clic: true },
  { id: "hx-sc-4", label: "El resultado", apunta: null, clic: false }
] as const;

const PASO_MS = 4600;

export function HeroDemo({ target }: { target: string }) {
  const [escena, setEscena] = useState(0);
  const [auto, setAuto] = useState(true);
  const [montada, setMontada] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number; clic: boolean } | null>(null);
  const reloj = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => setMontada(true), []);

  // La clase `on` vive en el marcado del servidor; aquí sólo se mueve.
  useEffect(() => {
    ESCENAS.forEach((e, n) => {
      document.getElementById(e.id)?.classList.toggle("on", n === escena);
    });
  }, [escena]);

  // Arranca al verse y para al salir; se detiene sola en la última.
  useEffect(() => {
    if (!auto) return;
    const caja = document.querySelector<HTMLElement>(target);
    const parar = () => {
      if (reloj.current) clearInterval(reloj.current);
      reloj.current = null;
    };
    const arrancar = () => {
      if (reloj.current) return;
      reloj.current = setInterval(() => {
        setEscena((n) => {
          if (n >= ESCENAS.length - 1) {
            parar();
            return n;
          }
          return n + 1;
        });
      }, PASO_MS);
    };

    const quieto =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Sin movimiento no hay reproducción automática: la escena 0 se queda
    // puesta y el raíl es la única forma de avanzar. No es una degradación,
    // es el contrato — igual que en el tour.
    if (quieto) return;

    if (!caja || typeof IntersectionObserver !== "function") {
      arrancar();
      return parar;
    }
    const ojo = new IntersectionObserver(
      (entradas) => entradas.forEach((e) => (e.isIntersecting ? arrancar() : parar())),
      { threshold: 0.35 }
    );
    ojo.observe(caja);
    return () => {
      ojo.disconnect();
      parar();
    };
  }, [auto, target]);

  // El cursor se mide contra la caja en cada cambio de escena, y se vuelve a
  // medir al cambiar de tamaño: sus coordenadas son las del elemento real.
  useEffect(() => {
    const colocar = () => {
      const spec = ESCENAS[escena];
      const caja = document.querySelector<HTMLElement>(target);
      const meta = spec.apunta ? document.getElementById(spec.apunta) : null;
      if (!caja || !meta) return setCursor(null);
      const c = caja.getBoundingClientRect();
      const m = meta.getBoundingClientRect();
      // Un elemento oculto a esta anchura mide 0×0: apuntar ahí sería señalar
      // la esquina superior izquierda de la nada.
      if (m.width === 0 || m.height === 0) return setCursor(null);
      setCursor({
        x: Math.round(m.left - c.left + m.width / 2),
        y: Math.round(m.top - c.top + m.height / 2),
        clic: spec.clic
      });
    };
    // Un fotograma de margen: la escena entrante se anima al entrar y su caja
    // aún no está donde va a estar.
    const t = setTimeout(colocar, 60);
    window.addEventListener("resize", colocar);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", colocar);
    };
  }, [escena, target]);

  const ir = useCallback((n: number) => {
    setAuto(false);
    setEscena(n);
  }, []);

  // Sin JS no hay raíl y no hay cursor: la escena 0 se lee sola.
  if (!montada) return null;

  return (
    <>
      {cursor ? (
        <span
          className={`lp-hx-cur ${cursor.clic ? "clic" : ""}`}
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
