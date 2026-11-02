import { describe, expect, it } from "vitest";
import type { ExtProjectPayload } from "@/lib/ext/project-data";
import type { PageReview } from "@/lib/page-review/review";
import {
  PAGE_REVIEW_FAILURE,
  formatAudits,
  formatCompetitors,
  formatDomainSummary,
  formatDomains,
  formatNotFound,
  formatPageReview,
  formatPlanNotice,
  formatPrompts,
  formatRecommendations,
  formatSearchConsole,
  type ToolText
} from "./format";

/**
 * MCP-SERVER-1 (log §418): the scenario battery. One row per state a person
 * can be in when they ask the chat something, and what the answer must let
 * them do next. The rule under test is the one Denis asked for: an answer
 * never ends in a dead end. When the next step lives in the console, the
 * answer carries the exact link (prefilled when we know the domain); when
 * there is nothing to do, it says why.
 */

const BASE = "https://www.genscore.es";
const L = { base: BASE, projectId: "p1" };

const P: ExtProjectPayload = {
  domain: "marca.es",
  brand: "Marca",
  scanDate: "2026-10-31T06:00:00Z",
  geoScore: 54,
  lede: "La IA te nombra en algo menos de la mitad de las respuestas.",
  engines: [{ provider: "openai", label: "ChatGPT", mentionShare: 0.4 }],
  competitorDomains: [],
  rivals: [
    { name: "Rival", share: 0.5, isBrand: false, domain: "rival.es" },
    { name: "Marca", share: 0.33, isBrand: true, domain: "marca.es" }
  ],
  seoScore: 78,
  plan: [
    {
      title: "Sube una FAQ a tu web",
      firstStep: "Responde en dos frases cada una de las preguntas de la lista.",
      engines: ["Gemini"],
      questions: ["¿Qué herramienta mide la visibilidad en ChatGPT?", "¿Cómo aparecer en Gemini?"]
    }
  ],
  agentic: { kind: "upsell" },
  citingPrompts: null,
  searchConsole: { state: "disconnected" },
  audits: { auditedAt: null, readiness: null, blocks: [], page: null },
  prompts: [
    {
      text: "¿Qué herramienta mide la visibilidad en ChatGPT?",
      topic: "Herramientas",
      engines: [
        { label: "ChatGPT", cell: { kind: "you", position: 2 } },
        { label: "Gemini", cell: { kind: "others" } },
        { label: "Claude", cell: { kind: "none" } }
      ]
    },
    { text: "¿Cómo aparecer en Gemini?", topic: "Herramientas", engines: null }
  ]
};

const REVIEW = {
  url: "https://www.otra.es/precios",
  host: "www.otra.es",
  title: "Precios",
  score: {
    nota: 80,
    say: "Bien.",
    alert: null,
    lanes: { ia: 80, google: 80, agent: null },
    criteria: [],
    fixes: [],
    shop: null
  }
} as unknown as PageReview;

type Row = { name: string; answer: () => ToolText; must: Array<string | RegExp> };

