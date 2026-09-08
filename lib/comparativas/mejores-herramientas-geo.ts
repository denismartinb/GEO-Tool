/**
 * GROWTH-2 Fase 2.8 (calendar row C3) — datos del pilar
 * /comparativas/mejores-herramientas-geo-en-espanol.
 *
 * GenScore, Otterly y Peec AI reutilizan exactamente los datos ya
 * investigados y publicados en genscore-vs-otterly.ts / genscore-vs-peec-ai.ts
 * — no se reescriben cifras a mano aquí. Profound, Scrunch AI y AthenaHQ son
 * nuevos: investigados por seo-geo-research (2026-08-03), con la misma
 * limitación que Peec AI — sus páginas oficiales de precios devolvieron 403,
 * así que ningún dato viene de fuente primaria de primera mano. Precios
 * tratados como orientativos ("desde aprox."), nunca como cifra cerrada.
 *
 * TRUST-PROMISES-1 (docs/external-audit-2026-08.md, Fase 2): el precio de
 * GenScore era la única excepción a "no se reescriben cifras a mano aquí" —
 * `pricingNote` llevaba el literal "45 €/mes". Ahora lee `PLANS`, como el
 * resto de comparativas.
 */
import { PLANS } from "@/app/pricing/plans-data";

const STARTER_PRICE = PLANS.find((p) => p.id === "starter")!.price;

export const PILLAR_RESEARCH_DATE = "12 de agosto de 2026";

/**
 * SEO-POS-1 Fase C, S4 (2026-08-12) — refresco del pilar.
 *
 * El plan pedía añadir tres rivales del mercado español: CreceRank,
 * TrendSights y Mentio. La investigación previa dejó dos, no tres:
 *
 * - **CreceRank entra, y es la incorporación importante.** Es la única
 *   competencia directa que reclama explícitamente nuestra misma casilla —
 *   "diseñada desde el día uno para el mercado hispanohablante", prompts en
 *   español, competidores regionales y fuentes en dominios locales. Su
 *   existencia obligó además a corregir una afirmación nuestra que había
 *   dejado de ser cierta: la FAQ de esta página decía "solo GenScore" tiene
 *   interfaz en español (log §68).
 * - **Mentio entra sin cifra de precio.** Las fuentes públicas dan importes
 *   inverosímiles (24 €/año) y además confunden dos productos distintos,
 *   Mentio y GetMentioned. Mismo criterio que Profound: sin fuente fiable, no
 *   se afirma un precio.
 * - **TrendSights NO entra.** No es una herramienta GEO: es monitorización de
 *   medios (TV, radio, prensa, redes, podcasts, streaming) con análisis de
 *   sentimiento e influencers. Mide notoriedad de marca en medios, no
 *   visibilidad en motores generativos. Meterla en un pilar de herramientas
 *   GEO sería un error de categoría que además diluye la página para el
 *   lector que llega buscando exactamente eso.
 */

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
  /**
   * Extra paragraph of real, sourced context — used for the three tools
   * without their own dedicated comparativa (Profound, Scrunch AI,
   * AthenaHQ), whose profile would otherwise be a single sentence.
   */
  context?: string;
};

