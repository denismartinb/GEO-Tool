/* data.jsx — dataset de ejemplo para GEO Studio (marca ficticia "Vela") */

const PROJECT = {
  name: "Vela Analytics",
  domain: "vela.io",
  country: "Estados Unidos",
  countryCode: "us",
  language: "Inglés",
  lastScan: "28 may 2026",
  promptCount: 64,
  competitorCount: 5,
  runCount: 7,
};

// tokens de color de marca + competidores
const BRAND = { name: "Vela", domain: "vela.io", color: "#4f46e5", initial: "V", you: true };
const COMPETITORS = [
  { name: "Orbit",  domain: "orbit.com",   color: "#0e9488", initial: "O", mention: 43, citation: 31, sov: 27, delta: +4 },
  { name: "Quanta", domain: "quanta.ai",   color: "#d9772b", initial: "Q", mention: 38, citation: 24, sov: 22, delta: +2 },
  { name: "Beacon", domain: "beacon.co",   color: "#9333a8", initial: "B", mention: 29, citation: 19, sov: 17, delta: -1 },
  { name: "Lumio",  domain: "lumio.io",    color: "#3b6fd6", initial: "L", mention: 21, citation: 12, sov: 11, delta: +1 },
];
const BRAND_ROW = { ...BRAND, mention: 18, citation: 9, sov: 13, delta: +3 };

// tarjetas de puntuación
const SCORES = {
  geo:       { value: 41, max: 100, label: "Puntuación de visibilidad GEO", trend: [33,35,34,38,37,40,41], delta: +6, status: "Mejorando",
    tip: "Una puntuación compuesta de 0 a 100 sobre la frecuencia y prominencia con que los motores de IA muestran tu marca en los prompts monitorizados. Combina tasa de mención, tasa de cita y posición en la respuesta." },
  mention:   { value: 18, unit: "%", label: "Tasa de mención", trend: [12,13,14,15,16,17,18], delta: +3,
    tip: "Porcentaje de tus prompts monitorizados en los que las respuestas de IA mencionan tu marca por su nombre — citada o no." },
  citation:  { value: 9,  unit: "%", label: "Tasa de cita", trend: [5,6,6,7,8,8,9], delta: +2,
    tip: "Porcentaje de respuestas de IA que enlazan o citan vela.io como fuente. Las citas tienen más peso que las menciones simples." },
  gap:       { value: 2.4, unit: "×", label: "Diferencia vs competidor", trend: [3.1,3.0,2.9,2.7,2.6,2.5,2.4], delta: -0.3, invert: true,
    tip: "Cuánto más se menciona tu competidor más fuerte (Orbit) frente a ti. Cuanto más bajo, mejor — estás recortando distancia." },
  confidence:{ value: 86, unit: "%", label: "Confianza", trend: [70,74,78,80,82,84,86], delta: +4,
    tip: "Cómo de fiables son estos insights, según la cobertura de prompts, la actualidad del escaneo y la consistencia de las respuestas entre motores." },
};

// distribución por motor de IA
const LLMS = [
  { name: "ChatGPT",          short: "GPT",  share: 38, mention: 22, color: "#10a37f" },
  { name: "Google AI Overviews", short: "AIO", share: 27, mention: 16, color: "#4285f4" },
  { name: "Perplexity",       short: "PPX",  share: 19, mention: 14, color: "#20b8cd" },
  { name: "Claude",           short: "CLD",  share: 16, mention: 19, color: "#d97757" },
];

// páginas fuente más citadas (para la sección de visibilidad de marca)
const CITED_PAGES = [
  { url: "vela.io/product/analytics", cites: 14, prompts: 9, you: true },
  { url: "g2.com/products/vela",      cites: 11, prompts: 7, you: false },
  { url: "orbit.com/compare",         cites: 23, prompts: 15, you: false },
  { url: "reddit.com/r/analytics",    cites: 9,  prompts: 6, you: false },
];

