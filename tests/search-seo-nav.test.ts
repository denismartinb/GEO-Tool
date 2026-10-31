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
  it("names the page after its block, with the shared head and no kicker (log §368, §395)", () => {
    const page = read("app/dashboard/projects/[projectId]/web-audit/page.tsx");
    expect(page).not.toContain("SCREEN_LABEL");
    expect(page).toContain("projectScreenMetadata(BLOCK_TITLES[block]");
    expect(page).toContain("<PageHead title={BLOCK_TITLES[activeBlock]} lead={BLOCK_NOTES[activeBlock]} />");
    expect(page).toContain("<InsBlockHero ");
  });
});

describe("Visión general: citation blockers lead the screen", () => {
  const overview = read("app/dashboard/projects/[projectId]/page.tsx");

  it("reads blockers from the same module as Recomendaciones", () => {
    expect(overview).toContain('from "@/lib/recommendations/citation-blockers"');
    expect(overview).toContain("findCitationBlockers(");
  });

  it("renders the priority strip before the score hero", () => {
    const strip = overview.indexOf("<PriorityAlert");
    const hero = overview.indexOf("<ScoreHero");
    expect(strip).toBeGreaterThan(-1);
    expect(strip).toBeLessThan(hero);
  });
});

describe("Visión general: Auditoría SEO card", () => {
  const overview = read("app/dashboard/projects/[projectId]/page.tsx");

  it("sits in the closing pair, after the breakdown", () => {
    const pair = overview.indexOf("ov-pair");
    const card = overview.indexOf("<SeoAuditCard");
    expect(pair).toBeGreaterThan(overview.indexOf("<Breakdown"));
    expect(card).toBeGreaterThan(pair);
  });

  it("counts problems through the Auditoría SEO screen's own aggregation", () => {
    expect(overview).toContain("buildOverviewSeoSummary(");
    const summary = read("lib/web-audit/overview-seo-summary.ts");
    expect(summary).toContain("buildTechnicalIssuesReport(");
  });
});
