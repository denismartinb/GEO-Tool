"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/icon";

/**
 * El botón «Generar solución» de la maqueta de Recomendaciones, y la espera
 * que lo hace creíble (HOME-2026-08 Fase B2, segunda pasada).
 *
 * **Por qué existe.** Hasta ahora los «botones» de las cinco pantallas iban
 * como `span` porque no llevaban acción, y un `<button>` sin `onClick` es un
 * control muerto. Éste sí la lleva: el fundador pidió el 2026-08-23 que
 * «Generar solución» gire un momento y luego aparezca la solución, que es
 * justo el gesto que distingue al producto de un panel que sólo mide. Los
 * demás botones de la maqueta siguen siendo `span`.
 *
 * **Lo que enseña es cierto, y lo que no puede prometer no lo promete.** No
 * llama a ningún motor: revela un artefacto que ya estaba en el marcado del
 * servidor. La espera es de un segundo y **no dice cuánto tarda el producto de
 * verdad** —ahí una generación real tarda lo que tarde—; es el ritmo de una
 * maqueta, no una medición (CLAUDE.md, «no fake metrics»).
 *
 * **Sin JavaScript la solución se sirve VISIBLE y no hay botón.** El estado
 * oculto lo enciende esta isla con `is-armed`, nunca el CSS a secas: si el
 * ocultamiento viviera en la hoja de estilos, quien no ejecute JS se quedaría
 * sin la mitad de la pantalla y sin forma de pedirla (log §144, el mismo fallo
 * que dejó la sección oscura en blanco).
 *
 * **El estado vive fuera de React porque hay DOS botones.** El de escritorio y
 * el del móvil son marcados distintos —el artboard móvil simplifica la
 * pantalla, no la reflowa— y sólo uno se ve a cada anchura. Con un `useState`
 * por isla, generar en escritorio y estrechar la ventana enseñaba la solución
 * ya revelada **con su botón todavía intacto encima**. Un `store` de módulo lo
 * evita sin depender de que nadie cambie de tamaño.
 *
 * **Una vez generada, no se puede volver atrás.** Un botón de «deshacer» en
 * una maqueta es ruido, y repetir la espera cada vez que alguien vuelve a la
 * pestaña convertiría la demostración en un peaje.
 */

const ESPERA_MS = 1000;

type Estado = "listo" | "generando" | "hecho";

/** Un estado por contenedor, compartido por las islas que lo apuntan. */
const estados = new Map<string, Estado>();
const oyentes = new Map<string, Set<() => void>>();

function leer(target: string): Estado {
  return estados.get(target) ?? "listo";
}

function escribir(target: string, estado: Estado) {
  estados.set(target, estado);
  for (const avisar of oyentes.get(target) ?? []) avisar();
}

function suscribir(target: string, avisar: () => void) {
  const set = oyentes.get(target) ?? new Set();
  set.add(avisar);
  oyentes.set(target, set);
  return () => set.delete(avisar);
}

export function SolutionDemo({
  target,
  label = "Generar solución"
}: {
  /** Selector del contenedor que lleva las clases de estado. */
  target: string;
  label?: string;
}) {
  const estado = useSyncExternalStore(
    (avisar) => suscribir(target, avisar),
    () => leer(target),
    // En el servidor esta isla no se pinta, pero `useSyncExternalStore` exige
    // el tercer argumento y devolver algo distinto rompería la hidratación.
    () => "listo" as Estado
  );
  const [montada, setMontada] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  // `is-armed` es lo que permite al CSS esconder la solución. Se pone al
  // montar, así que sin JS nunca llega y la solución se ve entera.
  useEffect(() => {
    const caja = document.querySelector<HTMLElement>(target);
    if (!caja) return;
    caja.classList.add("is-armed");
    setMontada(true);
  }, [target]);

  useEffect(() => {
    const caja = document.querySelector<HTMLElement>(target);
    if (!caja) return;
    caja.classList.toggle("is-generando", estado === "generando");
    caja.classList.toggle("is-hecho", estado === "hecho");
  }, [target, estado]);

  useEffect(() => {
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    };
  }, []);

  const generar = useCallback(() => {
    if (leer(target) !== "listo") return;
    escribir(target, "generando");
    temporizador.current = setTimeout(() => escribir(target, "hecho"), ESPERA_MS);
  }, [target]);

  if (!montada) return null;

  return (
    <>
      <span className="lp-prod-aviso" role="status">
        {estado === "hecho" ? "Solución generada, lista para publicar." : ""}
      </span>
      {estado === "hecho" ? null : (
        <button
          type="button"
          className="lp-prod-btn primario lp-prod-genbtn"
          onClick={generar}
          disabled={estado === "generando"}
        >
          {estado === "generando" ? (
            <>
              <span className="lp-prod-spinner" aria-hidden="true" />
              Generando…
            </>
          ) : (
            <>
              <Icon name="sparkles" size={15} />
              {label}
            </>
          )}
        </button>
      )}
    </>
  );
}
