import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildReportModel, type ReportAnswer, type ReportInput } from "@/lib/report/report-model";
import { ReportPages } from "./geo-report";

/**
 * Render tests for the printed report: the content that goes in, never the
 * look (that is the pilot's and the founder's eye). Same discipline as the
 * web-audit `_components` tests (log §87).
 */

function ans(promptId: string, provider: string, named: boolean, citations: string[] = [], others: string[] = []): ReportAnswer {
  return {
    promptId,
    promptText: `¿Qué agencia recomiendas para ${promptId}?`,
    topic: "Local",
    provider,
    rawText: named ? "Te recomiendo Acme, que trabaja en Benissa con mucha experiencia local." : null,
    extracted: {
      brand: { mentioned: named, position: named ? 1 : null },
      competitors: [],
      other_brands_mentioned: others,
      citations: citations.map((d) => ({ url: `https://${d}`, domain: d }))
    }
  };
}

function input(over: Partial<ReportInput> = {}): ReportInput {
  return {
    brandName: "Acme",
    brandAliases: [],
    domain: "acme.es",
    scanDate: "2026-10-09T08:00:00Z",
    geoScore: 41.6,
    answers: [ans("p1", "gemini", true, ["acme.es"]), ans("p1", "openai", false, ["rival.es"], ["Rival"]), ans("p2", "gemini", false, [], ["Rival"])],
    competitors: [{ name: "Rival", domain: "rival.es" }],
    coverage: { p1: "yes", p2: "no" },
    technical: { score: 80, checks: [{ label: "llms.txt", detail: null, state: "ok", text: "Lo tienes" }] },
    plan: [{ title: "Publica una FAQ", description: "D", firstStep: "Empieza por la portada", providers: ["gemini"], topics: ["Local"] }],
    ...over
  };
}

function render(over: Partial<ReportInput> = {}): string {
  return renderToStaticMarkup(<ReportPages model={buildReportModel(input(over))!} fontClassName="f" />);
}

describe("ReportPages", () => {
  it("prints all eight pages with their numbers when every block has data", () => {
    const html = render();
    expect(html.match(/class="gr-page/g)).toHaveLength(8);
    expect(html).toContain("8 / 8");
    expect(html).toContain("9 de octubre de 2026");
    expect(html).toContain("Octubre 2026");
    expect(html).toContain(">42<"); // Puntuación GEO, rounded
  });

  it("drops a page and renumbers when its block has no data", () => {
    const html = render({ technical: null, coverage: null, plan: [] });
    expect(html.match(/class="gr-page/g)).toHaveLength(6);
    expect(html).toContain("6 / 6");
    expect(html).not.toContain("Auditoría técnica");
    expect(html).not.toContain("¿Página");
  });

  it("shows a dash, not a number, when the GEO score is unknown", () => {
    expect(render({ geoScore: null })).toMatch(/Puntuación GEO<\/div><div>—</);
  });

  it("names engines without versions and never prints an absolute count", () => {
    const html = render().replace(/<[^>]+>/g, " ");
    expect(html).toContain("Gemini y ChatGPT");
    expect(html).not.toMatch(/gemini-\d|gpt-\d|haiku|sonnet/i);
    expect(html).not.toMatch(/\b\d+ de \d+\b/);
    expect(html).toContain("preguntas principales de búsqueda");
  });

  it("marks the last page so no blank sheet follows it", () => {
    const html = render();
    expect(html.match(/gr-last/g)).toHaveLength(1);
  });
});
