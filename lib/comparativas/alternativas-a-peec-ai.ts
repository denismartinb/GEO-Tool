/**
 * GEO-SELF-1 Fase 2 — datos de /comparativas/alternativas-a-peec-ai.
 *
 * Mismo formato y mismas reglas que `alternativas-a-otterly.ts`: la pieza se
 * organiza por EL LÍMITE con el que choca quien ya usa Peec AI, no por un
 * ranking. Cada alternativa declara qué resuelve (`solves`) y qué NO
 * (`tradeoff`, obligatorio, GenScore incluida). Las ventajas de Peec AI se
 * declaran enteras y siempre con su contexto (`PEEC_STRENGTHS`).
 *
 * **Precios de Peec AI: de tercero, no de fuente primaria.** peec.ai/pricing
 * carga, pero no muestra ningún importe (sólo «Monthly»/«Annual» y un 15 % de
 * descuento anual). Los importes vienen de PricingSaaS, último visto el
 * 14-09-2026, que los da con facturación anual, y se publican como
 * orientativos. Los prompts, modelos, países y usuarios SÍ vienen de la
 * página oficial.
 *
 * Los datos de GenScore vienen de `app/pricing/plans-data.ts`. Se usa
 * `price`, nunca `promoPrice` (el precio fundador depende de Stripe). Está en
 * `PRICE_QUOTING_FILES` de `tests/promise-parity.test.ts`.
 *
 * Lo que NO se afirma, por no estar verificado (log §257): la ciudad de GEO
 * Metrics (sólo la sugiere una nota de prensa) ni que su aplicación —no sólo
 * su web— esté en castellano; los idiomas de interfaz de Peec AI, Otterly,
 * Ahrefs y Scrunch («no consta», nunca «no tiene»).
 */
import { PLANS } from "@/app/pricing/plans-data";
import type { Source } from "./sources";

export type { Source };

const STARTER_PRICE = PLANS.find((p) => p.id === "starter")!.price;
const PRO_PRICE = PLANS.find((p) => p.id === "pro")!.price;
const PRO_PROMPTS = PLANS.find((p) => p.id === "pro")!.caps.prompts;

export const RESEARCH_DATE = "9 de octubre de 2026";
export const RESEARCH_DATE_ISO = "2026-10-09";

const S = {
  peecPricing: {
    label: "Peec AI — página de precios (no muestra importes)",
    url: "https://www.peec.ai/pricing",
    consulted: RESEARCH_DATE_ISO,
    primary: true
  },
  peecHome: { label: "Peec AI — página principal", url: "https://www.peec.ai/", consulted: RESEARCH_DATE_ISO, primary: true },
  peecAgencies: {
    label: "Peec AI — página para agencias",
    url: "https://www.peec.ai/for-agencies",
    consulted: RESEARCH_DATE_ISO,
    primary: true
  },
  peecActions: {
    label: "Peec AI — blog, «Introducing Actions» (10-02-2026)",
    url: "https://peec.ai/blog/introducing-actions",
    consulted: RESEARCH_DATE_ISO,
    primary: true
  },
  peecThirdPartyPricing: {
    label: "PricingSaaS — historial de precios de Peec AI (último visto 14-09-2026)",
    url: "https://pricingsaas.com/companies/peec",
    consulted: RESEARCH_DATE_ISO,
    primary: false
  },
  otterlyPricing: { label: "Otterly.AI — página de precios", url: "https://otterly.ai/pricing", consulted: RESEARCH_DATE_ISO, primary: true },
  profoundPricing: {
    label: "Profound — página de precios",
    url: "https://www.tryprofound.com/pricing",
    consulted: RESEARCH_DATE_ISO,
    primary: true
  },
  profoundHome: { label: "Profound — página principal", url: "https://www.tryprofound.com/", consulted: RESEARCH_DATE_ISO, primary: true },
  profoundAgencyMode: {
    label: "Profound — centro de ayuda, «Agency Mode Overview»",
    url: "https://help.tryprofound.com/articles/8593548222-agency-mode-overview",
    consulted: RESEARCH_DATE_ISO,
    primary: true
  },
  profoundThirdPartyPricing: {
    label: "GEO Toolbox — «Profound Pricing» (tercero y competidor; precios comprobados el 28-09-2026)",
    url: "https://geotoolbox.ai/blog/profound-pricing",
    consulted: RESEARCH_DATE_ISO,
    primary: false
  },
  geoMetricsPricing: {
    label: "GEO Metrics — página de precios",
    url: "https://trygeometrics.com/pricing",
    consulted: RESEARCH_DATE_ISO,
    primary: true
  },
  geoMetricsEs: {
    label: "GEO Metrics — web en español",
    url: "https://www.trygeometrics.com/es/",
    consulted: RESEARCH_DATE_ISO,
    primary: true
  },
  semrushKb: {
    label: "Semrush — base de conocimiento, «AI Toolkit»",
    url: "https://www.semrush.com/kb/1493-ai-toolkit",
    consulted: RESEARCH_DATE_ISO,
    primary: true
  },
  ahrefsBrandRadar: {
    label: "Ahrefs — página de Brand Radar",
    url: "https://ahrefs.com/brand-radar",
    consulted: RESEARCH_DATE_ISO,
    primary: true
  },
  scrunchPricing: { label: "Scrunch — página de precios", url: "https://scrunch.com/pricing", consulted: RESEARCH_DATE_ISO, primary: true }
} satisfies Record<string, Source>;

