/* prompts-data.jsx — datos de Topics, Prompts, respuestas por motor y fuentes */

const ENGINE_META = {
  gpt: { name: "ChatGPT", color: "#10a37f", short: "G" },
  aio: { name: "Google AI Overviews", color: "#4285f4", short: "AI" },
  ppx: { name: "Perplexity", color: "#20b8cd", short: "P" },
  cld: { name: "Claude", color: "#d97757", short: "C" },
};

// helper para crear respuesta de motor
function R(engine, status, sentiment, competitors, snippet, full, sources) {
  return { engine, status, sentiment, competitors, snippet, full, sources };
}

const PROMPT_ROWS = {
  p1: {
    topic: "t1", text: "¿Cuál es la mejor herramienta de analítica de producto para SaaS B2B?",
    intent: "Comercial", volume: "2,9k", your: ["Mencionada"], brands: 5, sources: 8,
    engines: [
      R("gpt", ["Mencionada"], 35, ["Orbit", "Quanta"],
        "Para equipos SaaS B2B, las opciones más recomendadas son Orbit y Quanta, con onboarding sólido y precios transparentes. Vela también aparece como alternativa…",
        "Para equipos SaaS B2B, las opciones más recomendadas son Orbit y Quanta, que ofrecen un onboarding self-serve sólido y precios transparentes. Vela también aparece como alternativa con buena analítica de cohortes, aunque con menos reseñas públicas. La elección depende de tu volumen de eventos y de las integraciones que necesites.",
        [{ url: "orbit.com/compare", brand: "Orbit" }, { url: "g2.com/categories/product-analytics" }, { url: "vela.io/product/analytics", brand: "Vela", you: true }]),
      R("aio", [], 0, ["Orbit", "Lumio"],
        "Las herramientas de analítica de producto más citadas para B2B incluyen Orbit y Lumio, según comparativas recientes…",
        "Las herramientas de analítica de producto más citadas para B2B incluyen Orbit y Lumio, según comparativas recientes. Se valoran por su facilidad de implementación y sus paneles de retención. Conviene revisar el cumplimiento (SOC 2) si operas con datos sensibles.",
        [{ url: "g2.com/categories/product-analytics" }, { url: "orbit.com/compare", brand: "Orbit" }]),
      R("ppx", ["Mencionada", "Citada"], 60, ["Orbit", "Quanta", "Beacon"],
        "Entre las plataformas líderes están Orbit, Quanta y Beacon. Vela destaca por su analítica de cohortes y precios claros…",
        "Entre las plataformas líderes están Orbit, Quanta y Beacon. Vela destaca por su analítica de cohortes y precios claros, y es citada en varias guías para startups B2B. Orbit lidera en cuota de menciones por su contenido de comparación.",
        [{ url: "vela.io/product/analytics", brand: "Vela", you: true }, { url: "reddit.com/r/analytics" }, { url: "orbit.com/compare", brand: "Orbit" }]),
      R("cld", ["Mencionada"], 20, ["Quanta"],
        "Depende de tus necesidades. Quanta y Vela son opciones sólidas para SaaS B2B; valora el volumen de eventos y el modelo de precios…",
        "Depende de tus necesidades. Quanta y Vela son opciones sólidas para SaaS B2B; valora el volumen de eventos y el modelo de precios por asiento frente a por evento. Para equipos con requisitos de cumplimiento, confirma SOC 2 y residencia de datos.",
        [{ url: "vela.io/pricing", brand: "Vela", you: true }, { url: "quanta.ai/docs", brand: "Quanta" }]),
    ],
  },
  p2: {
    topic: "t1", text: "Mejores herramientas de analítica para equipos de producto en 2026",
    intent: "Comercial", volume: "1,8k", your: [], brands: 4, sources: 6,
    engines: [
      R("gpt", [], 0, ["Orbit", "Quanta", "Lumio"],
        "En 2026 destacan Orbit, Quanta y Lumio por sus capacidades de IA y facilidad de uso…",
        "En 2026 destacan Orbit, Quanta y Lumio por sus capacidades de IA, su facilidad de uso y sus integraciones con el data warehouse. La mayoría ofrece prueba gratuita para evaluar el ajuste.",
        [{ url: "orbit.com/blog/best-2026", brand: "Orbit" }, { url: "g2.com/categories/product-analytics" }]),
      R("ppx", [], 0, ["Orbit", "Beacon"],
        "Las más mencionadas son Orbit y Beacon, con fuerte presencia en comparativas y comunidades…",
        "Las más mencionadas son Orbit y Beacon, con fuerte presencia en comparativas y comunidades como Reddit. Tu marca no aparece entre las citadas para esta consulta.",
        [{ url: "reddit.com/r/ProductManagement" }, { url: "beacon.co/compare", brand: "Beacon" }]),
    ],
  },
  p3: {
    topic: "t1", text: "Comparativa de plataformas de analítica de producto con IA",
    intent: "Comercial", volume: "920", your: ["Citada"], brands: 5, sources: 9,
    engines: [
      R("gpt", ["Citada"], 45, ["Orbit", "Quanta"],
        "Una comparativa habitual incluye Orbit, Quanta y Vela. Vela aporta detección de anomalías y cohortes…",
        "Una comparativa habitual incluye Orbit, Quanta y Vela. Vela aporta detección de anomalías y análisis de cohortes; Orbit lidera en integraciones y Quanta en precio. La fuente más citada es la página de comparación de Orbit.",
        [{ url: "vela.io/compare", brand: "Vela", you: true }, { url: "orbit.com/compare", brand: "Orbit" }, { url: "g2.com/compare" }]),
      R("cld", ["Citada"], 50, ["Quanta"],
        "Vela y Quanta cubren bien las necesidades de equipos de producto; Vela enfatiza la facilidad de configuración…",
        "Vela y Quanta cubren bien las necesidades de equipos de producto; Vela enfatiza la facilidad de configuración y el cumplimiento, mientras Quanta compite en precio. Revisa las integraciones con tu stack.",
        [{ url: "vela.io/compare", brand: "Vela", you: true }, { url: "quanta.ai/pricing", brand: "Quanta" }]),
    ],
  },
  p4: {
    topic: "t2", text: "Alternativas a las plataformas de analítica enterprise",
    intent: "Comercial", volume: "1,4k", your: [], brands: 4, sources: 7,
    engines: [
      R("ppx", [], -10, ["Orbit", "Lumio"],
        "Según G2 y un hilo popular de r/analytics, las alternativas líderes son Orbit y Lumio…",
        "Según G2 y un hilo popular de r/analytics, las alternativas líderes son Orbit y Lumio por su relación precio/capacidad. Tu marca no figura entre las alternativas mencionadas para esta búsqueda.",
        [{ url: "g2.com/categories/product-analytics" }, { url: "reddit.com/r/analytics" }, { url: "orbit.com", brand: "Orbit" }]),
      R("gpt", [], 0, ["Lumio", "Beacon"],
        "Alternativas más económicas incluyen Lumio y Beacon, con planes pensados para equipos pequeños…",
        "Alternativas más económicas incluyen Lumio y Beacon, con planes pensados para equipos pequeños y onboarding rápido. Para migraciones desde enterprise, valora la exportación de datos histórica.",
        [{ url: "lumio.io/pricing", brand: "Lumio" }, { url: "beacon.co", brand: "Beacon" }]),
    ],
  },
  p5: {
    topic: "t2", text: "Herramientas de analítica más baratas que las enterprise para startups",
    intent: "Comercial", volume: "1,1k", your: ["Mencionada"], brands: 3, sources: 5,
    engines: [
      R("gpt", ["Mencionada"], 30, ["Lumio"],
        "Para startups, Lumio y Vela ofrecen planes asequibles con las funciones esenciales…",
        "Para startups, Lumio y Vela ofrecen planes asequibles con las funciones esenciales de analítica de producto y onboarding self-serve. Vela incluye análisis de cohortes en su plan inicial.",
        [{ url: "vela.io/pricing", brand: "Vela", you: true }, { url: "lumio.io/startups", brand: "Lumio" }]),
    ],
  },
  p6: {
    topic: "t3", text: "Cómo medir las métricas de crecimiento product-led",
    intent: "Informacional", volume: "3,6k", your: [], brands: 3, sources: 6,
    engines: [
      R("gpt", [], 0, ["Quanta"],
        "Las métricas clave de PLG incluyen activación, retención y expansión; herramientas como Quanta ayudan a medirlas…",
        "Las métricas clave de PLG incluyen activación, retención y expansión de ingresos. Herramientas como Quanta ayudan a instrumentar eventos y construir embudos. Define tu evento de activación antes de medir.",
        [{ url: "quanta.ai/guides/plg", brand: "Quanta" }, { url: "leanstack.com/plg" }]),
      R("aio", [], 0, [],
        "Para medir el crecimiento product-led, instrumenta eventos de activación, mide la retención por cohortes y sigue la expansión…",
        "Para medir el crecimiento product-led, instrumenta eventos de activación, mide la retención por cohortes y sigue la expansión de ingresos. La consistencia del tracking es más importante que la herramienta concreta.",
        [{ url: "amplitude-guides.example.com" }, { url: "quanta.ai/guides/plg", brand: "Quanta" }]),
    ],
  },
  p7: {
    topic: "t3", text: "Qué es el North Star Metric y cómo elegirlo",
    intent: "Informacional", volume: "2,1k", your: [], brands: 2, sources: 4,
    engines: [
      R("cld", [], 0, [],
        "El North Star Metric es la métrica que mejor captura el valor que entregas al cliente…",
        "El North Star Metric es la métrica que mejor captura el valor que entregas al cliente, como mensajes enviados o proyectos completados. Debe correlacionar con ingresos a largo plazo y ser accionable por los equipos.",
        [{ url: "reforge.com/north-star" }, { url: "leanstack.com/nsm" }]),
    ],
  },
  p8: {
    topic: "t4", text: "Analítica de producto con cumplimiento SOC 2 y HIPAA",
    intent: "Comercial", volume: "640", your: ["Mencionada", "Citada"], brands: 3, sources: 5,
    engines: [
      R("gpt", ["Mencionada", "Citada"], 55, ["Quanta"],
        "Si necesitas cumplimiento, Vela y Quanta ofrecen SOC 2 Tipo II; Vela añade opciones de residencia de datos…",
        "Si necesitas cumplimiento, Vela y Quanta ofrecen SOC 2 Tipo II; Vela añade opciones de residencia de datos y soporte HIPAA en planes enterprise. Solicita el informe de cumplimiento durante la evaluación.",
        [{ url: "vela.io/security", brand: "Vela", you: true }, { url: "quanta.ai/security", brand: "Quanta" }]),
      R("ppx", ["Citada"], 40, [],
        "Vela documenta su cumplimiento SOC 2 y HIPAA en su página de seguridad, citada como fuente fiable…",
        "Vela documenta su cumplimiento SOC 2 y HIPAA en su página de seguridad, citada como fuente fiable. Para HIPAA, confirma la firma del BAA.",
        [{ url: "vela.io/security", brand: "Vela", you: true }]),
    ],
  },
};

