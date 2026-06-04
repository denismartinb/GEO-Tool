/* citations-data.jsx — Páginas citadas (URLs que la IA cita en los prompts) */

const CIT_CATS = {
  brand:      { label: "Tu marca", tone: "accent" },
  competitor: { label: "Competidor", tone: "neg" },
  reviews:    { label: "Reseñas", tone: "info" },
  community:  { label: "Comunidad", tone: "warn" },
  media:      { label: "Medio", tone: "neutral" },
};

// engines: gpt, aio, ppx, cld (usa PROMPT_DATA.ENGINE_META para color/nombre)
const CITATIONS = [
  {
    id: "u1", title: "Comparativa: las mejores herramientas de analítica de producto 2026",
    url: "g2.com/categories/product-analytics", domain: "g2.com", cat: "reviews",
    brandMentioned: "no", competitors: ["Orbit", "Quanta", "Lumio"], cited: 38,
    prompts: [
      { q: "¿Cuál es la mejor herramienta de analítica de producto para SaaS B2B?", mentions: 13, engines: ["gpt", "aio", "ppx", "cld"] },
      { q: "Mejores alternativas a las plataformas de analítica enterprise", mentions: 9, engines: ["gpt", "aio", "ppx"] },
      { q: "¿Qué herramienta de analítica usan las mejores empresas SaaS?", mentions: 6, engines: ["gpt", "aio"] },
      { q: "Comparativa de plataformas de analítica de producto con IA", mentions: 4, engines: ["gpt", "ppx"] },
    ],
  },
  {
    id: "u2", title: "Hilo: ¿qué herramienta de analítica usáis y por qué?",
    url: "reddit.com/r/analytics/comments/best-tools", domain: "reddit.com", cat: "community",
    brandMentioned: "no", competitors: ["Orbit", "Beacon"], cited: 31,
    prompts: [
      { q: "Mejores alternativas a las plataformas de analítica enterprise", mentions: 8, engines: ["ppx", "gpt"] },
      { q: "Cómo medir las métricas de crecimiento product-led", mentions: 5, engines: ["ppx", "aio"] },
      { q: "¿Qué herramienta de analítica usan las mejores empresas SaaS?", mentions: 3, engines: ["ppx"] },
    ],
  },
  {
    id: "u3", title: "Orbit vs. la competencia — tabla comparativa",
    url: "orbit.com/compare", domain: "orbit.com", cat: "competitor",
    brandMentioned: "no", competitors: ["Orbit"], cited: 23,
    prompts: [
      { q: "¿Cuál es la mejor herramienta de analítica de producto para SaaS B2B?", mentions: 11, engines: ["gpt", "aio"] },
      { q: "Comparativa de plataformas de analítica de producto con IA", mentions: 7, engines: ["gpt", "cld"] },
      { q: "Herramientas de analítica con integración nativa con el data warehouse", mentions: 5, engines: ["gpt"] },
    ],
  },
  {
    id: "u4", title: "Vela · Analítica de producto para equipos B2B",
    url: "vela.io/product/analytics", domain: "vela.io", cat: "brand",
    brandMentioned: "na", competitors: [], cited: 14,
    prompts: [
      { q: "Comparativa de plataformas de analítica de producto con IA", mentions: 6, engines: ["gpt", "ppx", "cld"] },
      { q: "Analítica de producto con cumplimiento SOC 2 y HIPAA", mentions: 5, engines: ["gpt", "ppx"] },
      { q: "Plataformas de analítica con detección de anomalías por IA", mentions: 3, engines: ["cld"] },
    ],
  },
  {
    id: "u5", title: "Las mejores plataformas de analítica de producto, comparadas",
    url: "techradar.com/best-product-analytics", domain: "techradar.com", cat: "media",
    brandMentioned: "yes", competitors: ["Orbit", "Quanta"], cited: 12,
    prompts: [
      { q: "¿Cuál es la mejor herramienta de analítica de producto para SaaS B2B?", mentions: 7, engines: ["aio", "gpt"] },
      { q: "¿Qué herramienta de analítica usan las mejores empresas SaaS?", mentions: 5, engines: ["aio"] },
    ],
  },
  {
    id: "u6", title: "Vela · Seguridad y cumplimiento (SOC 2, HIPAA)",
    url: "vela.io/security", domain: "vela.io", cat: "brand",
    brandMentioned: "na", competitors: [], cited: 11,
    prompts: [
      { q: "Analítica de producto con cumplimiento SOC 2 y HIPAA", mentions: 8, engines: ["gpt", "ppx"] },
      { q: "Herramientas de analítica con integración nativa con el data warehouse", mentions: 3, engines: ["gpt"] },
    ],
  },
  {
    id: "u7", title: "Software de analítica de producto — opiniones de usuarios",
    url: "capterra.com/product-analytics-software", domain: "capterra.com", cat: "reviews",
    brandMentioned: "no", competitors: ["Lumio", "Beacon"], cited: 9,
    prompts: [
      { q: "Analítica asequible para startups en fase temprana", mentions: 5, engines: ["aio", "gpt"] },
      { q: "Mejores alternativas a las plataformas de analítica enterprise", mentions: 4, engines: ["gpt"] },
    ],
  },
  {
    id: "u8", title: "Guía: cómo medir el crecimiento product-led",
    url: "reforge.com/north-star", domain: "reforge.com", cat: "media",
    brandMentioned: "no", competitors: ["Quanta"], cited: 8,
    prompts: [
      { q: "Qué es el North Star Metric y cómo elegirlo", mentions: 6, engines: ["cld", "gpt"] },
      { q: "Cómo medir las métricas de crecimiento product-led", mentions: 2, engines: ["aio"] },
    ],
  },
];

window.CIT_DATA = { CIT_CATS, CITATIONS };