const SCENARIOS: Row[] = [
  // listar_dominios
  {
    name: "cuenta sin dominios → enlace al alta",
    answer: () => formatDomains({ base: BASE, email: "a@b.es", planName: "Pro", trialEndsAt: null, domainCap: 3, domains: [] }),
    must: [`${BASE}/dashboard/projects/new`]
  },
  {
    name: "cuenta con hueco → cada dominio con su enlace y «añadir otro»",
    answer: () =>
      formatDomains({ base: BASE, email: null, planName: "Pro", trialEndsAt: null, domainCap: 3, domains: [{ domain: "marca.es", brand: "Marca", projectId: "p1" }] }),
    must: [`${BASE}/dashboard/projects/p1`, `Para añadir otro dominio: ${BASE}/dashboard/projects/new`]
  },
  {
    name: "cuenta llena → dice que no caben más, sin enlace al alta",
    answer: () =>
      formatDomains({ base: BASE, email: null, planName: "Starter", trialEndsAt: null, domainCap: 1, domains: [{ domain: "marca.es", brand: "Marca", projectId: "p1" }] }),
    must: ["ya tiene todos los dominios"]
  },
  // dominio que no es de la cuenta
  {
    name: "dominio ajeno → enlace al alta ya relleno",
    answer: () => formatNotFound("nueva.es", BASE),
    must: [`${BASE}/dashboard/projects/new?dominio=nueva.es`]
  },
  // prueba terminada
  { name: "solo lectura → aviso con enlace informativo", answer: () => formatPlanNotice(), must: ["https://www.genscore.es/precios"] },
  // ver_dominio
  { name: "resumen → enlace a Visión general", answer: () => formatDomainSummary(P, L), must: [`${BASE}/dashboard/projects/p1`] },
  {
    name: "sin escaneo → lo dice y enlaza donde aparecerá",
    answer: () => formatDomainSummary({ ...P, geoScore: null, engines: [] }, L),
    must: ["todavía no tiene un escaneo completado", `${BASE}/dashboard/projects/p1`]
  },
  // ver_recomendaciones
  {
    name: "plan → la lista de preguntas a la que remite el primer paso",
    answer: () => formatRecommendations(P, L),
    must: ["«¿Qué herramienta mide la visibilidad en ChatGPT?»", `${BASE}/dashboard/projects/p1/recommendations`]
  },
  {
    name: "plan vacío → lo dice y enlaza",
    answer: () => formatRecommendations({ ...P, plan: [] }, L),
    must: ["no tiene acciones pendientes", "/recommendations"]
  },
  // ver_competidores
  {
    name: "competidores → ranking y cómo seguir otra marca",
    answer: () => formatCompetitors(P, L),
    must: [`${BASE}/dashboard/projects/p1/competitors`, "revise su web"]
  },
  // ver_prompts
  {
    name: "prompts → qué hizo cada motor, los pendientes y dónde añadir más",
    answer: () => formatPrompts(P, L),
    must: [
      "«¿Qué herramienta mide la visibilidad en ChatGPT?»: te nombra ChatGPT (puesto 2); Gemini solo nombra a otras marcas; Claude no nombra ninguna marca.",
      "«¿Cómo aparecer en Gemini?»: pendiente del próximo escaneo.",
      `${BASE}/dashboard/projects/p1/prompts`
    ]
  },
  {
    name: "sin prompts → lo dice y enlaza a añadirlos",
    answer: () => formatPrompts({ ...P, prompts: [] }, L),
    must: ["no tiene prompts activos", "/prompts"]
  },
  // ver_auditorias
  {
    name: "sin auditoría → cuándo llega y dónde mirarla",
    answer: () => formatAudits(P, L),
    must: ["Se hace sola", "/web-audit"]
  },
  // ver_posicion_google
  {
    name: "Search Console sin conectar → permiso directo de Google",
    answer: () => formatSearchConsole(P, L),
    must: [`${BASE}/api/search-console/connect?projectId=p1`]
  },
  {
    name: "permiso caducado → reconectar directo",
    answer: () => formatSearchConsole({ ...P, searchConsole: { state: "reconnect" } }, L),
    must: ["caducado", "/api/search-console/connect?projectId=p1"]
  },
  {
    name: "conectado sin propiedad → elegirla en Posición en Google",
    answer: () => formatSearchConsole({ ...P, searchConsole: { state: "pick_property" } }, L),
    must: [`${BASE}/dashboard/projects/p1/search-console`]
  },
  // revisar_pagina
  {
    name: "página ajena con cuenta → medirla como dominio o seguirla como competidor",
    answer: () =>
      formatPageReview(REVIEW, null, { base: BASE, account: { projects: [{ domain: "marca.es", projectId: "p1" }], canAddDomain: true } }),
    must: [`${BASE}/dashboard/projects/new?dominio=otra.es`, `${BASE}/dashboard/projects/p1/competitors?nuevo=otra.es`]
  },
  {
    name: "página ajena con la cuenta llena → sólo competidor",
    answer: () =>
      formatPageReview(REVIEW, null, { base: BASE, account: { projects: [{ domain: "marca.es", projectId: "p1" }], canAddDomain: false } }),
    must: ["competitors?nuevo=otra.es"]
  },
  {
    name: "página sin cuenta → medir la marca en GenScore, con el alta rellena (log §425)",
    answer: () => formatPageReview(REVIEW, null, { base: BASE, account: null }),
    must: [`${BASE}/signup?dominio=otra.es&utm_source=claude&utm_medium=mcp&utm_campaign=revisar_pagina`, "Con tu cuenta de GenScore conectada"]
  },
  {
    name: "página sin cuenta en ChatGPT → el mismo alta, sin hablar de la prueba",
    answer: () => formatPageReview(REVIEW, null, { base: BASE, profile: "chatgpt", account: null }),
    must: ["/signup?dominio=otra.es&utm_source=chatgpt", /^(?![\s\S]*(gratis|prueba|tarjeta))/]
  },
  { name: "web con anti-bots → alternativa (la extensión)", answer: () => ({ text: PAGE_REVIEW_FAILURE.blocked }), must: ["extensión de Chrome"] }
];

describe("MCP scenario battery: every answer has a next step (log §418)", () => {
  for (const s of SCENARIOS) {
    it(s.name, () => {
      const text = s.answer().text;
      for (const m of s.must) {
        if (typeof m === "string") expect(text).toContain(m);
        else expect(text).toMatch(m);
      }
      expect(text).not.toContain("—");
      expect(text).not.toMatch(/€|checkout|stripe|sube de plan|mejora tu plan/i);
    });
  }

  it("a full account never gets the add-domain link", () => {
    const t = formatDomains({ base: BASE, email: null, planName: "Starter", trialEndsAt: null, domainCap: 1, domains: [{ domain: "marca.es", brand: "Marca", projectId: "p1" }] }).text;
    expect(t).not.toContain("/projects/new");
    const r = formatPageReview(REVIEW, null, { base: BASE, account: { projects: [{ domain: "marca.es", projectId: "p1" }], canAddDomain: false } }).text;
    expect(r).not.toContain("/projects/new");
  });

  it("an anonymous review never links into a console it cannot open", () => {
    const t = formatPageReview(REVIEW, null, { base: BASE, account: null }).text;
    expect(t).not.toContain("/dashboard/");
  });

  it("encodes the prefilled domain", () => {
    expect(formatNotFound("a b.es", BASE).text).toContain("?dominio=a%20b.es");
  });
});
