/**
 * GEO-SELF-1 Fase 2 — datos de /comparativas/profound-vs-peec-ai-vs-otterly.
 *
 * Comparativa a tres, NEUTRAL: GenScore no compite en la tabla ni en el
 * ranking. Aparece sólo al final, en una nota corta y etiquetada ("Si buscas
 * una opción en español"), con sus límites declarados igual que en
 * `alternativas-a-otterly.ts` — y la página la pinta como bloque aparte, nunca
 * como `Verdict` (log §258).
 *
 * Fuentes: cada fila lleva sus `sources` con URL y fecha de consulta, y la
 * página las pinta en una sección «Fuentes». Regla de esta pieza: lo que la
 * web oficial dice, se cita a la web oficial; lo que la web oficial NO publica
 * (los importes de Peec AI, el precio de agencia de Profound) se cita a un
 * tercero con su propia fecha y se presenta como orientativo. Nada sin fuente.
 *
 * Los datos de GenScore vienen de `app/pricing/plans-data.ts` (misma fuente
 * que /precios). Se usa `price`, NUNCA `promoPrice`: el precio fundador sólo
 * se enseña cuando `getFounderOffer` confirma plazas y cupón en Stripe, y una
 * página estática no puede saberlo. Está en `PRICE_QUOTING_FILES` de
 * `tests/promise-parity.test.ts`.
 */
import { PLANS } from "@/app/pricing/plans-data";
import type { Source } from "./sources";

export type { Source };

const STARTER_PRICE = PLANS.find((p) => p.id === "starter")!.price;
const PRO_PRICE = PLANS.find((p) => p.id === "pro")!.price;
const STARTER_PROMPTS = PLANS.find((p) => p.id === "starter")!.caps.prompts;
const PRO_PROMPTS = PLANS.find((p) => p.id === "pro")!.caps.prompts;

export const RESEARCH_DATE = "9 de octubre de 2026";
export const RESEARCH_DATE_ISO = "2026-10-09";

const S = {
  profoundPricing: {
    label: "Profound — página de precios",
    url: "https://www.tryprofound.com/pricing",
    consulted: RESEARCH_DATE_ISO,
    primary: true
  },
  profoundHome: {
    label: "Profound — página principal",
    url: "https://www.tryprofound.com/",
    consulted: RESEARCH_DATE_ISO,
    primary: true
  },
  profoundAgencyMode: {
    label: "Profound — centro de ayuda, «Agency Mode Overview»",
    url: "https://help.tryprofound.com/articles/8593548222-agency-mode-overview",
    consulted: RESEARCH_DATE_ISO,
    primary: true
  },
  profoundLanguages: {
    label: "Profound — blog, selector de idioma de la app (24-11-2025)",
    url: "https://www.tryprofound.com/blog/introducing-profound-s-new-app-language-selector",
    consulted: RESEARCH_DATE_ISO,
    primary: true
  },
  profoundThirdPartyPricing: {
    label: "GEO Toolbox — «Profound Pricing» (tercero y competidor; precios comprobados el 28-09-2026)",
    url: "https://geotoolbox.ai/blog/profound-pricing",
    consulted: RESEARCH_DATE_ISO,
    primary: false
  },
  peecPricing: {
    label: "Peec AI — página de precios (no muestra importes)",
    url: "https://www.peec.ai/pricing",
    consulted: RESEARCH_DATE_ISO,
    primary: true
  },
  peecHome: {
    label: "Peec AI — página principal",
    url: "https://www.peec.ai/",
    consulted: RESEARCH_DATE_ISO,
    primary: true
  },
  peecAgencies: {
    label: "Peec AI — página para agencias",
    url: "https://www.peec.ai/for-agencies",
    consulted: RESEARCH_DATE_ISO,
    primary: true
  },
  peecAgencyPricing: {
    label: "Peec AI — precios para agencias (por créditos, sin importes)",
    url: "https://peec.ai/pricing-agencies",
    consulted: RESEARCH_DATE_ISO,
    primary: true
  },
  peecThirdPartyPricing: {
    label: "PricingSaaS — historial de precios de Peec AI (último visto 14-09-2026)",
    url: "https://pricingsaas.com/companies/peec",
    consulted: RESEARCH_DATE_ISO,
    primary: false
  },
  otterlyPricing: {
    label: "Otterly.AI — página de precios",
    url: "https://otterly.ai/pricing",
    consulted: RESEARCH_DATE_ISO,
    primary: true
  },
  otterlyHome: {
    label: "Otterly.AI — página principal (FAQ)",
    url: "https://otterly.ai/",
    consulted: RESEARCH_DATE_ISO,
    primary: true
  },
  otterlyWhiteLabel: {
    label: "Otterly.AI — centro de ayuda, «White label»",
    url: "https://help.otterly.ai/white-label",
    consulted: RESEARCH_DATE_ISO,
    primary: true
  }
} satisfies Record<string, Source>;

