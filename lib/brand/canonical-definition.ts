/**
 * La definición canónica de GenScore, en un solo sitio.
 *
 * **Por qué existe como constante y no como prosa suelta.** El objetivo de la
 * Fase E es que "GenScore" resuelva a nuestra entidad y no a los otros
 * productos que comparten el nombre en sectores distintos (bioinformática,
 * salud mental, evaluación de riesgo entre empresas, alguna entidad local sin
 * relación con ninguno). Para eso los motores necesitan encontrar **la misma descripción
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

/**
 * Identificadores del grafo de entidades (`@id` de schema.org) — SEO-POS-1
 * Fase E, E3.
 *
 * **Por qué hacen falta.** Antes de E3 el sitio emitía dos nodos
 * `Organization` distintos que se llamaban igual: el del layout raíz y el que
 * `/que-es-genscore` incrustaba como `publisher` de su `SoftwareApplication`.
 * Sin `@id` no hay forma de saber que son el mismo, así que la página que
 * existe para desambiguar la marca estaba **creando** una ambigüedad más — la
 * misma clase de ruido que la Fase E entera intenta quitar, sólo que puesta
 * por nosotros y en formato legible por máquina.
 *
 * Con `@id`, `publisher` deja de ser una copia del nodo y pasa a ser una
 * referencia a él: un solo `Organization`, un solo `SoftwareApplication`, y
 * cuantas páginas quieran declararlos sin multiplicarlos.
 *
 * Los identificadores son URIs con fragmento sobre el dominio propio, que es
 * la convención habitual: no son URLs navegables ni tienen que serlo, sólo
 * tienen que ser estables. **Cambiarlos rompe la unión**, así que no se tocan
 * por estética.
 */
export const SITE_ORIGIN = "https://www.genscore.es";
export const ORGANIZATION_ID = `${SITE_ORIGIN}/#organization`;
export const SOFTWARE_APPLICATION_ID = `${SITE_ORIGIN}/#software`;

/**
 * Perfiles externos reales de la marca — SEO-POS-1 Fase A (log §107, §8 del
 * kit off-site).
 *
 * **Sólo perfiles que existen.** Esta lista estuvo vacía a propósito desde
 * GROWTH-2: `sameAs` es una afirmación sobre el mundo, y declarar un perfil que
 * no existe es el mismo dato falso que una métrica inventada, con el agravante
 * de que apunta a un 404 (log §100). Se añade una URL **cuando el perfil ya
 * está publicado**, nunca antes ni "para cuando lo cree".
 *
 * **Para qué sirve.** Es la corroboración externa que el sitio no tenía: un
 * motor que sólo encuentra a una marca hablando de sí misma en su propio
 * dominio tiene poco con lo que resolver la entidad frente a los otros
 * GenScore públicos. Cada perfil real que se añada aquí es la señal más barata
 * que le queda a la Fase E.
 *
 * Pendientes de que el fundador los cree: G2, Capterra, YouTube.
 */
export const BRAND_PROFILES: readonly string[] = ["https://www.linkedin.com/company/genscore/"];