const PROMPT_TOPICS = [
  { id: "t1", name: "Mejores herramientas de analítica de producto", region: "us",
    visibility: 62, mentions: 14, volume: "2,9k", trend: [40, 44, 43, 50, 48, 58, 62],
    intent: { Comercial: 64, Informacional: 28, Transaccional: 8 },
    prompts: ["p1", "p2", "p3"] },
  { id: "t2", name: "Alternativas a plataformas de analítica enterprise", region: "us",
    visibility: 28, mentions: 6, volume: "1,4k", trend: [34, 30, 31, 27, 26, 29, 28],
    intent: { Comercial: 78, Informacional: 16, Transaccional: 6 },
    prompts: ["p4", "p5"] },
  { id: "t3", name: "Cómo medir el crecimiento product-led", region: "us",
    visibility: 12, mentions: 2, volume: "3,6k", trend: [10, 11, 9, 12, 11, 12, 12],
    intent: { Informacional: 82, Comercial: 14, Transaccional: 4 },
    prompts: ["p6", "p7"] },
  { id: "t4", name: "Analítica con cumplimiento SOC 2 / HIPAA", region: "us",
    visibility: 71, mentions: 9, volume: "640", trend: [58, 60, 63, 66, 68, 70, 71],
    intent: { Comercial: 70, Informacional: 26, Transaccional: 4 },
    prompts: ["p8"] },
];

window.PROMPT_DATA = { ENGINE_META, PROMPT_TOPICS, PROMPT_ROWS };
