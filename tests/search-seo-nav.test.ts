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

  it("opens the one audit route from two entries, GEO under IA and SEO under buscadores (log §274)", () => {
    const geo = sidebar.indexOf('label: "Auditoría GEO"');
    const seo = sidebar.indexOf('label: "Auditoría SEO"');
    expect(sidebar).toContain('{ segment: "/web-audit", label: "Auditoría GEO", icon: "sparkles", countKey: null, block: "geo" }');
    expect(sidebar).toContain('{ segment: "/web-audit", label: "Auditoría SEO", icon: "search", countKey: null, block: "seo" }');
    expect(sidebar.indexOf("const aiLinks")).toBeLessThan(geo);
    expect(geo).toBeLessThan(sidebar.indexOf("const searchLinks"));
    expect(sidebar.indexOf("const searchLinks")).toBeLessThan(seo);
    expect(sidebar).not.toContain('label: "Auditoría web"');
  });
});

describe("audit screen name", () => {
  it("names the tab title and the kicker after the open block", () => {
    const page = read("app/dashboard/projects/[projectId]/web-audit/page.tsx");
    expect(page).toContain("projectScreenMetadata(AUDIT_BLOCKS[block].label");
    expect(page).toContain("{AUDIT_BLOCKS[activeBlock].label}</p>");
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