export const TOOLS: ToolProfile[] = [
  {
    slug: "genscore",
    name: "GenScore",
    url: "https://www.genscore.es",
    oneLiner:
      "Mide y mejora cómo aparece tu marca en respuestas de ChatGPT, Gemini y Claude, con plan gratuito permanente.",
    distinctiveFeature:
      "La única de esta lista que no se detiene en el diagnóstico: genera recomendaciones con evidencia y un solucionador que redacta el borrador (FAQ, schema, briefs) desde el plan Pro.",
    pricingNote: `Gratis (escaneo permanente, sin tarjeta); planes de pago desde ${STARTER_PRICE} €/mes.`,
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
      "Cobertura nominal de hasta 6 motores y seguimiento en más de 50 mercados, con usuarios ilimitados ya en su plan de entrada.",
    pricingNote: "Desde 29 $/mes — sin plan gratuito; Gemini y Google AI Mode son add-ons con coste extra.",
    spanishSupport: "No — interfaz en inglés.",
    bestFor:
      "Equipos con presupuesto ajustado que necesitan cobertura amplia de mercados y no les importa pagar add-ons por motor a medida que crecen.",
    comparisonHref: "/comparativas/genscore-vs-otterly"
  },
  {
    slug: "crecerank",
    name: "CreceRank",
    url: "https://crecerank.com",
    oneLiner:
      "Monitorización de visibilidad en IA construida para el mercado hispanohablante: prompts en español, competidores regionales y fuentes en dominios locales (.es, .mx, .ar, .cl, .co).",
    distinctiveFeature:
      "Es la otra herramienta de esta lista pensada para el mercado en español desde el principio, con foco declarado en LATAM. Cubre ChatGPT, Perplexity y AI Overviews, un conjunto de motores distinto del de GenScore: nosotros ejecutamos Gemini y Claude, que ella no lista, y no ejecutamos Perplexity ni AI Overviews.",
    pricingNote: "Desde unos 29 $/mes según su comunicación pública — sin plan gratuito permanente. Confírmalo en crecerank.com.",
    spanishSupport: "Sí — producto en español, con foco declarado en LATAM.",
    bestFor:
      "Equipos con foco en LATAM que necesiten seguimiento por dominios locales país a país y prioricen la cobertura de Perplexity y AI Overviews sobre la de Gemini y Claude.",
    context:
      "Es la comparación más directa de esta lista para un equipo hispanohablante, así que conviene mirar dos cosas concretas antes de decidir. La primera es el conjunto de motores: la elección real es Perplexity y AI Overviews (CreceRank) frente a Gemini y Claude (GenScore), y depende de dónde pregunten tus clientes, no de cuál suena mejor. La segunda es dónde te deja cada una: CreceRank prioriza accionables en español, y GenScore además redacta el borrador — FAQ, datos estructurados y briefs — desde el plan Pro. Y para probarlo, GenScore es la única de las dos con escaneo gratuito permanente y sin tarjeta."
  },
  {
    slug: "mentio",
    name: "Mentio",
    url: "https://mentio.ai",
    oneLiner:
      "Monitorización de menciones de marca y producto en asistentes de IA (ChatGPT, Claude, Gemini), con análisis de frecuencia y posición dentro de la respuesta.",
    distinctiveFeature:
      "Cubre los mismos tres motores que GenScore, lo que la convierte en la comparación más limpia de esta lista en cuanto a cobertura: la diferencia no está en qué mide, sino en qué haces después con lo medido.",
    pricingNote:
      "Sin cifra fiable. Las fuentes públicas de terceros dan importes inverosímiles y confunden el producto con GetMentioned, que es otra herramienta distinta. Confírmalo en su web antes de comparar.",
    spanishSupport: "No confirmado — documentación observada en inglés.",
    bestFor:
      "Equipos que quieran seguir menciones en los tres motores principales y no necesiten que la herramienta proponga ni redacte la solución.",
    context:
      "Al cubrir ChatGPT, Claude y Gemini —los mismos tres que GenScore— la elección se reduce a lo que pasa después del informe. Mentio se detiene en la medición: cuántas veces te mencionan y en qué posición dentro de la respuesta. GenScore continúa hacia la recomendación con evidencia y el generador de soluciones, y lo hace en castellano. Antes de compararlas por precio, ten en cuenta que el suyo no está publicado de forma fiable en ninguna fuente que hayamos podido verificar."
  },
  {
    slug: "peec-ai",
    name: "Peec AI",
    url: "https://peec.ai",
    oneLiner: "Monitorización GEO con cobertura multi-idioma y multi-país al mismo precio, sin coste adicional por región.",
    distinctiveFeature:
      "Su función \"Actions\" prioriza oportunidades y sugiere qué publicar u optimizar, aunque no genera el contenido en sí — la creación queda en tus manos.",
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
    bestFor: "Equipos enterprise que ya operan a la escala que justifica un plan a medida y priorizan el benchmarking competitivo.",
    context:
      "Su producto central es \"Answer Engine Insights\": un desglose de qué fuentes citan los motores generativos al hablar de tu categoría, cruzado con benchmarking directo contra tus competidores en el mismo panel. Es de las opciones de esta lista más orientada a marcas que ya tienen un equipo dedicado a la categoría, no a quien empieza a medir su visibilidad en IA por primera vez."
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
    bestFor: "Equipos SaaS/B2B con capacidad técnica que quieren optimizar activamente cómo los agentes de IA rastrean su web, no solo medir el resultado.",
    context:
      "Es la única de las seis que no se limita a medir: su \"Agent Experience Platform\" sirve activamente una versión reducida de tu web a los rastreadores de IA, y añade un feed en tiempo real de qué agentes visitan el sitio y con qué intención. Encaja mejor con equipos que ya tienen a alguien capaz de actuar sobre esa señal técnica, no solo de leer un informe."
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
    bestFor: "Equipos que ya tienen tráfico medible desde IA y quieren conectar esa visibilidad directamente con ingresos, no solo con menciones.",
    context:
      "Su \"Athena Citation Engine\" no se detiene en si te citan: predice la probabilidad de cita e integra GA4, Search Console y Shopify para intentar atribuir ingresos reales al tráfico que llega desde una mención en IA. Es la única de esta lista centrada en atribución económica en vez de solo en medición de visibilidad — encaja mejor cuando ya tienes tráfico e ingresos medibles que conectar, no como primera herramienta de un equipo que empieza de cero."
  }
];
