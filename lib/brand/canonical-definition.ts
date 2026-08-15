/**
 * La definición canónica de GenScore, en un solo sitio.
 *
 * **Por qué existe como constante y no como prosa suelta.** El objetivo de la
 * Fase E es que "GenScore" resuelva a nuestra entidad y no a los otros
 * GenScore públicos (bioinformática, salud mental, trust scoring B2B, Genscore
 * Navarra). Para eso los motores necesitan encontrar **la misma descripción
 * estable** en varios sitios —la página de entidad, el schema de la home,
 * `llms.txt`— y no seis redacciones distintas que se parecen. Una cadena
 * compartida es lo único que garantiza eso; seis párrafos escritos a mano
 * divergen al primer refresco.
 *
 * **Los motores que nombra son los que el producto ejecuta.** El consejo
 * externo que originó esta fase proponía una definición con cinco motores
 * —añadía Perplexity y AI Overviews— y eso habría metido el mismo reclamo
 * falso que PRICING-TRUTH-1 obligó a retirar del producto, multiplicado por
 * todas las superficies donde esta frase se repite. `naming.test.ts` cubre la
 * grafía; `canonical-definition.test.ts` cubre que no aparezca un motor que no
 * ejecutamos.
 */

/** Los motores que GenScore ejecuta hoy (docs/launch-plan.md Fase 8). */
export const SUPPORTED_ENGINES = ["ChatGPT", "Gemini", "Claude"] as const;

/**
 * Una frase. Es la que va en el `description` del schema, en la metadata de la
 * página de entidad y en la apertura de esa misma página. Si cambia, cambia en
 * los tres sitios a la vez porque los tres la importan.
 */
export const CANONICAL_DEFINITION =
  "GenScore es una plataforma de Generative Engine Optimization (GEO) que mide y mejora la visibilidad de una marca en las respuestas de ChatGPT, Gemini y Claude.";

/**
 * Versión larga, para cuando hay sitio: añade qué hace después de medir, que
 * es lo que nos separa del resto de la categoría.
 */
export const CANONICAL_DEFINITION_LONG =
  "GenScore es una plataforma de Generative Engine Optimization (GEO) que mide y mejora la visibilidad de una marca en las respuestas de ChatGPT, Gemini y Claude. Lanza los prompts que hacen tus clientes de verdad, mide si el modelo te menciona, en qué posición y si cita tu web, te compara con tus competidores, y genera las acciones concretas para mejorarlo.";

/** Categoría de producto, en los términos de schema.org. */
export const APPLICATION_CATEGORY = "BusinessApplication";
