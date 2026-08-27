/**
 * MEAN-RANK-READS-TRUE-1 (2026-08-27, log §177) — los rótulos del puesto medio,
 * escritos UNA vez.
 *
 * **Por qué existe este fichero.** Dos pantallas publican esta cifra —la
 * «Panorámica competitiva» de Visión general y el «Puesto» de Competidores— y
 * PANORAMA-PARITY-1 (§36) ya tuvo que arreglar que la ORDENARAN distinto.
 * `rankLatestPositions` impide desde entonces que los números diverjan; esto
 * impide que diverjan las palabras. Un rótulo que dice una cosa en una pantalla
 * y otra en la de al lado es el mismo fallo con otra piel.
 *
 * **Qué se arregla aquí.** La columna se llamaba «Puesto» y el titular «Tu
 * puesto cuando apareces», y las dos cosas se leen como una clasificación
 * general. No lo es. `avg_position_when_mentioned` promedia **sólo las
 * respuestas donde la marca sale**, así que en el proyecto Mozilla del fundador
 * Amazon salía 1ª con un 14% de mención y Mozilla 4ª con un 48%:
 *
 * > *"la tabla de puestos no es consistente con el gráfico. Mozilla puesto 4"*
 * > — fundador, 2026-08-27
 *
 * Los dos números eran correctos. Amazon aparece en pocas respuestas y en ésas
 * es la primera (domina el prompt de compra online); Mozilla aparece en muchas
 * más y promedia cuarta entre bastantes marcas. Lo que fallaba era el rótulo,
 * que prometía un ranking.
 *
 * **Y por eso NO se cambia el dato.** Reordenar por tasa de mención convertiría
 * esto en cuota de voz, que ya vive en Competidores etiquetada como tal (§11), y
 * dejaría mintiendo al titular. Subir el suelo de SAMPLE-FLOOR-1 (§175) tampoco
 * sirve: para dejar fuera a Amazon (14%) habría que subirlo tanto que se llevaría
 * por delante a media lista. La decisión aprobada por el fundador fue arreglar
 * cómo se lee, no lo que mide.
 */

/** Cabecera de la columna, en las dos pantallas. */
export const MEAN_RANK_COLUMN_LABEL = "Puesto medio";

/** Titular del bloque en Visión general, donde la cifra es la de TU marca. */
export const MEAN_RANK_BRAND_HEADLINE = "Tu puesto medio cuando apareces";

/**
 * Titular del bloque en Competidores, donde la lista cubre todas las marcas.
 * Dos redacciones porque el bloque cambia de contenido: con historia suficiente
 * pinta una evolución, sin ella sólo la foto del último escaneo.
 */
export const MEAN_RANK_LIST_HEADLINE = "Puesto medio cuando aparece cada marca";
export const MEAN_RANK_TREND_HEADLINE = "Evolución del puesto medio de cada marca";

/**
 * La frase que de verdad arregla el malentendido, y por eso va en las dos
 * pantallas pegada a la cifra.
 *
 * Dice el mecanismo con un ejemplo, no una definición: «media de la posición
 * condicionada a la aparición» es correcto y no lo entiende nadie. El caso que
 * describe es literalmente el de Amazon contra Mozilla.
 */
export const MEAN_RANK_NOTE =
  "Cuenta solo las respuestas donde la marca aparece: una nombrada pocas veces " +
  "pero siempre la primera queda por delante de otra nombrada en muchas más.";
