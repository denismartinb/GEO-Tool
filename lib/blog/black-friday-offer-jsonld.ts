/**
 * El bloque JSON-LD de ejemplo que `/blog/black-friday-agentes-de-ia` le
 * propone al lector para marcar un precio rebajado: precio activo, precio
 * tachado como `StrikethroughPrice`, fecha de fin de la oferta, stock, envío
 * y devoluciones.
 *
 * Vive aquí, y no escrito dentro del MDX, por la misma razón que
 * `robots-ai-snippet.ts` (log §85): es lo único de la pieza que el lector copia
 * y pega, así que el test tiene que mirar exactamente el texto que se publica.
 * `black-friday-offer-jsonld.test.ts` lo pasa por el mismo lector de la
 * Auditoría agéntica y comprueba que dice lo que el artículo promete.
 */
export const BLACK_FRIDAY_OFFER_JSONLD = `{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Zapatillas de trail Ejemplo 2",
  "sku": "ZT-2-42",
  "gtin13": "8412345678905",
  "offers": {
    "@type": "Offer",
    "price": 69.95,
    "priceCurrency": "EUR",
    "priceValidUntil": "2026-11-30",
    "priceSpecification": {
      "@type": "UnitPriceSpecification",
      "priceType": "https://schema.org/StrikethroughPrice",
      "price": 89.95,
      "priceCurrency": "EUR"
    },
    "availability": "https://schema.org/InStock",
    "shippingDetails": {
      "@type": "OfferShippingDetails",
      "shippingRate": { "@type": "MonetaryAmount", "value": 0, "currency": "EUR" },
      "shippingDestination": { "@type": "DefinedRegion", "addressCountry": "ES" },
      "deliveryTime": {
        "@type": "ShippingDeliveryTime",
        "handlingTime": {
          "@type": "QuantitativeValue",
          "minValue": 0,
          "maxValue": 1,
          "unitCode": "DAY"
        },
        "transitTime": {
          "@type": "QuantitativeValue",
          "minValue": 1,
          "maxValue": 3,
          "unitCode": "DAY"
        }
      }
    },
    "hasMerchantReturnPolicy": {
      "@type": "MerchantReturnPolicy",
      "applicableCountry": "ES",
      "returnPolicyCategory": "https://schema.org/MerchantReturnFiniteReturnWindow",
      "merchantReturnDays": 30,
      "returnMethod": "https://schema.org/ReturnByMail",
      "returnFees": "https://schema.org/FreeReturn"
    }
  }
}`;
