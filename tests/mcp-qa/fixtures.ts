// MCP-CONVERSATIONAL-QA-1 fixtures: ALL values synthetic. No real account data.
export const SCAN = {
  fresh: "2026-11-02T06:00:00Z",
  old: "2026-09-05T06:00:00Z"
};
const mk = (o: any) => ({
  domain: "genscore.es", brand: "Fixture Alfa", scanDate: SCAN.fresh, geoScore: 41,
  lede: "FIXTURE-ALFA: la IA nombra a la marca en el 22% de las respuestas.",
  engines: [
    { provider: "openai", label: "ChatGPT", mentionShare: 0.31 },
    { provider: "gemini", label: "Gemini", mentionShare: 0.17 },
    { provider: "claude", label: "Claude", mentionShare: 0.08 }
  ],
  competitorDomains: ["rival-alfa.test"],
  rivals: [
    { name: "Rival Alfa", share: 0.52, isBrand: false, domain: "rival-alfa.test" },
    { name: "Fixture Alfa", share: 0.22, isBrand: true, domain: "genscore.es" }
  ],
  seoScore: 63,
  plan: [
    { title: "Publica una FAQ alfa", firstStep: "Responde en dos frases a las preguntas de la lista.", engines: ["Gemini"], questions: ["¿Qué mide Fixture Alfa?", "¿Cómo mejora Fixture Alfa en Gemini?"] },
    { title: "Crea la comparativa alfa", firstStep: "Compara con Rival Alfa citando fuente y fecha.", engines: ["ChatGPT", "Claude"], questions: [] }
  ],
  agentic: { kind: "upsell" },
  citingPrompts: null,
  searchConsole: { state: "disconnected" },
  audits: { auditedAt: "2026-11-01T07:00:00Z", readiness: null, page: null, server: null,
    blocks: [{ key: "geo", score: 58, projected: 80, issues: [{ label: "llms.txt ausente", scope: "toda la web", points: 6 }] }, { key: "seo", score: 63, projected: null, issues: [] }] },
  prompts: [
    { text: "¿Qué herramienta mide Fixture Alfa?", topic: "Medición", engines: [{ label: "ChatGPT", cell: { kind: "you", position: 3 } }, { label: "Gemini", cell: { kind: "others" } }, { label: "Claude", cell: { kind: "none" } }] },
    { text: "¿Cómo aparecer en Gemini (alfa)?", topic: "Medición", engines: null }
  ],
  ...o
});
export const PAYLOADS: Record<string, any> = {
  "genscore.es": mk({}),
  "beta-sintetica.test": mk({ domain: "beta-sintetica.test", brand: "Fixture Beta", geoScore: 73, lede: "FIXTURE-BETA: la IA nombra a la marca en el 61% de las respuestas.",
    rivals: [{ name: "Fixture Beta", share: 0.61, isBrand: true, domain: "beta-sintetica.test" }],
    plan: [{ title: "Acción beta única", firstStep: "Paso beta.", engines: ["Claude"], questions: [] }], prompts: [] })
};
const row = (id: string, domain: string, brand: string) => ({ id, name: brand, brand, domain });
export type Fx = { name: string; plan?: string; cap: number; projects: any[]; payloadOverride?: Record<string, any>; load?: "ok" | "timeout" | "internal" };
export const FIXTURES: Record<string, Fx> = {
  data: { name: "cuenta con datos (1 dominio)", cap: 3, projects: [row("p-gs", "genscore.es", "Fixture Alfa")] },
  two: { name: "dos dominios", cap: 3, projects: [row("p-gs", "genscore.es", "Fixture Alfa"), row("p-beta", "beta-sintetica.test", "Fixture Beta")] },
  empty: { name: "cuenta vacía", cap: 3, projects: [] },
  full: { name: "cuenta llena (cap 1)", cap: 1, projects: [row("p-gs", "genscore.es", "Fixture Alfa")] },
  stale: { name: "escaneo antiguo (59 días)", cap: 3, projects: [row("p-gs", "genscore.es", "Fixture Alfa")], payloadOverride: { "genscore.es": { scanDate: SCAN.old } } },
  norecs: { name: "sin recomendaciones (con escaneo)", cap: 3, projects: [row("p-gs", "genscore.es", "Fixture Alfa")], payloadOverride: { "genscore.es": { plan: [] } } },
  noscan: { name: "sin escaneo y sin plan", cap: 3, projects: [row("p-gs", "genscore.es", "Fixture Alfa")], payloadOverride: { "genscore.es": { scanDate: null, geoScore: null, engines: [], rivals: [], plan: [], prompts: [] } } },
  gsc: { name: "Search Console conectado", cap: 3, projects: [row("p-gs", "genscore.es", "Fixture Alfa")], payloadOverride: { "genscore.es": { searchConsole: { state: "connected", empty: false, clicks: 1234, position: 8.4, trend: { impressions: 20000, clicksDeltaPct: 5, impressionsDeltaPct: 2, positionDelta: 0.5, queries: [{ query: "consulta alfa", position: 4.2, clicks: 100, impressions: 900 }], near: [] }, page: null } } } },
  gscreconnect: { name: "Search Console caducado", cap: 3, projects: [row("p-gs", "genscore.es", "Fixture Alfa")], payloadOverride: { "genscore.es": { searchConsole: { state: "reconnect" } } } },
  partial: { name: "respuesta parcial", cap: 3, projects: [row("p-gs", "genscore.es", "Fixture Alfa")], payloadOverride: { "genscore.es": { geoScore: null, engines: [{ provider: "openai", label: "ChatGPT", mentionShare: 0.3 }], rivals: [], seoScore: null, audits: { auditedAt: null, readiness: null, blocks: [], page: null, server: null }, searchConsole: { state: "error" } } } },
  free: { name: "permiso denegado (cuenta en solo lectura)", plan: "free", cap: 3, projects: [row("p-gs", "genscore.es", "Fixture Alfa")] },
  timeout: { name: "timeout", cap: 3, projects: [row("p-gs", "genscore.es", "Fixture Alfa")], load: "timeout" },
  internal: { name: "error interno", cap: 3, projects: [row("p-gs", "genscore.es", "Fixture Alfa")], load: "internal" },
  trial: { name: "prueba de Pro activa", cap: 3, projects: [row("p-gs", "genscore.es", "Fixture Alfa")] }
};
export const REVIEW = (url: string) => ({
  url, host: new URL(url).hostname, title: "FIXTURE page",
  score: { nota: 66, say: "Mejorable (fixture).", alert: null, lanes: { ia: 70, google: 62, agent: null },
    criteria: [{ lane: "ia", label: "llms.txt", value: "no" }], fixes: [{ t: "Añade <code class=\"p\">llms.txt</code>", pts: 5, unit: "pt", why: "porque sí", how: "créalo", where: "raíz" }], shop: null }
});
