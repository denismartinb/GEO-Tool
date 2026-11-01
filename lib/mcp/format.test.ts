import { describe, expect, it } from "vitest";
import type { ExtProjectPayload } from "@/lib/ext/project-data";
import {
  PAGE_REVIEW_FAILURE,
  formatAudits,
  formatCompetitors,
  formatDomainSummary,
  formatPlanNotice,
  formatRecommendations,
  formatSearchConsole,
  htmlToText
} from "./format";

const L = { base: "https://www.genscore.es", projectId: "p1" };
const P: ExtProjectPayload = {
  domain: "marca.es",
  brand: "Marca",
  scanDate: "2026-10-31T06:00:00Z",
  geoScore: 54,
  lede: "La IA te nombra en algo menos de la mitad de las respuestas.",
  engines: [
    { provider: "openai", label: "ChatGPT", mentionShare: 0.4 },
    { provider: "gemini", label: "Gemini", mentionShare: 0.25 }
  ],
  rivals: [
    { name: "Rival", share: 0.5, isBrand: false, domain: "rival.es" },
    { name: "Marca", share: 0.33, isBrand: true, domain: "marca.es" }
  ],
  seoScore: 78,
  plan: [{ title: "Publica una comparativa con Rival", firstStep: "Crea /comparativas/rival", engines: ["ChatGPT"] }],
  agentic: { kind: "upsell" },
  citingPrompts: null,
  searchConsole: { state: "disconnected" },
  audits: { auditedAt: "2026-10-30T00:00:00Z", blocks: [{ key: "geo", score: 70, projected: 82, issues: [{ label: "Sin llms.txt", scope: "Todo el sitio", points: 6, severity: "medium" as never }] }], page: null }
};

const ALL = [
  formatDomainSummary(P, L),
  formatCompetitors(P, L),
  formatRecommendations(P, L),
  formatAudits(P, L),
  formatSearchConsole(P, L),
  formatPlanNotice(),
  ...Object.values(PAGE_REVIEW_FAILURE).map((text) => ({ text }))
];

describe("MCP answers (MCP-SERVER-1, log §418)", () => {
  it("only words what the shared payload says, with percentages", () => {
    const t = formatDomainSummary(P, L).text;
    expect(t).toContain("Puntuación GEO: 54/100");
    expect(t).toContain("- ChatGPT: 40%");
    expect(t).toContain("- Marca (tú): 33%");
    expect(t).toContain("https://www.genscore.es/dashboard/projects/p1");
  });

  it("lists the questions a plan step refers to, capped", () => {
    const qs = Array.from({ length: 8 }, (_, i) => `¿Pregunta ${i + 1}?`);
    const t = formatRecommendations({ ...P, plan: [{ ...P.plan[0], questions: qs }] }, L).text;
    expect(t).toContain("- «¿Pregunta 1?»");
    expect(t).toContain("- «¿Pregunta 6?»");
    expect(t).not.toContain("¿Pregunta 7?");
    expect(t).toContain("y otras en la consola");
  });

  it("never sells: no price, no upgrade call, no checkout (ChatGPT's directory forbids it)", () => {
    for (const a of ALL) {
      expect(a.text).not.toMatch(/€|\bPasar a Pro\b|mejora tu plan|sube de plan|checkout|stripe/i);
    }
    expect(formatAudits(P, L).text).toContain("no está incluida en tu plan");
  });

  it("names engines only by name and never uses a long dash", () => {
    for (const a of ALL) {
      expect(a.text).not.toContain("—");
      expect(a.text).not.toMatch(/gpt-\d|gemini-\d|claude-\d|sonar/i);
    }
  });

  it("invites to connect Search Console only with the real state, and links to the console", () => {
    expect(formatSearchConsole(P, L).text).toContain("no tiene Search Console conectado");
    const off = formatSearchConsole({ ...P, searchConsole: { state: "off" } }, L).text;
    expect(off).not.toContain("conectado");
  });

  it("says when there is no scan instead of printing zeros", () => {
    const t = formatDomainSummary({ ...P, geoScore: null, engines: [] }, L).text;
    expect(t).toContain("todavía no tiene un escaneo completado");
    expect(t).not.toMatch(/\b0%/);
  });

  it("turns the panel's code tags into Markdown", () => {
    expect(htmlToText('Publica un <code class="p">llms.txt</code> &amp; ya')).toBe("Publica un `llms.txt` & ya");
  });
});
