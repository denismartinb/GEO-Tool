import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CoverageSectionData } from "@/lib/web-audit/coverage-section-data";

// The drive notice reads the coverage runner's context; these tests render
// the section on its own, so it is stubbed out.
vi.mock("../web-audit-drive-notice", () => ({ WebAuditDriveNotice: () => null }));

const { CoverageNotices } = await import("./coverage-section");

/**
 * The founder removed the «Cobertura de tu contenido» card (2026-11-02, log
 * §452). Only its recovery messages remain, and they must stay silent in the
 * normal case so the screen does not grow an empty block.
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

describe("CoverageNotices", () => {
  it("no pinta nada en el caso normal, ni el bloque retirado", () => {
    const html = renderToStaticMarkup(
      <CoverageNotices
        data={data({
          summary: { coveredCount: 5, conclusiveCount: 8, coveragePct: 63, surfacedCount: 2, surfacingPct: 40, topics: [] } as unknown as CoverageSectionData["summary"]
        })}
      />
    );
    expect(html).toBe("");
  });

  it("sigue explicando una comprobación pausada por cambio de plan", () => {
    const html = renderToStaticMarkup(
      <CoverageNotices data={data({ canAuditCoverage: false, activeCampaignProgress: { covered: 3, total: 9 } as CoverageSectionData["activeCampaignProgress"] })} />
    );
    expect(html).toContain("Comprobación pausada por cambio de plan");
    expect(html).not.toContain("Cobertura de tu contenido");
  });
});
