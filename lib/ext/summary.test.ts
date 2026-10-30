import { describe, expect, it } from "vitest";
import type { ReportAnswer, ReportModel } from "@/lib/report/report-model";
import { buildExtProjectSummary, findCitingPrompts, pageKey, toExtAgentic } from "./summary";

const label = (p: string) => ({ openai: "ChatGPT", gemini: "Gemini", claude: "Claude", perplexity: "Perplexity" })[p] ?? p;

function answer(promptId: string, provider: string, citations: unknown[], mentioned = false): ReportAnswer {
  return {
    promptId,
    promptText: `Pregunta ${promptId}`,
    topic: null,
    provider,
    rawText: "",
    extracted: { brand: { mentioned }, citations } as ReportAnswer["extracted"]
  };
}

const grounding = (url: string) => ({ source: "grounding", url, domain: new URL(url).hostname, title: "t" });

function model(over: Partial<ReportModel> = {}): ReportModel {
  return {
    brandName: "Marca",
    domain: "marca.es",
    scanDate: "2026-10-29T08:00:00Z",
    geoScore: 47,
    engines: [
      { provider: "openai", label: "ChatGPT", mentionShare: 0.38, bestPosition: 2, citesOwnSite: true },
      { provider: "gemini", label: "Gemini", mentionShare: 0.52, bestPosition: 1, citesOwnSite: false }
    ],
    cover: { mentionShare: 0.4 },
    summary: { lede: "Te nombran en el 40% de las respuestas.", ownCitationShare: null, weakestEngine: null as never, technicalScore: 68, findings: [] },
    matrix: { hasCoverage: false, groups: [] },
    competition: {
      bars: [
        { name: "Rival Uno", isBrand: false, share: 0.6, byEngine: [] },
        { name: "Rival Dos", isBrand: false, share: 0.5, byEngine: [] },
        { name: "Rival Tres", isBrand: false, share: 0.45, byEngine: [] },
        { name: "Rival Cuatro", isBrand: false, share: 0.42, byEngine: [] },
        { name: "Rival Cinco", isBrand: false, share: 0.41, byEngine: [] },
        { name: "Marca", isBrand: true, share: 0.4, byEngine: [] }
      ],
      cards: [],
      cloud: []
    },
    sources: null,
    technical: { score: 68, coverageShare: null, checks: [], reading: null },
    plan: [1, 2, 3, 4].map((i) => ({ title: `Acción ${i}`, description: "", firstStep: `Paso ${i}`, providers: [], topics: [], engineLabels: ["Gemini"] })),
    ...over
  };
}

describe("pageKey", () => {
  it("treats scheme, www, trailing slash, query and fragment as the same page", () => {
    expect(pageKey("https://www.marca.es/precios/?utm=1#a")).toBe(pageKey("http://marca.es/precios"));
    expect(pageKey("https://marca.es/")).toBe("marca.es/");
  });
  it("rejects what is not a web page", () => {
    expect(pageKey("chrome://extensions")).toBeNull();
    expect(pageKey("no es una url")).toBeNull();
  });
});

describe("findCitingPrompts", () => {
  it("groups by prompt, lists each engine once and says whether the brand was named", () => {
    const answers = [
      answer("p1", "openai", [grounding("https://www.marca.es/precios/")]),
      answer("p1", "gemini", [grounding("https://marca.es/precios")], true),
      answer("p1", "gemini", [grounding("https://marca.es/precios")]),
      answer("p2", "openai", [grounding("https://marca.es/otra")])
    ];
    expect(findCitingPrompts(answers, "https://marca.es/precios", label)).toEqual([
      { text: "Pregunta p1", engines: ["ChatGPT", "Gemini"], mentioned: true }
    ]);
  });
  it("ignores citations without a resolved page url", () => {
    const answers = [answer("p1", "openai", [{ source: "grounding", domain: "marca.es", title: "x" }])];
    expect(findCitingPrompts(answers, "https://marca.es/", label)).toEqual([]);
  });
});

describe("buildExtProjectSummary", () => {
  const base = { project: { domain: "marca.es", brand: "Marca" }, answers: [], agentic: { kind: "hidden" } as const, engineLabel: label };

  it("takes the figures from the report model as they are, as shares", () => {
    const s = buildExtProjectSummary({ ...base, model: model(), url: null });
    expect(s.geoScore).toBe(47);
    expect(s.seoScore).toBe(68);
    expect(s.engines).toEqual([
      { provider: "openai", label: "ChatGPT", mentionShare: 0.38 },
      { provider: "gemini", label: "Gemini", mentionShare: 0.52 }
    ]);
    expect(s.plan.map((p) => p.title)).toEqual(["Acción 1", "Acción 2", "Acción 3"]);
    expect(s.citingPrompts).toBeNull();
  });

  it("keeps the brand in the rival list even below the top four", () => {
    const s = buildExtProjectSummary({ ...base, model: model(), url: null });
    expect(s.rivals.map((r) => r.name)).toEqual(["Rival Uno", "Rival Dos", "Rival Tres", "Rival Cuatro", "Marca"]);
    expect(s.rivals.at(-1)?.isBrand).toBe(true);
  });

  it("never prints a count: every engine and rival figure is a share", () => {
    const s = buildExtProjectSummary({ ...base, model: model(), url: null });
    for (const v of [...s.engines.map((e) => e.mentionShare), ...s.rivals.map((r) => r.share)]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("only looks for citing prompts on a page of the project", () => {
    const own = buildExtProjectSummary({ ...base, model: model(), url: "https://www.marca.es/" });
    const other = buildExtProjectSummary({ ...base, model: model(), url: "https://otra.es/" });
    expect(own.citingPrompts).toEqual([]);
    expect(other.citingPrompts).toBeNull();
  });

  it("answers with empty figures when the project has no completed scan", () => {
    const s = buildExtProjectSummary({ ...base, model: null, url: null });
    expect(s).toMatchObject({ geoScore: null, engines: [], rivals: [], plan: [], seoScore: null, brand: "Marca" });
  });
});

describe("toExtAgentic", () => {
  it("passes the card, the upsell and nothing else", () => {
    expect(toExtAgentic({ kind: "hidden" })).toBeNull();
    expect(toExtAgentic({ kind: "upsell" })).toEqual({ kind: "upsell" });
    expect(
      toExtAgentic({
        kind: "card",
        score: 44,
        headline: "h",
        components: [{ id: "discovery" as never, name: "Descubrimiento", points: 22, weight: 30, percent: 73 }],
        first: null
      })
    ).toEqual({ kind: "card", score: 44, headline: "h", components: [{ name: "Descubrimiento", points: 22, weight: 30 }] });
  });
});