// oportunidades de prompts — el competidor gana, la marca está ausente
const OPPORTUNITIES = [
  { q: "¿Cuál es la mejor herramienta de analítica de producto para SaaS B2B?", intent: "Comercial", value: "Alto",
    competitors: ["Orbit","Quanta","Beacon"], cited: ["Orbit","Quanta"], volume: "2,9k", engines: 4 },
  { q: "Mejores alternativas a las plataformas de analítica enterprise", intent: "Comercial", value: "Alto",
    competitors: ["Orbit","Lumio"], cited: ["Orbit"], volume: "1,4k", engines: 3 },
  { q: "Cómo medir las métricas de crecimiento product-led", intent: "Informacional", value: "Medio",
    competitors: ["Quanta","Beacon"], cited: ["Quanta"], volume: "3,6k", engines: 4 },
  { q: "Analítica asequible para startups en fase temprana", intent: "Comercial", value: "Alto",
    competitors: ["Lumio","Beacon"], cited: ["Lumio"], volume: "1,1k", engines: 2 },
];

// recomendaciones — el corazón del producto
const RECS = [
  {
    id: 1, priority: "high", rank: 1, status: "open",
    category: "Contenido", type: "Preparación para cita",
    title: "Añade contenido de FAQ listo para citar en prompts de comparación de alto valor",
    problem: "Los competidores se mencionan en 7 prompts de comparación donde Vela nunca aparece. Orbit es citado en 4 de ellos como la opción recomendada.",
    why: "Los motores de IA prefieren bloques de preguntas y comparación claros y estructurados al generar respuestas tipo recomendación. Sin ellos, tus páginas no pueden ser citadas como fuente.",
    impact: 5, effort: 2, confidence: 88, seoRisk: "Bajo",
    evidence: {
      engine: "ChatGPT", prompt: "¿Cuál es la mejor herramienta de analítica de producto para SaaS B2B?",
      quote: "Para equipos SaaS B2B, las opciones más recomendadas son Orbit y Quanta, que ofrecen un onboarding self-serve sólido y precios transparentes…",
      mentions: ["Orbit","Quanta"], cited: "orbit.com/compare",
    },
    action: "Añade una sección de FAQ estructurada y un bloque de comparación conciso en /product/analytics enfocado a los 7 prompts donde gana Orbit.",
    genKind: "Bloque de FAQ",
    metrics: { affectedPrompts: 7, est: "+6–9% tasa de mención" },
  },
  {
    id: 2, priority: "high", rank: 2, status: "open",
    category: "Técnico", type: "Rastreabilidad",
    title: "Permite que los rastreadores de IA lean tus páginas de producto de mayor intención",
    problem: "Tu robots.txt bloquea GPTBot y PerplexityBot. 3 de tus 5 páginas comerciales principales no pueden ser leídas por los motores de IA, así que no pueden ser citadas.",
    why: "Si el rastreador de un motor de IA no puede leer una página, esa página nunca podrá aparecer como fuente — por muy bueno que sea el contenido. Es el desbloqueo más rápido.",
    impact: 5, effort: 1, confidence: 95, seoRisk: "Ninguno",
    evidence: {
      engine: "Comprobación de rastreo", prompt: "Acceso de robots — vela.io/pricing",
      quote: "Disallow: /pricing → GPTBot bloqueado. PerplexityBot bloqueado. La página no es elegible para cita en 2 de 4 motores.",
      mentions: [], cited: "vela.io/robots.txt",
    },
    action: "Actualiza robots.txt para permitir GPTBot, PerplexityBot y Google-Extended en /product, /pricing y /compare.",
    genKind: "Reglas de robots.txt",
    metrics: { affectedPrompts: 12, est: "Desbloquea 3 páginas" },
  },
  {
    id: 3, priority: "high", rank: 3, status: "in-progress",
    category: "Contenido", type: "Cobertura de entidades",
    title: "Cubre las entidades que faltan en la landing de analítica",
    problem: "La landing principal de Vela carece de 9 entidades que los motores de IA asocian a esta categoría, como «análisis de cohortes», «residencia de datos» y «SOC 2».",
    why: "Los modelos de IA emparejan contenido con consultas mediante entidades y conceptos. Si faltan las entidades que pregunta el comprador, tu página no se recupera para esas preguntas.",
    impact: 4, effort: 3, confidence: 81, seoRisk: "Bajo",
    evidence: {
      engine: "Auditoría de contenido", prompt: "Brecha de entidades — /product/analytics",
      quote: "Entidades de alto valor ausentes: análisis de cohortes, residencia de datos, SOC 2, reverse ETL, HIPAA, session replay, detección de anomalías, +2 más.",
      mentions: [], cited: "vela.io/product/analytics",
    },
    action: "Amplía la página con una sección de capacidades que cubra las 9 entidades ausentes, escrita en frases claras y citables.",
    genKind: "Sección de contenido",
    metrics: { affectedPrompts: 18, est: "+4–7% tasa de mención" },
  },
  {
    id: 4, priority: "med", rank: 4, status: "open",
    category: "Técnico", type: "Schema",
    title: "Añade datos estructurados a las páginas de comparación y precios",
    problem: "Tus páginas de comparación no tienen schema FAQPage ni Product. Los competidores que usan schema son citados literalmente en las respuestas de IA.",
    why: "Los datos estructurados dan a los motores una versión limpia y legible por máquina de tu respuesta, haciéndola mucho más probable de copiarse textualmente en una respuesta.",
    impact: 3, effort: 2, confidence: 76, seoRisk: "Ninguno",
    evidence: {
      engine: "Auditoría de contenido", prompt: "Comprobación de schema — /compare",
      quote: "No se detecta schema FAQPage, Product ni Offer. La página /compare de Orbit expone FAQPage con 12 pares de pregunta-respuesta.",
      mentions: ["Orbit"], cited: "orbit.com/compare",
    },
    action: "Añade schema FAQPage y Product a /compare y /pricing para exponer tus respuestas en formato legible por máquina.",
    genKind: "Schema JSON-LD",
    metrics: { affectedPrompts: 6, est: "+2–4% tasa de cita" },
  },
  {
    id: 5, priority: "med", rank: 5, status: "open",
    category: "Autoridad", type: "Externo",
    title: "Consigue menciones en fuentes externas en las que confían los motores de IA",
    problem: "Los motores citan mucho G2, Reddit y recopilatorios de reseñas en esta categoría. Vela tiene poca presencia en las fuentes de las que más beben.",
    why: "Las respuestas de IA se apoyan en agregadores y fuentes de comunidad para las recomendaciones. La presencia ahí determina si te nombran o no.",
    impact: 4, effort: 4, confidence: 68, seoRisk: "Ninguno",
    evidence: {
      engine: "Perplexity", prompt: "Mejores alternativas a las plataformas de analítica enterprise",
      quote: "Según G2 y un hilo popular de r/analytics, las alternativas líderes son Orbit y Lumio…",
      mentions: ["Orbit","Lumio"], cited: "g2.com/categories/product-analytics",
    },
    action: "Prioriza una presencia de categoría en G2 y una colocación en un recopilatorio comparativo. (Fuera de la plataforma — se monitoriza como campaña.)",
    genKind: null,
    metrics: { affectedPrompts: 9, est: "+3–5% tasa de mención" },
  },
  {
    id: 6, priority: "low", rank: 6, status: "open",
    category: "Contenido", type: "Actualidad",
    title: "Actualiza el informe de benchmarks de 2024 con datos actuales",
    problem: "Tu activo más citado es de 2024. Los motores prefieren cada vez más fuentes recientes para respuestas sensibles al tiempo.",
    why: "La actualidad es una señal de ranking para las respuestas de IA en temas que evolucionan. Las fechas antiguas reducen en silencio la frecuencia con que te eligen.",
    impact: 2, effort: 2, confidence: 72, seoRisk: "Bajo",
    evidence: {
      engine: "ChatGPT", prompt: "Últimos benchmarks de analítica de producto",
      quote: "Según los datos de 2025 del informe anual de Orbit…",
      mentions: ["Orbit"], cited: "orbit.com/benchmarks-2025",
    },
    action: "Actualiza el informe de benchmarks con cifras de 2026 y una fecha de publicación claramente visible.",
    genKind: "Esquema del informe",
    metrics: { affectedPrompts: 4, est: "+1–2% tasa de cita" },
  },
];

const REC_SUMMARY = {
  total: 12, high: 4, med: 5, low: 3,
  quickWins: 3, // alto impacto, bajo esfuerzo
};

window.GEO_DATA = { PROJECT, BRAND, BRAND_ROW, COMPETITORS, SCORES, LLMS, CITED_PAGES, OPPORTUNITIES, RECS, REC_SUMMARY };
