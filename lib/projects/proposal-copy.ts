/**
 * ONBOARDING-PROPOSALS-1 (log §237) — el texto con el que el asistente
 * presenta lo que PROPONE. Vive aparte para poder vigilar con un test que no
 * promete lo que el producto no sabe.
 *
 * Lo que el asistente puede afirmar de una propuesta es lo que el código sabe:
 * que la hizo un modelo, a partir de qué criterio, y si una fuente consultada
 * es el propio sitio del competidor. No puede afirmar que sean «los
 * principales» competidores, que las preguntas sean búsquedas reales, ni que
 * haya una demanda medida detrás.
 */

export const COMPETITORS_SUBTITLE =
  "Son propuestas de un modelo de IA a partir de tu web y de una búsqueda, no una lista verificada. Quita o edita las que no encajen y añade las que falten.";

export const COMPETITOR_CHIP_UNVERIFIED = "sin verificar";
export const COMPETITOR_CHIP_SOURCED = "con fuente";

export const COMPETITORS_BASIS_LABEL = "Criterio de la propuesta";

export const COVERAGE_NOTE =
  "Unas 15 preguntas es una recomendación de cobertura para tocar distintos temas, no una garantía estadística: cada escaneo sigue siendo una muestra de respuestas de IA.";

export const PROMPTS_NATURE_NOTE =
  "Son preguntas propuestas por un modelo, no búsquedas reales de usuarios. No hay volumen de demanda medido detrás de ellas.";

export const INTENT_ESTIMATE_NOTE =
  "Intención y marca: clasificación estimada con reglas simples sobre el texto. Puede equivocarse y no se guarda.";

export const MARKET_LANGUAGE_NOTE =
  "País e idioma con los que se lanzarán las preguntas. Si el idioma detectado no es el tuyo, cámbialo aquí.";

export const ALL_PROPOSAL_COPY = [
  COMPETITORS_SUBTITLE,
  COMPETITOR_CHIP_UNVERIFIED,
  COMPETITOR_CHIP_SOURCED,
  COVERAGE_NOTE,
  PROMPTS_NATURE_NOTE,
  INTENT_ESTIMATE_NOTE,
  MARKET_LANGUAGE_NOTE
] as const;
