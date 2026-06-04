/* competitors-data.jsx — datos para la pantalla de Competidores (GEO competitivo) */

// visibilidad y menciones por plataforma. sov se calcula a partir de menciones.
const PLATFORMS = [
  { id: "all", name: "Todos los motores", short: "Todos" },
  { id: "gpt", name: "ChatGPT", short: "ChatGPT", color: "#10a37f" },
  { id: "aio", name: "Google AI Overviews", short: "AI Overviews", color: "#4285f4" },
  { id: "ppx", name: "Perplexity", short: "Perplexity", color: "#20b8cd" },
  { id: "cld", name: "Claude", short: "Claude", color: "#d97757" },
];

// rank base (ordenado por visibilidad en 'all'). you = tu marca.
const CB = [
  { name: "Orbit",  domain: "orbit.com",  color: "#0e9488", initial: "O", sentiment: 38, coverage: 89, trend: [38,40,39,41,42,42,43],
    plat: { all: { vis: 43, m: 210 }, gpt: { vis: 47, m: 78 }, aio: { vis: 41, m: 56 }, ppx: { vis: 44, m: 44 }, cld: { vis: 36, m: 32 } } },
  { name: "Quanta", domain: "quanta.ai",  color: "#d9772b", initial: "Q", sentiment: 44, coverage: 75, trend: [33,34,35,36,37,38,38],
    plat: { all: { vis: 38, m: 178 }, gpt: { vis: 40, m: 70 }, aio: { vis: 33, m: 44 }, ppx: { vis: 41, m: 38 }, cld: { vis: 39, m: 26 } } },
  { name: "Beacon", domain: "beacon.co",  color: "#9333a8", initial: "B", sentiment: 31, coverage: 72, trend: [31,30,30,29,29,29,29],
    plat: { all: { vis: 29, m: 170 }, gpt: { vis: 28, m: 64 }, aio: { vis: 31, m: 48 }, ppx: { vis: 26, m: 34 }, cld: { vis: 30, m: 24 } } },
  { name: "Lumio",  domain: "lumio.io",   color: "#3b6fd6", initial: "L", sentiment: 44, coverage: 41, trend: [18,19,19,20,20,21,21],
    plat: { all: { vis: 21, m: 115 }, gpt: { vis: 19, m: 40 }, aio: { vis: 24, m: 36 }, ppx: { vis: 20, m: 22 }, cld: { vis: 22, m: 17 } } },
  { name: "Vela",   domain: "vela.io",    color: "#6366f1", initial: "V", you: true, sentiment: 35, coverage: 49, trend: [12,13,14,15,16,17,18],
    plat: { all: { vis: 18, m: 96 }, gpt: { vis: 22, m: 40 }, aio: { vis: 16, m: 22 }, ppx: { vis: 14, m: 20 }, cld: { vis: 19, m: 14 } } },
];

// marcas adicionales detectadas (se muestran al expandir)
const CB_MORE = [
  { name: "Metricly", domain: "metricly.com", color: "#0891b2", initial: "M", sentiment: 29, coverage: 33, trend: [10,11,11,12,12,13,13],
    plat: { all: { vis: 13, m: 77 }, gpt: { vis: 12, m: 28 }, aio: { vis: 15, m: 22 }, ppx: { vis: 11, m: 16 }, cld: { vis: 14, m: 11 } } },
  { name: "Pulse", domain: "pulsehq.com", color: "#e0457b", initial: "P", sentiment: 49, coverage: 26, trend: [8,8,9,9,10,10,11],
    plat: { all: { vis: 11, m: 62 }, gpt: { vis: 10, m: 24 }, aio: { vis: 9, m: 16 }, ppx: { vis: 13, m: 14 }, cld: { vis: 12, m: 8 } } },
  { name: "Cohort", domain: "cohort.io", color: "#7c3aed", initial: "C", sentiment: 37, coverage: 22, trend: [7,7,7,8,8,8,8],
    plat: { all: { vis: 8, m: 52 }, gpt: { vis: 7, m: 20 }, aio: { vis: 9, m: 14 }, ppx: { vis: 8, m: 12 }, cld: { vis: 9, m: 6 } } },
];

// matriz de gap de prompts
const GAP = [
  { q: "¿Cuál es la mejor herramienta de analítica de producto para SaaS B2B?", intent: "Comercial", volume: "2,9k", gap: "weak",
    competitors: ["Orbit", "Quanta"], youPos: 4, youSent: 20, leaderPos: 1 },
  { q: "Mejores alternativas a las plataformas de analítica enterprise", intent: "Comercial", volume: "1,4k", gap: "missing",
    competitors: ["Orbit", "Lumio"], youPos: null, youSent: null, leaderPos: 1 },
  { q: "Comparativa de plataformas de analítica de producto con IA", intent: "Comercial", volume: "920", gap: "shared",
    competitors: ["Orbit", "Quanta"], youPos: 2, youSent: 50, leaderPos: 1 },
  { q: "Analítica de producto con cumplimiento SOC 2 y HIPAA", intent: "Comercial", volume: "640", gap: "shared",
    competitors: ["Quanta"], youPos: 1, youSent: 55, leaderPos: 1 },
  { q: "Cómo medir las métricas de crecimiento product-led", intent: "Informacional", volume: "3,6k", gap: "missing",
    competitors: ["Quanta", "Beacon"], youPos: null, youSent: null, leaderPos: 1 },
  { q: "Herramientas de analítica con integración nativa con el data warehouse", intent: "Comercial", volume: "1,1k", gap: "missing",
    competitors: ["Orbit", "Lumio"], youPos: null, youSent: null, leaderPos: 1 },
  { q: "¿Qué herramienta de analítica usan las mejores empresas SaaS?", intent: "Comercial", volume: "1,8k", gap: "weak",
    competitors: ["Orbit", "Beacon"], youPos: 5, youSent: 15, leaderPos: 1 },
  { q: "Plataformas de analítica con detección de anomalías por IA", intent: "Comercial", volume: "540", gap: "shared",
    competitors: ["Quanta"], youPos: 2, youSent: 45, leaderPos: 1 },
];

// fuentes de citación
const SOURCES = [
  { domain: "g2.com", type: "Reseñas", citations: 38, cites: ["Orbit", "Quanta", "Lumio"], youCited: false, url: "g2.com/categories/product-analytics" },
  { domain: "reddit.com", type: "Comunidad", citations: 31, cites: ["Orbit", "Beacon"], youCited: false, url: "reddit.com/r/analytics/comments/best-tools" },
  { domain: "orbit.com", type: "Web de marca", citations: 23, cites: ["Orbit"], youCited: false, url: "orbit.com/compare" },
  { domain: "vela.io", type: "Tu web", citations: 14, cites: ["Vela"], youCited: true, url: "vela.io/product/analytics" },
  { domain: "techradar.com", type: "Medio", citations: 12, cites: ["Orbit", "Quanta"], youCited: false, url: "techradar.com/best-product-analytics" },
  { domain: "capterra.com", type: "Reseñas", citations: 11, cites: ["Lumio", "Beacon"], youCited: false, url: "capterra.com/product-analytics-software" },
];

window.COMP_DATA = { PLATFORMS, CB, CB_MORE, GAP, SOURCES };
