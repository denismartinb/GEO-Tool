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

describe("console navigation: NAV-SIMPLIFY-1 (log §291)", () => {
  const sidebar = read("components/sidebar.tsx");

  it("names the four blocks the founder chose, in his order", () => {
    const labels = [">Posicionamiento en la IA<", ">Posicionamiento global<", ">Actuar<", ">Aprender<"].map((l) =>
      sidebar.indexOf(l)
    );
    expect(labels.every((i) => i > -1)).toBe(true);
    expect([...labels].sort((x, y) => x - y)).toEqual(labels);
    expect(sidebar).not.toContain(">Posicionamiento en buscadores<");
    expect(sidebar).not.toContain(">Analizar<");
  });

  it("opens the audit route from one entry, «Auditoría técnica», under Posicionamiento global", () => {
    expect(sidebar).toContain('{ segment: "/web-audit", label: "Auditoría técnica", icon: "search", countKey: null }');
    expect(sidebar).not.toContain('label: "Auditoría GEO"');
    expect(sidebar).not.toContain('label: "Auditoría SEO"');
    const audit = sidebar.indexOf('label: "Auditoría técnica"');
    expect(sidebar.indexOf("const globalLinks")).toBeLessThan(audit);
    expect(audit).toBeLessThan(sidebar.indexOf('label: "Posición en Google"'));
  });

  it("renames the learn link and the tour entry", () => {
    expect(sidebar).toContain('label: "Manuales y estudios"');
    expect(sidebar).toContain(">¿Cómo funciona?</span>");
    expect(sidebar).not.toContain("¿Qué es el GEO?</span>");
  });
});

describe("audit screen name", () => {
  it("names the tab title and the kicker «Auditoría técnica», whatever block is open", () => {
    const page = read("app/dashboard/projects/[projectId]/web-audit/page.tsx");
    expect(page).toContain('const SCREEN_LABEL = "Auditoría técnica";');
    expect(page).toContain("projectScreenMetadata(SCREEN_LABEL");
    expect(page).toContain("{SCREEN_LABEL}</p>");
    expect(page).toContain("<BlockSwitch ");
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
    const row = overview.indexOf("className={`ov2-score-row");
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

describe("Visión general: competitive panorama beside Auditoría SEO (log §279)", () => {
  const overview = read("app/dashboard/projects/[projectId]/page.tsx");
  const css = read("app/console.css");

  it("moves the chart up only when the side column holds the engines and the SEO card", () => {
    expect(overview).toContain(
      "const panoramaUp = seoSummary !== null && !enginesInKpiGrid && panoramaTop !== null && panoramaTable !== null;"
    );
    const breakdownEnd = overview.indexOf('<div className="ov2-pano-up">');
    const side = overview.indexOf('<div className="ov2-score-side">');
    expect(breakdownEnd).toBeGreaterThan(-1);
    expect(breakdownEnd).toBeLessThan(side);
  });

  it("keeps the phone order: the chart's mobile copy still opens the analysis column", () => {
    const main = overview.indexOf("className={`ov2-main");
    const dup = overview.indexOf('<div className="ov2-pano-dup">');
    const rail = overview.indexOf('<div className="ov2-rail">');
    expect(dup).toBeGreaterThan(main);
    expect(dup).toBeLessThan(rail);
    expect(css).toMatch(/\.ov2-pano-up \{ display: none; \}\n\.ov2-pano-dup \{ display: contents; \}/);
  });

  it("gives the analysis row the same tracks as the score row, so Oportunidades lines up", () => {
    const tracks = css.match(/grid-template-columns: minmax\(0, 2fr\) minmax\(0, 1fr\);/g) ?? [];
    expect(tracks.length).toBeGreaterThanOrEqual(2);
    expect(css).not.toMatch(/\.ov2-insight-txt \{[^}]*max-width/);
  });
});
