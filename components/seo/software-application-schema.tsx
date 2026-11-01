import { PLANS } from "@/app/pricing/plans-data";
import {
  APPLICATION_CATEGORY,
  CANONICAL_DEFINITION_LONG,
  ORGANIZATION_ID,
  SITE_ORIGIN,
  SOFTWARE_APPLICATION_ID
} from "@/lib/brand/canonical-definition";

const STARTER_PRICE = PLANS.find((p) => p.id === "starter")!.price;

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
/**
 * MCP-SITE-FIXES-1 (log §431). On `/precios` the same node declares one Offer
 * per sellable plan with a list price, so an agent reading the pricing page
 * sees what is sold and at what price (agentic audit, «Comprensión»). Prices
 * come from `PLANS`, VAT included, monthly. Agencia has no list price
 * («Plan a medida»), so it is not declared: an invented price is a fake
 * metric. The founder price is a Stripe coupon, not the list price, and is
 * never put here.
 */
export function planOffers() {
  return PLANS.filter((p) => (p.id === "starter" || p.id === "pro") && !p.priceLabel).map((p) => ({
    "@type": "Offer",
    name: `GenScore ${p.name}`,
    url: `${SITE_ORIGIN}/precios`,
    price: String(p.price),
    priceCurrency: "EUR",
    availability: "https://schema.org/InStock",
    priceSpecification: {
      "@type": "UnitPriceSpecification",
      price: String(p.price),
      priceCurrency: "EUR",
      unitCode: "MON",
      billingDuration: 1,
      valueAddedTaxIncluded: true
    }
  }));
}

export function SoftwareApplicationSchema({ withPlanOffers = false }: { withPlanOffers?: boolean } = {}) {
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
    offers: withPlanOffers ? planOffers() : {
      "@type": "Offer",
      price: String(STARTER_PRICE),
      priceCurrency: "EUR",
      description: "Desde el plan Starter, mensual. Todas las cuentas empiezan con 7 días de Pro gratis, sin tarjeta."
    }
  };

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }} />;
}
