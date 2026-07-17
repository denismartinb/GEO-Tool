import { buildWebAuditSummary, type PromptResultLite } from "@/lib/web-audit/opportunity-matrix";
import type { DomainCoverageMap } from "@/lib/web-audit/coverage-map";

/**
 * Builds the "evolución entre auditorías" trend series (WEB-AUDIT-1) from a
 * project's persisted coverage-map history. Pure — no I/O; the caller loads
 * `maps` and `resultsByScanId` from Supabase.
 */

export type CoverageTrendPoint = {
  scanId: string;
  generatedAt: string;
  coveragePct: number | null;
  surfacingPct: number | null;
  /**
   * Raw counts behind coveragePct/surfacingPct (WEB-AUDIT-R6 phase 1,
   * geo-strategy review 2026-07-17) — callers need these to compute a Wilson
   * confidence interval and to decide whether a point-to-point delta is
   * trustworthy (lib/web-audit/sample-confidence.ts). Mirrors
   * WebAuditSummary's own field names exactly.
   */
  conclusiveCount: number;
  coveredCount: number;
  surfacedCount: number;
};

const MAX_TREND_POINTS = 8;

export function buildCoverageTrend(input: {
  maps: DomainCoverageMap[];
  resultsByScanId: Map<string, PromptResultLite[]>;
  projectDomain: string;
}): CoverageTrendPoint[] {
  // Dedupe by scanId, keeping the most recently generated map for each —
  // re-auditing the same scan (cache-hit or not) can otherwise repeat a
  // scanId across history rows.
  const latestByScanId = new Map<string, DomainCoverageMap>();
  for (const map of input.maps) {
    const existing = latestByScanId.get(map.scanId);
    if (!existing || existing.generatedAt < map.generatedAt) {
      latestByScanId.set(map.scanId, map);
    }
  }

  const points = Array.from(latestByScanId.values())
    .sort((a, b) => a.generatedAt.localeCompare(b.generatedAt))
    .map((map) => {
      const summary = buildWebAuditSummary({
        coverage: map,
        results: input.resultsByScanId.get(map.scanId) ?? [],
        projectDomain: input.projectDomain
      });
      return {
        scanId: map.scanId,
        generatedAt: map.generatedAt,
        coveragePct: summary.coveragePct,
        surfacingPct: summary.surfacingPct,
        conclusiveCount: summary.conclusiveCount,
        coveredCount: summary.coveredCount,
        surfacedCount: summary.surfacedCount
      };
    });

  return points.slice(-MAX_TREND_POINTS);
}