export const SOURCES = S;

export type Vendor = "profound" | "peec" | "otterly";

export const VENDORS: { id: Vendor; name: string; url: string; oneLiner: string }[] = [
  {
    id: "profound",
    name: "Profound",
    url: "https://www.tryprofound.com",
    oneLiner:
      "Plataforma de visibilidad en IA orientada a grandes marcas: venta por demo, plan Enterprise a medida y una capa de creación de contenido («AI Marketer») además de la medición."
  },
  {
    id: "peec",
    name: "Peec AI",
    url: "https://peec.ai",
    oneLiner:
      "Monitorización de visibilidad en IA con planes por número de prompts, tres modelos a elegir, usuarios ilimitados y varios países e idiomas desde el plan Pro."
  },
  {
    id: "otterly",
    name: "Otterly.AI",
    url: "https://otterly.ai",
    oneLiner:
      "Monitorización y auditoría GEO con precio público, el plan de entrada más barato de los tres y más de 50 países en todos los planes, con algunos motores como complemento de pago."
  }
];

export type ComparisonRow = {
  label: string;
  profound: string;
  peec: string;
  otterly: string;
  /**
   * Lectura neutral de la fila: qué decide el lector con ella. Sin ganador
   * global; si una herramienta destaca en esta fila concreta, se dice aquí.
   */
  takeaway: string;
  sources: Source[];
};

