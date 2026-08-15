import { SITE_ORIGIN } from "./canonical-definition";

/**
 * El GEO Score, declarado una sola vez — SEO-POS-1 Fase E, E4.
 *
 * **El problema que resuelve.** El sitio explica el GEO Score en **tres URLs
 * distintas**, todas publicadas y todas indexables:
 *
 *   - `/docs/metodologia/geo-score` — qué mira, qué pasa cuando algo no se
 *     puede medir, por qué el número no salta entre escaneos;
 *   - `/glosario/geo-score` — la definición corta del término;
 *   - `/blog/que-es-el-geo-score` — la guía para quien llega buscándolo.
 *
 * No sobra ninguna: sirven a intenciones distintas y el remedio **no** es
 * fusionarlas ni ponerles un `rel=canonical` cruzado, que desindexaría dos
 * páginas que ya reciben tráfico. El problema real es más pequeño y más
 * corregible: ninguna de las tres declaraba ser el documento de referencia, y
 * cada una definía el término con sus propias palabras. Para un motor que
 * intenta resolver "GEO Score" eso son tres conceptos parecidos, no uno con
 * tres documentos — y las señales se reparten entre los tres.
 *
 * **Cómo se arregla, en dos piezas.** Una cadena compartida, para que las tres
 * digan literalmente lo mismo cuando definen; y un `@id` de schema.org común,
 * para que las tres declaren **el mismo nodo** con la misma `url` canónica y
 * las otras dos como `sameAs`. Eso es el equivalente semántico de un canonical
 * sin tirar ninguna URL a la basura.
 *
 * **Por qué la metodología es la canónica y no el glosario.** Ya lo era de
 * hecho: seis artículos del blog y `/docs/informes/overview` mandan ahí al
 * lector cuando quieren decir "el criterio completo está aquí", y es la única
 * de las tres que el producto mantiene al día con el algoritmo real. Declarar
 * canónica a otra sería contradecir el enlazado interno que ya existe, que es
 * la señal más fuerte de las tres.
 *
 * **Lo que este módulo NO hace:** crear una cuarta página. El plan lo dice
 * explícitamente (`docs/seo-positioning-plan.md`, Fase E): el problema no es
 * que falte una definición más.
 */

/** La ruta del documento de referencia. Las otras dos apuntan aquí. */
export const GEO_SCORE_CANONICAL_PATH = "/docs/metodologia/geo-score";
export const GEO_SCORE_CANONICAL_URL = `${SITE_ORIGIN}${GEO_SCORE_CANONICAL_PATH}`;

/**
 * Las otras dos superficies publicadas que explican el mismo término. Se
 * declaran como `sameAs` del nodo, no como conceptos distintos.
 *
 * **Esta lista es exhaustiva a propósito y hay un test que lo comprueba.** Si
 * una sesión futura publica una cuarta página sobre el GEO Score sin añadirla
 * aquí, vuelve el problema entero: una URL más compitiendo por el mismo
 * término sin declararse parte del mismo concepto.
 */
export const GEO_SCORE_ALTERNATE_PATHS = ["/glosario/geo-score", "/blog/que-es-el-geo-score"] as const;

/**
 * Identificador del término en el grafo de entidades. Las tres superficies
 * emiten `DefinedTerm` con este mismo `@id`, así que un parser las une en un
 * solo nodo en vez de acumular tres definiciones sueltas.
 *
 * Estable por contrato: cambiarlo rompe la unión, igual que `ORGANIZATION_ID`.
 */
export const GEO_SCORE_TERM_ID = `${SITE_ORIGIN}/#geo-score`;

/**
 * La definición corta, compartida. Es la del glosario —donde ya estaba
 * redactada y aprobada— movida aquí para que la importen también el schema de
 * la metodología y la metadata de esa página.
 *
 * No publica el reparto de pesos del compuesto: es configuración del producto
 * y está retirada de todas las superficies desde el 2026-08-13
 * (`.claude/rules/growth-content.md`, "Ni los pesos del compuesto ni los
 * códigos ADR se publican"; log §75). Enumera el ORDEN de las señales, que sí
 * se publica.
 */
export const GEO_SCORE_DEFINITION =
  "La métrica de GenScore (0-100) que resume cómo aparece una marca en respuestas de IA: si la mencionan, con qué protagonismo, cómo sale frente a su competencia, si hay una fuente real detrás y si su web puede ser citada.";