export const SOURCES = S;

/**
 * La escalera de Peec AI. Prompts, modelos, países/idiomas y proyectos: web
 * oficial. Precio: tercero, con facturación anual.
 */
export const PEEC_PLANS: {
  plan: string;
  price: string;
  prompts: string;
  models: string;
  markets: string;
}[] = [
  { plan: "Starter", price: "~80 $/mes (anual)", prompts: "50 prompts", models: "3 a elegir", markets: "1 país · 1 idioma" },
  { plan: "Pro", price: "~205 $/mes (anual)", prompts: "150 prompts", models: "3 a elegir", markets: "3 países · 2 idiomas" },
  { plan: "Advanced", price: "~420 $/mes (anual)", prompts: "350 prompts", models: "3 a elegir", markets: "3 países · 3 idiomas" },
  { plan: "Enterprise", price: "A medida", prompts: "A medida", models: "Hasta 13", markets: "A medida" }
];
export const PEEC_PLANS_SOURCES: Source[] = [S.peecPricing, S.peecThirdPartyPricing];

/** Lo que Peec AI hace bien, y a quién le sirve. `claim` verificable; `context` igual de cierto. */
export const PEEC_STRENGTHS: { claim: string; context: string; sources: Source[] }[] = [
  {
    claim: "Usuarios ilimitados en todos sus planes de autoservicio.",
    context:
      "Ventaja real si mucha gente necesita mirar el mismo panel. Lo que limita el plan no son los asientos sino los prompts y los modelos: tres modelos a elegir y 50 prompts en Starter.",
    sources: [S.peecPricing]
  },
  {
    claim: "50 prompts ya en el plan de entrada.",
    context:
      "Es más que la entrada de Otterly (15). Pero cada prompt se lanza sólo en los tres modelos que elijas, y si uno de ellos tiene que ser Claude o Perplexity, ese plan ya no te vale: Claude es de Enterprise y Perplexity, complemento de pago.",
    sources: [S.peecPricing, S.otterlyPricing]
  },
  {
    claim: "Varios países e idiomas desde el plan Pro.",
    context:
      "Útil si mides la misma marca en dos o tres mercados. En Starter es un país y un idioma, así que esta ventaja empieza en el escalón Pro (unos 205 $/mes con pago anual, orientativo según PricingSaaS).",
    sources: [S.peecPricing, S.peecThirdPartyPricing]
  },
  {
    claim: "Espacios de «pitch» para agencias, de 7 días y fuera de la cuota.",
    context:
      "Muy práctico si tu agencia prospecta con auditorías de visibilidad. Si gestionas tu propia marca, es una función que no vas a usar.",
    sources: [S.peecAgencies]
  }
];

export type LeaveReason = { id: string; title: string; shortLabel: string; detail: string; sources: Source[] };

