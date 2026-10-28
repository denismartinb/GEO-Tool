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
 *
 * **Superseded por §353 (COMPETITOR-RANK-VISIBILITY-1, 2026-10-28).** Con el
 * rótulo arreglado seguía sin cuadrar: en el proyecto de pruebas del fundador
 * una marca nombrada en el 19% de las respuestas encabezaba la lista por
 * delante de la propia marca, nombrada en el 95% («no tiene sentido», fundador).
 * Además la columna «Puesto medio» pintaba el número de fila (1º, 2º, 3º…), no
 * la media. Desde §353 la lista se ordena por mención y la columna enseña la
 * media real con `formatMeanPosition`.
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
export const MEAN_RANK_LIST_HEADLINE = "Mención y puesto medio de cada marca";
export const MEAN_RANK_TREND_HEADLINE = "Evolución del puesto medio de cada marca";

/**
 * `MEAN_RANK_NOTE` vivió aquí (log §177): la frase que explicaba con un
 * ejemplo por qué una marca nombrada pocas veces puede promediar por delante
 * de otra nombrada en muchas más, pegada a la cifra en las dos pantallas. El
 * fundador la retiró el 2026-09-09 mirando el preview de otro PR — "mal
 * maquetada", pedido explícito de quitarla sin sustituto (log §212). El
 * rótulo "Puesto medio" (arriba) se queda: sigue siendo lo que evita leer la
 * cifra como un ranking. Lo que se retira es sólo la frase larga.
 */

/**
 * La media real del puesto cuando la marca aparece, con un decimal y coma
 * («1,4»). Nunca un ordinal: «2º» se lee como un puesto en la lista, y la
 * lista ya va ordenada por mención (log §353).
 */
export function formatMeanPosition(position: number): string {
  return position.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
