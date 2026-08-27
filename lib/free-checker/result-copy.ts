/**
 * CHECKER-COPY-1 — el aviso de variabilidad, en las dos direcciones.
 *
 * El bloque "Esto es una respuesta, no un veredicto" se renderizaba
 * **incondicionalmente** con un texto escrito para un resultado negativo:
 * *"Con una consulta no se puede decir que no aparezcas — sólo que en ésta no
 * apareciste."* Detrás de un resultado positivo —la marca nombrada, y a veces
 * su propia web citada como fuente— eso contradice al titular tres párrafos más
 * arriba, en el punto exacto donde alguien decide si se registra. Lo encontró
 * la auditoría externa del 2026-08-26 (P0-07) probando `genscore.es`, que
 * aparece.
 *
 * **Las dos variantes dicen lo mismo, no una cosa y su contraria.** La verdad
 * que este aviso defiende es una sola: una consulta no generaliza, en ninguna
 * de las dos direcciones. Lo que cambia es cuál de los dos errores está a mano
 * del lector — tras un "no apareciste", creerse ausente; tras un "apareciste",
 * creerse presente. Escribir sólo la mitad negativa no era prudencia, era medir
 * la modestia por el signo del resultado: exactamente igual de sesgado que
 * escribir sólo la positiva.
 *
 * Vive aquí y no en el componente porque es la única forma de que el caso
 * positivo tenga una prueba. El bug no fue una decisión equivocada, fue una
 * rama que nadie podía ejercitar sin un dominio que apareciese de verdad.
 *
 * Puro, sin I/O y sin JSX, mismo contrato que `lib/free-checker/answer-markdown.ts`.
 */

export type VariabilityNotice = {
  /** Encabezado del bloque. No depende del resultado: el aviso es el mismo. */
  label: string;
  body: string;
};

/** Encabezado compartido: cierto tanto si la marca apareció como si no. */
export const VARIABILITY_LABEL = "Esto es una respuesta, no un veredicto";

export function variabilityNotice(input: {
  engineLabel: string;
  brandMentioned: boolean;
}): VariabilityNotice {
  const { engineLabel, brandMentioned } = input;

  // La primera frase es idéntica en los dos casos a propósito: la causa de la
  // variabilidad —recuperación en vivo, no determinista— no depende de cómo
  // haya salido esta consulta, y repetirla igual deja ver que el aviso no se
  // adapta al resultado para suavizarlo.
  const cause = `La misma pregunta mañana puede dar otras marcas: ${engineLabel} busca en tiempo real y no es determinista.`;

  const claim = brandMentioned
    ? "Con una consulta no se puede decir que aparezcas siempre — sólo que en ésta apareciste."
    : "Con una consulta no se puede decir que no aparezcas — sólo que en ésta no apareciste.";

  const remedy = "Para saberlo de verdad hacen falta varias preguntas repetidas en el tiempo.";

  return { label: VARIABILITY_LABEL, body: `${cause} ${claim} ${remedy}` };
}
