"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Texto de un prompt plegado: como mucho tres líneas (CSS `.onb2-ptext`) y,
 * cuando el texto REALMENTE no cabe, un botón visible «Ver completo» que abre
 * el editor de ese prompt, donde está el texto íntegro.
 *
 * Existe porque «hasta tres líneas» no equivale a «entero»: un prompt largo
 * superaba el recorte sin ninguna salida a la vista. La detección es de
 * medida, no por número de caracteres: depende del ancho de la fila, que
 * cambia con el viewport.
 */
export function ClampedPromptText({
  text,
  onExpand,
  expandLabel
}: {
  text: string;
  onExpand: () => void;
  /** Nombre accesible del botón, p. ej. «Ver el prompt 3 completo». */
  expandLabel: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [clipped, setClipped] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setClipped(el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text]);

  return (
    <>
      <span ref={ref} className="onb2-ptext">
        {text || "Prompt vacío"}
      </span>
      {clipped ? (
        <button type="button" className="onb2-more" onClick={onExpand} aria-label={expandLabel}>
          Ver completo
        </button>
      ) : null}
    </>
  );
}
