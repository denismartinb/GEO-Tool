import {
  APPLICATION_CATEGORY,
  CANONICAL_DEFINITION_LONG,
  ORGANIZATION_ID,
  SITE_ORIGIN,
  SOFTWARE_APPLICATION_ID
} from "@/lib/brand/canonical-definition";

/**
 * schema.org `SoftwareApplication` para GenScore — SEO-POS-1 Fase E, E3.
 *
 * **Qué cambia respecto a E2.** En E2 este bloque vivía dentro de
 * `/que-es-genscore` como una función local. Eso dejaba la URL comercial más
 * importante del sitio —la home, la que recibe los enlaces y las búsquedas de
 * marca— declarando sólo `Organization`: una empresa llamada GenScore, sin
 * decir en ninguna parte legible por máquina **qué producto es** ni de qué
 * categoría. La página de entidad lo decía, pero es la que menos autoridad
 * acumula de las dos.
 *
 * **Por qué es un componente compartido y no una copia.** Dos declaraciones a
 * mano del mismo producto divergen al primer cambio de posicionamiento, y el
 * síntoma sería el peor posible: el sitio describiéndose de dos formas
 * distintas justo donde un motor va a leerlo para decidir qué entidad somos.
 * Es el mismo argumento que puso la definición en una constante (E2, log §94),
 * un nivel más arriba.
 *
 * **`@id` y `publisher` por referencia.** El nodo se identifica siempre igual
 * y apunta al `Organization` del layout raíz por su `@id` en vez de incrustar
 * una copia. Montarlo en dos páginas no crea dos productos: crea dos
 * menciones del mismo.
 *
 * **Sin `aggregateRating` ni `review`:** no tenemos reseñas públicas
 * acumuladas, y un rating inventado en schema es exactamente la clase de dato
 * falso que CLAUDE.md prohíbe — con el agravante de que Google penaliza el
 * marcado inventado cuando lo detecta.
 */
export function SoftwareApplicationSchema() {
  const json = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": SOFTWARE_APPLICATION_ID,
    name: "GenScore",
    url: SITE_ORIGIN,
    applicationCategory: APPLICATION_CATEGORY,
    applicationSubCategory: "Generative Engine Optimization",
    operatingSystem: "Web",
    inLanguage: "es",
    description: CANONICAL_DEFINITION_LONG,
    publisher: { "@id": ORGANIZATION_ID },
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "EUR",
      description: "Plan gratuito permanente, sin tarjeta."
    }
  };

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }} />;
}
