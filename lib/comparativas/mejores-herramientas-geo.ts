/**
 * GROWTH-2 Fase 2.8 (calendar row C3) — datos del pilar
 * /comparativas/mejores-herramientas-geo-en-espanol.
 *
 * Genscore, Otterly y Peec AI reutilizan exactamente los datos ya
 * investigados y publicados en genscore-vs-otterly.ts / genscore-vs-peec-ai.ts
 * — no se reescriben cifras a mano aquí. Profound, Scrunch AI y AthenaHQ son
 * nuevos: investigados por seo-geo-research (2026-08-03), con la misma
 * limitación que Peec AI — sus páginas oficiales de precios devolvieron 403,
 * así que ningún dato viene de fuente primaria de primera mano. Precios
 * tratados como orientativos ("desde aprox."), nunca como cifra cerrada.
 */
export const PILLAR_RESEARCH_DATE = "3 de agosto de 2026";

export type ToolProfile = {
  slug: string;
  name: string;
  url: string;
  oneLiner: string;
  distinctiveFeature: string;
  pricingNote: string;
  spanishSupport: string;
  bestFor: string;
  /** Link to the dedicated head-to-head comparativa, when one exists. */
  comparisonHref?: string;
};

export const TOOLS: ToolProfile[] = [
  {
    slug: "genscore",
    name: "Genscore",
    url: "https://www.genscore.es",
    oneLiner:
      "Mide y mejora cómo aparece tu marca en respuestas de ChatGPT, Gemini y Claude, con plan gratuito permanente.",
    distinctiveFeature:
      "La única de esta lista que no se detiene en el diagnóstico: genera recomendaciones con evidencia y un solucionador que redacta el borrador (FAQ, schema, briefs) desde el plan Pro.",
    pricingNote: "Gratis (escaneo permanente, sin tarjeta); planes de pago desde 45 €/mes.",
    spanishSupport: "Sí, nativo — interfaz y soporte en castellano.",
    bestFor:
      "Equipos hispanohablantes que quieren empezar gratis y que la herramienta no solo señale el problema, sino que proponga la solución."
  },
  {
    slug: "otterly",
    name: "Otterly",
    url: "https://otterly.ai",
    oneLiner: "Monitorización y auditoría GEO con cobertura nominal de hasta 6 motores y seguimiento en más de 50 mercados.",
    distinctiveFeature:
      "Cobertura multi-país más amplia de las tres opciones principales, con usuarios ilimitados ya en su plan de entrada.",
    pricingNote: "Desde 29 $/mes — sin plan gratuito; Gemini y Google AI Mode son add-ons con coste extra.",
    spanishSupport: "No — interfaz en inglés.",
    bestFor:
      "Equipos con presupuesto ajustado que necesitan cobertura amplia de mercados y no les importa pagar add-ons por motor a medida que crecen.",
    comparisonHref: "/comparativas/genscore-vs-otterly"
  },
  {
    slug: "peec-ai",
    name: "Peec AI",
    url: "https://peec.ai",
    oneLiner: "Monitorización GEO con cobertura multi-idioma y multi-país al mismo precio, sin coste adicional por región.",
    distinctiveFeature:
      "Su función \"Actions\" prioriza oportunidades por tipo de contenido, aunque no genera el contenido en sí — la creación queda en tus manos.",
    pricingNote: "Desde ~95 $/mes — cifra pública, confírmala en peec.ai antes de decidir.",
    spanishSupport: "No confirmado — documentación e interfaz observadas en inglés.",
    bestFor:
      "Equipos que ya saben que van a lanzar prompts en varios idiomas o países desde el primer día y quieren ese coste incluido sin sorpresas de add-on.",
    comparisonHref: "/comparativas/genscore-vs-peec-ai"
  },
  {
    slug: "profound",
    name: "Profound",
    url: "https://tryprofound.com",
    oneLiner:
      "Plataforma GEO orientada a marcas enterprise: monitorización, benchmarking de competidores y citas en ChatGPT, Perplexity, Copilot y AI Overviews.",
    distinctiveFeature:
      "Especialización 100% en visibilidad de IA (no es un módulo añadido a una suite de SEO más amplia), con un dashboard dedicado de fuentes de citación.",
    pricingNote:
      "Cifras de agregadores de terceros, no confirmadas en su web oficial (bloqueada al intentar consultarla directamente) — orientativamente desde unos 99 $/mes en el plan self-serve, con niveles enterprise muy por encima. Confírmalo en tryprofound.com.",
    spanishSupport: "No encontrado con confianza — no verificado en fuente primaria.",
    bestFor: "Equipos enterprise que ya operan a la escala que justifica un plan a medida y priorizan el benchmarking competitivo."
  },
  {
    slug: "scrunch-ai",
    name: "Scrunch AI",
    url: "https://scrunch.com",
    oneLiner:
      "\"Agent Experience Platform\": monitoriza y además sirve una versión optimizada de tu web a los rastreadores de IA.",
    distinctiveFeature:
      "Enfoque técnico distinto al resto: reduce el peso de la página que reciben los agentes de IA hasta en un 98%, con un feed en tiempo real de qué agentes visitan el sitio.",
    pricingNote:
      "Cifras de agregadores de terceros, no confirmadas en su web oficial — orientativamente desde unos 250-300 $/mes. Confírmalo en scrunch.com.",
    spanishSupport: "No encontrado.",
    bestFor: "Equipos SaaS/B2B con capacidad técnica que quieren optimizar activamente cómo los agentes de IA rastrean su web, no solo medir el resultado."
  },
  {
    slug: "athenahq",
    name: "AthenaHQ",
    url: "https://athenahq.ai",
    oneLiner: "Plataforma de atribución de ingresos desde visibilidad en IA — intenta cerrar el bucle hasta la venta, no solo hasta la mención.",
    distinctiveFeature:
      "Integra GA4, Search Console y Shopify para atribuir ingresos reales al tráfico generado por menciones en motores de IA — el único enfoque de esta lista centrado en atribución, no solo en medición.",
    pricingNote:
      "Cifras de agregadores de terceros, no confirmadas en su web oficial — orientativamente desde unos 270-295 $/mes por sistema de créditos. Confírmalo en athenahq.ai.",
    spanishSupport: "No encontrado.",
    bestFor: "Equipos que ya tienen tráfico medible desde IA y quieren conectar esa visibilidad directamente con ingresos, no solo con menciones."
  }
];