export const LEAVE_REASONS: LeaveReason[] = [
  {
    id: "motores",
    title: "Los motores que te importan no caben en tus tres modelos",
    shortLabel: "Más motores incluidos",
    detail:
      "Los planes Starter, Pro y Advanced te dejan elegir 3 modelos entre ChatGPT, AI Mode, AI Overviews, Copilot, Gemini y Naver AI. Claude sólo aparece en Enterprise, y Perplexity se vende como modelo adicional (orientativo, según PricingSaaS: desde unos 30 $/mes en Starter con pago anual). Si tus clientes preguntan en un cuarto motor, el precio que comparaste no es el que vas a pagar.",
    sources: [S.peecPricing, S.peecThirdPartyPricing]
  },
  {
    id: "precio",
    title: "El precio no está en la web y el siguiente escalón cuesta 2,5 veces más",
    shortLabel: "Precio y escalones",
    detail:
      "La página de precios de Peec AI no muestra importes. Según PricingSaaS (orientativo, último visto el 14-09-2026), pasar de Starter (50 prompts) a Pro (150 prompts) va de unos 80 a unos 205 $/mes con pago anual. Antes de subir, cuenta cuántos prompts necesitas de verdad y en cuántos motores.",
    sources: [S.peecPricing, S.peecThirdPartyPricing]
  },
  {
    id: "accion",
    title: "Te dice qué hacer, pero no lo escribe",
    shortLabel: "Redactar la solución",
    detail:
      "Su función Actions convierte los datos en una lista priorizada de pasos, y el propio Peec AI lo dice claro: «no escribe contenido por ti». Si tu cuello de botella es redactar la FAQ, los datos estructurados o el brief, necesitas una herramienta que entre en esa fase.",
    sources: [S.peecActions]
  },
  {
    id: "paises",
    title: "Necesitas muchos países y tu plan cubre uno",
    shortLabel: "Muchos países",
    detail:
      "Starter cubre un país y un idioma; Pro y Advanced, tres países. Para una marca que se juega la visibilidad en diez mercados a la vez, la escalera se queda corta antes de Enterprise.",
    sources: [S.peecPricing]
  },
  {
    id: "espanol",
    title: "Tu equipo no trabaja en inglés",
    shortLabel: "Producto en castellano",
    detail:
      "Peec AI no menciona idiomas de interfaz en su web: no consta una versión en castellano, y la que hemos visto está en inglés. Para quien redacta el contenido en castellano cada día, es fricción constante.",
    sources: [S.peecHome]
  }
];

export type Alternative = {
  slug: string;
  name: string;
  url: string;
  solves: string[];
  oneLiner: string;
  pricingNote: string;
  spanishSupport: string;
  /** Lo que NO resuelve. Obligatorio, también para GenScore. */
  tradeoff: string;
  sources: Source[];
  comparisonHref?: string;
  /** true sólo para GenScore: la ficha lo declara como herramienta nuestra. */
  ours?: boolean;
};

