/**
 * ONBOARDING-TOUR-1 — la línea de tiempo del tour «Aprende cómo funciona».
 *
 * Vive aparte del componente a propósito: es la única parte del tour que se
 * puede verificar sin un navegador (el resto son escrituras imperativas sobre
 * el DOM a 60 fps). Ver `tour-steps.test.ts`.
 *
 * Referencia de diseño: `docs/design-reference/onboarding-tour-1/`.
 *
 * INVARIANTE: toda la animación se deriva de un único reloj en milisegundos.
 * Nada usa `animation-delay`. Es lo que permite que Atrás/Siguiente salten a
 * cualquier paso y que el tour se pueda congelar en un paso concreto para
 * fotografiarlo — sin eso, el `ux-pilot` captura un fotograma al azar.
 */

export const TOUR_DURATION_MS = 50_000;

export type TourStep = {
  /** 1-indexado, tal y como se numera de cara al usuario. */
  n: number;
  /** Inicio en ms desde el arranque del tour. */
  from: number;
  /** Fin en ms. Coincide con el `from` del siguiente paso. */
  to: number;
  /**
   * El subtítulo que explica lo que se ve en el lienzo. Es la única línea de
   * texto que cambia entre pasos; admite `<b>` y nada más.
   */
  sub: string;
};

export const TOUR_STEPS: readonly TourStep[] = [
  {
    n: 1,
    from: 700,
    to: 5700,
    sub: "Escribe tu dominio y GenScore te propondrá <b>a quién vigilar y qué prompts lanzar</b>. No hay que configurar nada más."
  },
  {
    n: 2,
    from: 5700,
    to: 9000,
    sub: "Todos tus prompts se analizan en <b>Gemini, Claude y ChatGPT</b>. Este análisis reflejará lo que está pasando ahora mismo con tu web, tu marca y la de tu competencia."
  },
  {
    n: 3,
    from: 9000,
    to: 15500,
    sub: "Tu <b>GEO Score</b> mide la capacidad de tu web y tu marca para aparecer de forma optimizada en los motores de IA."
  },
  {
    n: 4,
    from: 15500,
    to: 21000,
    sub: "Tu dominio <b>se escanea continuamente</b> para mostrarte siempre la visión más actualizada de tu web."
  },
  {
    n: 5,
    from: 21000,
    to: 26500,
    sub: "El algoritmo de GenScore encontrará <b>acciones concretas</b> para que puedas mejorar tu posicionamiento rápidamente."
  },
  {
    n: 6,
    from: 26500,
    to: 35500,
    sub: "GenScore se encarga también de <b>generarte una solución</b> a cada problema encontrado, lista para aplicar en tu web."
  },
  {
    n: 7,
    from: 35500,
    to: 41500,
    sub: "Además GenScore <b>auditará técnicamente tu web</b> para que sepas si hay algo que optimizar."
  },
  {
    n: 8,
    from: 41500,
    to: TOUR_DURATION_MS,
    sub: "El siguiente escaneo detectará las mejoras aplicadas y los movimientos de tus competidores. <b>Recalculará tu puntuación</b> y te sugerirá nuevos ajustes para tener el mejor posicionamiento."
  }
] as const;

/** Índice (0-based) del paso que corresponde a un instante del reloj. */
export function stepIndexAt(ms: number): number {
  let idx = 0;
  for (let i = 0; i < TOUR_STEPS.length; i += 1) {
    if (ms >= TOUR_STEPS[i].from) idx = i;
  }
  return idx;
}

/**
 * Margen con el que se detiene la reproducción de un paso: se para justo
 * antes de su final para que el fotograma en el que queda quieto siga
 * perteneciendo a ese paso y no al siguiente.
 */
export const STEP_END_MARGIN_MS = 40;

/** Instante en el que se detiene la reproducción de un paso. */
export function holdTimeFor(index: number): number {
  const step = TOUR_STEPS[Math.max(0, Math.min(TOUR_STEPS.length - 1, index))];
  return Math.max(step.from + 1, step.to - STEP_END_MARGIN_MS);
}

/**
 * Hasta dónde llega la reproducción automática. Sólo el primer paso se
 * reproduce solo; a partir de ahí avanza el usuario con «Siguiente».
 *
 * Es una decisión de producto, no una limitación técnica (fundador,
 * 2026-08-07): encadenados, los ocho pasos no dan tiempo a leer el subtítulo
 * antes de que la pantalla cambie. Un paso por clic convierte el tour en algo
 * que se lee en vez de algo que se mira pasar.
 */
export const AUTOPLAY_THROUGH_STEP_INDEX = 0;

/**
 * Instante en el que congelar un paso para fotografiarlo o para dejarlo
 * quieto tras pulsar un punto del pie. No es su inicio a propósito: congelar
 * en el arranque captura el gauge a cero y las barras vacías, y da una imagen
 * que no representa el paso.
 */
export const FREEZE_OFFSET_MS = 3_400;

export function freezeTimeFor(index: number): number {
  const step = TOUR_STEPS[Math.max(0, Math.min(TOUR_STEPS.length - 1, index))];
  return Math.min(step.from + FREEZE_OFFSET_MS, step.to - 200);
}

// La marca de «ya lo ha visto» ya no vive aquí. Desde ONBOARDING-TOUR-PERSIST-1
// (2026-08-25) es `profiles.onboarding_tour_seen_at`, leída en
// `app/dashboard/layout.tsx` y escrita por la server action `markTourSeen`
// (`app/dashboard/actions.ts`) — ver `.claude/rules/onboarding.md`.