export const COMPARISON_ROWS: ComparisonRow[] = [
  {
    label: "Precio y escalones",
    profound:
      "Sin precio público. Su web muestra una prueba gratuita y un plan Enterprise «a medida»; menciona un plan Agency Growth sin importe. Orientativo, según GEO Toolbox (tercero y competidor, precios comprobados el 28-09-2026): Agency Growth cuesta 99 $/mes más 399 $/mes por cada espacio de cliente, y los planes de marca de 99 $ y 399 $ que aún citan muchas reseñas se retiraron a mediados de septiembre de 2026.",
    peec:
      "Su web no publica importes (sólo «Monthly»/«Annual» y un 15 % de descuento anual). Orientativo, según PricingSaaS (último visto el 14-09-2026): Starter 80 $/mes, Pro 205 $/mes y Advanced 420 $/mes con facturación anual; Enterprise a medida. No hemos encontrado un precio mensual verificado.",
    otterly:
      "Precio público: Lite 29 $/mes, Standard 189 $/mes y Premium 489 $/mes; Enterprise a medida. La misma página muestra también 25/160/422 $ sin aclarar a qué corresponden (posiblemente el pago anual).",
    takeaway:
      "Otterly es la única con precio público completo y la de entrada más barata. Peec AI y Profound obligan a pedir precio o a fiarse de terceros; Profound, además, ya no tiene un plan de marca de autoservicio a la vista.",
    sources: [S.profoundPricing, S.profoundThirdPartyPricing, S.peecPricing, S.peecThirdPartyPricing, S.otterlyPricing]
  },
  {
    label: "Motores de IA cubiertos",
    profound:
      "Prueba: ChatGPT, Gemini y AI Overviews. Enterprise: hasta 9 motores, entre ellos ChatGPT, Perplexity, Google AI Mode, Gemini, Microsoft Copilot, DeepSeek, Claude, AI Overviews y Exa Search.",
    peec:
      "Starter, Pro y Advanced: 3 modelos a elegir entre ChatGPT, AI Mode, AI Overviews, Microsoft Copilot, Gemini y Naver AI; más modelos como complemento de pago. Enterprise: hasta 13, incluidos Claude, Perplexity, Grok, DeepSeek y Mistral.",
    otterly:
      "Incluidos en todos los planes: ChatGPT, AI Overviews, Perplexity y Microsoft Copilot. Google AI Mode, Gemini y Claude se cobran aparte en todos los niveles (por ejemplo, Gemini 9 $/mes en Lite y 59 $/mes en Standard; Claude 29 $/mes en Lite y 109 $/mes en Standard).",
    takeaway:
      "Nadie incluye «todos los motores» en el plan de entrada. Si Claude te importa, en Peec AI hace falta Enterprise y en Otterly es un complemento; en Profound, el plan amplio es Enterprise.",
    sources: [S.profoundPricing, S.profoundHome, S.peecPricing, S.otterlyPricing]
  },
  {
    label: "Prompts y límites",
    profound:
      "Prueba: 50 prompts diarios durante 7 días. Enterprise: volumen a medida. Agency Growth funciona por créditos por espacio de cliente.",
    peec:
      "Starter 50 prompts, Pro 150, Advanced 350, con escaneo diario; 1, 2 y 5 proyectos respectivamente.",
    otterly:
      "Lite 15 prompts, Standard 100, Premium 400, Enterprise desde 1.000. Ampliable en Standard y Premium a 99 $/mes por cada 100 prompts.",
    takeaway:
      "Por prompts incluidos en la entrada, Peec AI (50) da más que Otterly (15). El salto de Otterly de Lite a Standard es el más brusco de los tres.",
    sources: [S.profoundPricing, S.peecPricing, S.otterlyPricing]
  },
  {
    label: "Idiomas, países e interfaz",
    profound:
      "Prueba: 1 idioma y 1 región; Enterprise, a medida. La interfaz se anuncia en más de 30 idiomas, sin listarlos: no hemos podido confirmar que el castellano esté entre ellos.",
    peec:
      "Starter 1 país y 1 idioma; Pro 3 países y 2 idiomas; Advanced 3 países y 3 idiomas. Su web no menciona idiomas de interfaz: no consta una versión en castellano, y la que hemos visto está en inglés.",
    otterly:
      "Más de 50 países en todos los planes. Su web no menciona idiomas de prompt ni de interfaz: no consta una versión en castellano, y la que hemos visto está en inglés.",
    takeaway:
      "Para varios países a la vez, Otterly es la más amplia en todos sus planes. En ninguna de las tres consta una interfaz en castellano.",
    sources: [S.profoundPricing, S.profoundLanguages, S.peecPricing, S.peecHome, S.otterlyPricing]
  },
  {
    label: "Citas y fuentes",
    profound: "«Citation Analytics»: fuentes citadas en las respuestas. Su página de precios no dice en qué planes.",
    peec:
      "Distingue fuentes «usadas» y «citadas» (cuando tu URL aparece explícitamente), a nivel de dominio o de URL, con frecuencia de cita.",
    otterly: "«Link Citations Analysis» incluido en todos los planes.",
    takeaway:
      "Las tres miden qué páginas citan los motores. Otterly es la única que confirma en su página de precios que está en todos los planes.",
    sources: [S.profoundHome, S.peecHome, S.otterlyPricing]
  },
  {
    label: "Sentimiento",
    profound: "Sí: mide el sentimiento de la marca en las respuestas y la narrativa y fuentes que lo explican. Sin detalle de planes.",
    peec: "Sí: sentimiento, posición y cuota de voz frente a competidores. Sin detalle de planes.",
    otterly: "Mencionado en su FAQ («sentiment analysis»); no aparece en la tabla de planes.",
    takeaway: "Las tres lo ofrecen; ninguna detalla con claridad desde qué plan.",
    sources: [S.profoundHome, S.peecPricing, S.otterlyHome]
  },
  {
    label: "Agencias y marca blanca",
    profound:
      "«Agency Mode»: espacios de cliente y espacios de «pitch» para prospectos (caducan a los 30 días salvo extensión). Su documentación no menciona marca blanca.",
    peec:
      "Planes de agencia por créditos, espacios de «pitch» de 7 días fuera de la cuota y una sola factura. Paneles de cliente personalizables («la marca, el diseño y las métricas son tuyos») vía enlaces de solo lectura y Looker Studio.",
    otterly:
      "Programa de partners desde Standard (+150 prompts en Standard, +500 en Premium). Sin marca blanca nativa según su propia ayuda; informes con tu marca a través de Looker Studio (Standard y superiores).",
    takeaway:
      "Para una agencia que hace pitches, Peec AI y Profound tienen la herramienta específica; Peec AI es la que más claramente permite entregar paneles con tu marca.",
    sources: [S.profoundAgencyMode, S.peecAgencies, S.peecAgencyPricing, S.otterlyPricing, S.otterlyWhiteLabel]
  },
  {
    label: "Prueba gratuita",
    profound: "Sí: 7 días, 50 prompts, 3 motores, usuarios ilimitados.",
    peec: "Sí («Start free trial»); su web no indica la duración.",
    otterly: "Sí; su web da dos duraciones distintas (7 días en la FAQ, 14 en un banner).",
    takeaway: "Profound es la única que publica exactamente qué incluye su prueba.",
    sources: [S.profoundPricing, S.peecPricing, S.otterlyHome]
  },
  {
    label: "Para quién es",
    profound:
      "Marcas grandes con presupuesto y equipo para un contrato Enterprise, o agencias dispuestas a pagar por espacio de cliente.",
    peec:
      "Equipos de marketing que quieren buen volumen de prompts desde el primer plan, todo el equipo dentro y varios mercados a partir de Pro.",
    otterly:
      "Quien quiere empezar con poco presupuesto y precio público, o necesita muchos países a la vez, y asume pagar complementos por motor.",
    takeaway: "No hay ganador global: depende de presupuesto, motores y número de mercados.",
    sources: [S.profoundPricing, S.peecPricing, S.otterlyPricing]
  }
];