export const ALTERNATIVES: Alternative[] = [
  {
    slug: "genscore",
    name: "GenScore",
    url: "https://www.genscore.es",
    ours: true,
    solves: ["motores", "accion", "espanol"],
    oneLiner:
      "Nuestra herramienta. Mide cómo apareces en ChatGPT, Gemini y Claude —los tres incluidos en todos los planes de pago, sin elegir ni pagar complementos— y desde Pro redacta el borrador de la solución: FAQ, datos estructurados y briefs.",
    pricingNote: `Starter ${STARTER_PRICE} €/mes; Pro ${PRO_PRICE} €/mes con ~${PRO_PROMPTS} prompts en los tres motores y escaneo diario. 7 días de Pro gratis, sin tarjeta.`,
    spanishSupport: "Sí, nativo — interfaz y soporte en castellano.",
    tradeoff:
      "No ejecuta Perplexity, Copilot ni AI Overviews, y no desglosa la puntuación por país: si mides muchos mercados a la vez, Peec AI desde Pro u Otterly lo cubren mejor. Su plan de Agencia gestiona varios dominios en una cuenta, pero sin marca blanca ni espacios de «pitch» como los de Peec AI.",
    sources: [],
    comparisonHref: "/comparativas/genscore-vs-peec-ai"
  },
  {
    slug: "otterly",
    name: "Otterly.AI",
    url: "https://otterly.ai",
    solves: ["precio", "paises"],
    oneLiner:
      "Monitorización y auditoría GEO con precio público, más de 50 países en todos los planes y ChatGPT, AI Overviews, Perplexity y Copilot incluidos.",
    pricingNote: "Lite 29 $/mes (15 prompts), Standard 189 $/mes (100), Premium 489 $/mes (400). Gemini, AI Mode y Claude, aparte.",
    spanishSupport: "No consta — su web no menciona idiomas de interfaz; la que hemos visto está en inglés.",
    tradeoff:
      "Su entrada es más barata pero trae 15 prompts, menos que los 50 de Peec AI, y Gemini, AI Mode y Claude son complementos de pago en todos los niveles. Tampoco tiene marca blanca nativa.",
    sources: [S.otterlyPricing],
    comparisonHref: "/comparativas/genscore-vs-otterly"
  },
  {
    slug: "profound",
    name: "Profound",
    url: "https://www.tryprofound.com",
    solves: ["motores", "accion"],
    oneLiner:
      "Plataforma Enterprise: hasta 9 motores (Claude y Perplexity incluidos) y un módulo de creación de contenido, «AI Marketer», además de la medición.",
    pricingNote:
      "Sin precio público: prueba gratis de 7 días y Enterprise a medida. Orientativo, según GEO Toolbox (tercero y competidor, 28-09-2026): plan de agencia a 99 $/mes más 399 $/mes por espacio de cliente.",
    spanishSupport: "No consta — anuncia su interfaz en más de 30 idiomas sin listarlos.",
    tradeoff:
      "Lo que la diferencia de Peec AI —motores amplios, contenido, analítica de agentes— es de Enterprise según su propia documentación: un salto de presupuesto y de contrato, no un cambio lateral. Sin precio en la web.",
    sources: [S.profoundPricing, S.profoundHome, S.profoundAgencyMode, S.profoundThirdPartyPricing],
    comparisonHref: "/comparativas/genscore-vs-profound"
  },
  {
    slug: "geo-metrics",
    name: "GEO Metrics",
    url: "https://trygeometrics.com",
    solves: ["motores", "espanol"],
    oneLiner:
      "Herramienta de visibilidad en IA con web en español, muchos motores (ChatGPT, Gemini, Perplexity, Copilot, DeepSeek, Grok, AI Overviews y AI Mode; Claude desde Pro) y sentimiento.",
    pricingNote: "Freelance 80 €/mes (20 prompts, 2 usuarios), Pro 245 €/mes (100 prompts, 10 usuarios), Enterprise 690 €/mes (300 prompts). 10 % menos con pago anual.",
    spanishSupport: "Web en español; no consta que la aplicación también lo esté.",
    tradeoff:
      "Su entrada trae 20 prompts y 2 usuarios, menos que Peec AI, y Claude no está hasta Pro. Sus planes limitan también los informes y análisis de sentimiento al mes.",
    sources: [S.geoMetricsPricing, S.geoMetricsEs]
  },
  {
    slug: "semrush-ai-toolkit",
    name: "Semrush AI Toolkit",
    url: "https://www.semrush.com",
    solves: ["paises"],
    oneLiner:
      "El módulo de visibilidad en IA de Semrush: seguimiento de prompts en más de 220 países y territorios, con sentimiento y cuota de voz.",
    pricingNote: "99 $/mes, sobre una suscripción de pago de Semrush (obligatoria). Sin prueba gratuita.",
    spanishSupport: "No consta para el módulo de IA.",
    tradeoff:
      "Su documentación menciona ChatGPT y Google AI Mode, no Claude ni Gemini. Y sólo tiene sentido si ya pagas Semrush: si no, sumas la suite al módulo.",
    sources: [S.semrushKb]
  },
  {
    slug: "ahrefs-brand-radar",
    name: "Ahrefs Brand Radar",
    url: "https://ahrefs.com/brand-radar",
    solves: ["motores"],
    oneLiner:
      "Visibilidad en IA dentro de Ahrefs: un índice ya recogido de millones de prompts y, aparte, tus propios prompts en AI Overviews, AI Mode, ChatGPT, Perplexity, Gemini, Copilot y Claude.",
    pricingNote: "Su página es contradictoria: anuncia prompts propios «desde 50 $/mes» y, a la vez, que entran en los planes de pago de Ahrefs desde Lite. Confírmalo en ahrefs.com antes de comparar.",
    spanishSupport: "No consta.",
    tradeoff:
      "Su página no menciona sentimiento ni ayuda a redactar la solución. Encaja si ya trabajas en Ahrefs; si no, sumas suite y módulos.",
    sources: [S.ahrefsBrandRadar]
  },
  {
    slug: "scrunch",
    name: "Scrunch",
    url: "https://scrunch.com",
    solves: ["motores", "precio"],
    oneLiner:
      "Visibilidad en IA con mucho volumen de prompts desde el primer plan y ChatGPT, Claude, Gemini, Perplexity, AI Mode, AI Overviews y Meta.",
    pricingNote: "Starter 300 $/mes (250 $/mes con pago anual) con 350 prompts propios y 3 usuarios. Prueba de 7 días sin tarjeta.",
    spanishSupport: "No consta.",
    tradeoff:
      "Su entrada cuesta bastante más que la de Peec AI y limita los usuarios a 3, frente a los ilimitados de Peec AI. Su página de precios no menciona idiomas.",
    sources: [S.scrunchPricing]
  }
];

