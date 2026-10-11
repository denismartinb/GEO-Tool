import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CoverageSectionData } from "@/lib/web-audit/coverage-section-data";

// The drive notice reads the coverage runner's context; these tests render
// the section on its own, so it is stubbed out.
vi.mock("../web-audit-drive-notice", () => ({ WebAuditDriveNotice: () => null }));

const { CoverageSection } = await import("./coverage-section");

/**
 * The coverage map in its new home (SEARCH-SEO-1 Fase 1b, log §271). What
 * these protect is what it protected on Auditoría web: a plan without
 * coverage reads as «no está en tu plan», never as «sin auditar», and an
 * empty section invents nothing.
 */

function data(overrides: Partial<CoverageSectionData> = {}): CoverageSectionData {
  return {
    canAuditCoverage: true,
    summary: null,
    grouped: { performing: [], invisible: [], content_gap: [], open_opportunity: [], unverified_cited: [], inconclusive: [] },
    trend: [],
    latestMap: null,
    auditedScanDate: null,
    coverageDelta: null,
    surfacingDelta: null,
    activeCampaignProgress: null,
    auditPillState: "idle",
    ...overrides
  };
}

describe("CoverageSection", () => {
  it("sin Pro y sin cobertura dice que no está en el plan", () => {
    const html = renderToStaticMarkup(<CoverageSection data={data({ canAuditCoverage: false })} />);
    expect(html).toContain("No está en tu plan");
    expect(html).not.toContain("Todavía no hemos comprobado");
  });

  it("con Pro y sin mapa todavía, lo dice sin inventar cifras", () => {
    const html = renderToStaticMarkup(<CoverageSection data={data()} />);
    expect(html).toContain("Todavía no hemos comprobado tu contenido");
    expect(html).not.toContain("%");
  });

  it("con mapa, publica las fracciones reales de cobertura e implementación", () => {
    const html = renderToStaticMarkup(
      <CoverageSection
        data={data({
          summary: {
            coveredCount: 5,
            conclusiveCount: 8,
            coveragePct: 63,
            surfacedCount: 2,
            surfacingPct: 40,
            topics: []
          } as unknown as CoverageSectionData["summary"]
        })}
      />
    );
    expect(html).toContain("5 / 8");
    expect(html).toContain("2 / 5");
  });
});
