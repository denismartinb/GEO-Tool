import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SEARCH-SEO-1 Fase 1 (log §271) — source-level contracts for the new console
 * navigation. The sidebar is a client component with hooks, so these read the
 * source instead of rendering it, same approach as tests/mission-parity.test.ts.
 */
const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("console navigation: two analysis blocks", () => {
  const sidebar = read("components/sidebar.tsx");

  it("names the two blocks the founder chose, IA first", () => {
    const ai = sidebar.indexOf(">Posicionamiento en IA<");
    const search = sidebar.indexOf(">Posicionamiento en buscadores<");
    const act = sidebar.indexOf(">Actuar<");
    expect(ai).toBeGreaterThan(-1);
    expect(search).toBeGreaterThan(ai);
    expect(act).toBeGreaterThan(search);
    expect(sidebar).not.toContain(">Analizar<");
  });

  it("calls the audit screen Auditoría SEO and keeps its route", () => {
    expect(sidebar).toContain('{ segment: "/web-audit", label: "Auditoría SEO"');
    expect(sidebar).not.toContain('label: "Auditoría web"');
  });
});

describe("Auditoría SEO screen name", () => {
  it("uses the new name in the tab title and the page kicker", () => {
    const page = read("app/dashboard/projects/[projectId]/web-audit/page.tsx");
    expect(page).toContain('projectScreenMetadata("Auditoría SEO"');
    expect(page).toContain(">Auditoría SEO</p>");
  });
});

describe("Visión general: citation blockers lead the screen", () => {
  const overview = read("app/dashboard/projects/[projectId]/page.tsx");

  it("reads blockers from the same module as Recomendaciones", () => {
    expect(overview).toContain('from "@/lib/recommendations/citation-blockers"');
    expect(overview).toContain("findCitationBlockers(");
  });

  it("renders the priority strip before the summary sentence", () => {
    const strip = overview.indexOf('className="ov2-prio"');
    const insight = overview.indexOf('className="ov2-insight"');
    expect(strip).toBeGreaterThan(-1);
    expect(strip).toBeLessThan(insight);
  });
});

describe("Visión general: Auditoría SEO card", () => {
  const overview = read("app/dashboard/projects/[projectId]/page.tsx");

  it("sits in the engines column on mobile, after the engine bars and before the competitors panel", () => {
    const side = overview.indexOf('className="ov2-score-side"');
    const engines = overview.indexOf("className={`ov2-eng-side");
    const card = overview.indexOf('className={`ov2-seo-side');
    const cols = overview.indexOf('className="ov2-cols"');
    expect(side).toBeGreaterThan(-1);
    expect(engines).toBeGreaterThan(side);
    expect(card).toBeGreaterThan(engines);
    expect(card).toBeLessThan(cols);
  });

  it("moves the engine bars into the KPI grid's empty cell on desktop, leaving the card beside the breakdown", () => {
    const kpis = overview.indexOf('className="ov2-kpi-car"');
    const slot = overview.indexOf('className="ov2-eng-kpi"');
    const row = overview.indexOf('className="ov2-score-row"');
    expect(slot).toBeGreaterThan(kpis);
    expect(slot).toBeLessThan(row);
    expect(overview).toContain("seoSummary !== null && !hasSufficientSample(sentimentTotal)");
    const css = read("app/console.css");
    expect(css).toMatch(/\.ov2-eng-kpi \{ display: none; \}/);
    expect(css).toMatch(/@media \(min-width: 1200px\) \{\n  \.ov2-eng-side\.is-in-kpis \{ display: none; \}/);
  });

  it("counts problems through the Auditoría SEO screen's own aggregation", () => {
    expect(overview).toContain("buildOverviewSeoSummary(");
    const summary = read("lib/web-audit/overview-seo-summary.ts");
    expect(summary).toContain("buildTechnicalIssuesReport(");
  });
});