export const PAGE = {
  slug: "alternativas-a-peec-ai",
  metaTitle: "Alternativas a Peec AI en 2026: cuál elegir según tu caso — GenScore",
  metaDescription:
    "Siete alternativas a Peec AI comparadas por el motivo que te hace buscarlas: tres modelos a elegir, precio que no está en la web, recomendaciones que no se redactan, pocos países o producto en inglés. GenScore se prueba 7 días sin tarjeta.",
  h1: "Alternativas a Peec AI en 2026",
  dateLine: `Datos consultados el ${RESEARCH_DATE}. Los importes de Peec AI no están en su web: proceden de un tercero y son orientativos.`,
  keyTakeaway:
    "Peec AI mide bien y deja entrar a todo el equipo, pero en sus planes de autoservicio eliges tres modelos, Claude queda para Enterprise y su función Actions sugiere sin redactar. GenScore resuelve tres de los cinco motivos para buscar alternativa: incluye ChatGPT, Gemini y Claude en todos los planes de pago, redacta la solución desde Pro y es un producto en castellano.",
  verdictTitle: "Por qué GenScore es la respuesta en tres de los cinco casos",
  verdict:
    `Si los tres modelos se te quedan cortos, GenScore no te hace elegir: ChatGPT, Gemini y Claude van en todos los planes de pago. Si tienes el diagnóstico y te falta el texto, el generador de soluciones redacta el borrador de FAQ, datos estructurados y briefs desde Pro. Y si tu equipo trabaja en castellano, es interfaz y soporte nativos. Pro cuesta ${PRO_PRICE} €/mes y se prueba 7 días sin tarjeta.`,
  switchingNote:
    "Una cautela para cualquier cambio: el histórico no se migra entre herramientas. Por eso conviene empezar a acumularlo en paralelo —por ejemplo, en los 7 días de prueba de GenScore— antes de mover nada.",
  methodology:
    "Los datos de GenScore vienen de los planes reales del producto, la misma fuente que usa la página de Precios. Los del resto vienen de sus webs oficiales, consultadas en la fecha indicada y enlazadas en «Fuentes». Peec AI y Profound no publican algunos importes: en esos casos citamos a un tercero, con su fecha, y lo marcamos como orientativo. No hemos contratado ninguna de estas herramientas para esta comparativa. Si detectas un dato desactualizado, dínoslo y lo corregimos.",
  cta: {
    title: "Antes de pagar un cuarto modelo, mira cuánto necesitas de verdad",
    text: "Prueba GenScore 7 días con Pro, sin tarjeta, con ChatGPT, Gemini y Claude incluidos."
  }
};

export const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: "¿Cuál es la mejor alternativa a Peec AI?",
    answer:
      "Depende del límite que te haya hecho buscar. Si son los motores, la redacción o el idioma, GenScore resuelve los tres: ChatGPT, Gemini y Claude en todos los planes de pago, un generador que redacta la solución desde Pro y producto en castellano. Si lo que necesitas es medir muchos países a la vez, Otterly cubre más de 50 en todos sus planes."
  },
  {
    question: "¿Cuánto cuesta Peec AI?",
    answer:
      "Su web no muestra importes. Según PricingSaaS (último visto el 14 de septiembre de 2026), Starter cuesta unos 80 $/mes, Pro unos 205 $/mes y Advanced unos 420 $/mes, con facturación anual; Enterprise es a medida. Son cifras orientativas de un tercero: confírmalas con Peec AI."
  },
  {
    question: "¿Peec AI incluye Claude y Perplexity?",
    answer:
      "No en los planes de autoservicio: en Starter, Pro y Advanced eliges 3 modelos entre ChatGPT, AI Mode, AI Overviews, Copilot, Gemini y Naver AI. Perplexity se añade como modelo de pago y Claude aparece en Enterprise. GenScore incluye Claude, junto a ChatGPT y Gemini, en todos sus planes de pago."
  },
  {
    question: "¿Hay alternativas a Peec AI en español?",
    answer:
      "Sí. GenScore es un producto en castellano, interfaz y soporte. GEO Metrics tiene su web en español; no consta que la aplicación también lo esté."
  },
  {
    question: "¿Puedo probar una alternativa sin dejar Peec AI?",
    answer:
      "Sí, y es lo más sensato, porque el histórico no se migra entre herramientas. Con los 7 días de Pro de GenScore, sin tarjeta, puedes medir en paralelo y decidir con tus propios datos."
  }
];