/**
 * Nota final sobre GenScore. Va FUERA de la tabla, etiquetada, y con sus
 * límites. Todo lo que dice se traza a `PLANS`/`PLAN_MATRIX` o a
 * `.claude/rules/growth-content.md` (límites declarados).
 */
export const GENSCORE_NOTE = {
  label: "Si buscas una opción en español",
  title: "GenScore",
  body:
    `GenScore es nuestra herramienta, por eso no está en la tabla. Mide cómo aparece tu marca en ChatGPT, Gemini y Claude, los tres incluidos en todos los planes de pago sin complementos, con interfaz y soporte en castellano. Starter cuesta ${STARTER_PRICE} €/mes (~${STARTER_PROMPTS} prompts, escaneo semanal) y Pro ${PRO_PRICE} €/mes (~${PRO_PROMPTS} prompts, escaneo diario, sentimiento y un generador que redacta borradores de FAQ, datos estructurados y briefs). Se prueba 7 días con Pro, sin tarjeta.`,
  limits:
    "Lo que no hace: no ejecuta Perplexity, Copilot ni AI Overviews, no desglosa la puntuación por país y su plan de Agencia gestiona varios dominios en una cuenta, pero todavía sin marca blanca.",
  href: "/comparativas/mejores-herramientas-geo-en-espanol"
};

export const PAGE = {
  slug: "profound-vs-peec-ai-vs-otterly",
  metaTitle: "Profound vs Peec AI vs Otterly: comparativa en español (2026) — GenScore",
  metaDescription:
    "Profound, Peec AI y Otterly comparadas fila a fila: precios y escalones, motores cubiertos, prompts, países e idiomas, citas, sentimiento, agencias y prueba gratuita. Datos fechados y con fuente.",
  h1: "Profound vs Peec AI vs Otterly: comparativa en español (2026)",
  dateLine: `Datos consultados el ${RESEARCH_DATE}. Cada dato lleva su fuente; los precios que el fabricante no publica proceden de terceros y son orientativos.`,
  keyTakeaway:
    "Otterly es la más barata para empezar y la que cubre más países, pero cobra aparte Gemini, AI Mode y Claude. Peec AI da más prompts y todo el equipo dentro desde el primer plan, con tres modelos a elegir y sin precio en su web. Profound es la opción Enterprise: amplia en motores y con creación de contenido, pero sin precio público ni plan de marca de autoservicio.",
  howToChoose: [
    {
      q: "Si tu presupuesto es pequeño y quieres ver el precio antes de hablar con nadie",
      a: "Otterly. Es la única de las tres con importes publicados y su plan de entrada es el más barato, aunque son 15 prompts y los motores de Google más allá de AI Overviews se pagan aparte."
    },
    {
      q: "Si necesitas volumen de prompts y que entre todo el equipo",
      a: "Peec AI. Su plan de entrada incluye 50 prompts y usuarios ilimitados; a cambio, eliges tres modelos y Claude o Perplexity quedan para Enterprise o complementos."
    },
    {
      q: "Si eres una marca grande y quieres medir y producir contenido en la misma herramienta",
      a: "Profound, con la condición de pasar por demo y contrato Enterprise: sus funciones de contenido y analítica de agentes son sólo de ese plan, según su propia documentación."
    },
    {
      q: "Si vendes en muchos países a la vez",
      a: "Otterly, con más de 50 países en todos los planes. Peec AI llega a 3 países desde Pro."
    }
  ],
  methodology:
    "Consultamos las páginas de precios, las páginas principales y los centros de ayuda de los tres fabricantes en la fecha indicada. Peec AI no publica importes en su web y Profound no publica el de su plan de agencia: en esos dos casos citamos a un tercero, con su fecha, y lo marcamos como orientativo. No hemos contratado ninguna de las tres herramientas para esta comparativa. Si detectas un dato desactualizado, dínoslo y lo corregimos.",
  cta: {
    title: "¿Tu equipo trabaja en castellano?",
    text: "Prueba GenScore 7 días con Pro, sin tarjeta, y mide tu marca en ChatGPT, Gemini y Claude."
  }
};

/** FAQPage. Preguntas desde la búsqueda real; respuestas neutrales y con fuente en la tabla. */
export const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: "¿Cuál es más barata: Profound, Peec AI u Otterly?",
    answer:
      "Para empezar, Otterly: su plan Lite cuesta 29 $/mes y es la única de las tres con todos los precios publicados. Peec AI no muestra importes en su web (PricingSaaS sitúa su Starter, de forma orientativa, en unos 80 $/mes con pago anual) y Profound vende su plan de marca a medida, previa demo."
  },
  {
    question: "¿Qué herramienta cubre más motores de IA?",
    answer:
      "En el plan Enterprise, Peec AI anuncia hasta 13 modelos y Profound hasta 9. En los planes de entrada la cobertura es mucho menor en las dos: Peec AI deja elegir 3 y la prueba de Profound cubre 3. Otterly incluye 4 motores en todos sus planes y vende Gemini, AI Mode y Claude como complementos."
  },
  {
    question: "¿Alguna de las tres tiene interfaz en español?",
    answer:
      "No consta en ninguna. Profound anuncia su interfaz en más de 30 idiomas sin listarlos; Peec AI y Otterly no mencionan idiomas de interfaz y la que hemos visto está en inglés. Si el castellano es un requisito, GenScore es una herramienta en español de principio a fin."
  },
  {
    question: "¿Cuál es mejor para una agencia?",
    answer:
      "Peec AI y Profound tienen modo agencia con espacios de «pitch» para prospectos. Peec AI es la que más claramente permite entregar paneles con la marca de la agencia. Otterly no tiene marca blanca nativa: lo resuelve con Looker Studio desde Standard."
  },
  {
    question: "¿Se pueden probar gratis?",
    answer:
      "Las tres ofrecen prueba gratuita. Profound detalla la suya (7 días, 50 prompts, 3 motores); Peec AI no publica la duración y Otterly da dos cifras distintas en su propia web (7 y 14 días)."
  }
];
