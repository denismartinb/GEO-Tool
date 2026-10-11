import { buildAuditBlock, type BlockIssue } from "@/lib/web-audit/audit-blocks";
import { buildTechnicalIssuesReport, type IssueSeverity } from "@/lib/web-audit/issues";
import type { BotAccessReport } from "@/lib/web-audit/robots";
import { VITAL_ORDER, rateVital, vitalValue, worstVital, type VitalKey, type VitalRating } from "@/lib/web-audit/seo-health";
import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";

/**
 * What Visión general's Auditoría SEO card shows (SEARCH-SEO-1, log §271 and
 * §281). Since Fase 2 it is the SEO block of the Auditoría SEO screen: the
 * same `buildAuditBlock` call, so the card's Salud SEO, counts, order and
 * points are the screen's, never a second calculation. GEO problems live in
 * the GEO block and, when they stop the AI from citing, in the «Prioridad 1»
 * strip above the summary.
 *
 * Null when there is nothing honest to show: no snapshot, a snapshot missing
 * either half, or no page that could be analyzed. The card is then not
 * rendered at all rather than promising an audit that may never run (the
 * automatic technical audit can be switched off per project).
 */
export type OverviewSeoSpeed = { vital: VitalKey; value: number; rating: VitalRating };

export type OverviewSeoSummary = {
  analyzedPageCount: number;
  /** The Salud SEO, 0–100. Null when no page measured a scored SEO check. */
  saludScore: number | null;
  counts: Record<IssueSeverity, number>;
  /** First issues to fix, in the SEO block's own order: severity, then points gained. */
  top: BlockIssue[];
  /**
   * The home page's mobile speed in one line: the vital that most needs work,
   * or LCP when all are good. Null when speed was not measured.
   */
  speed: OverviewSeoSpeed | null;
};

export const OVERVIEW_SEO_TOP_ISSUES = 3;

export function buildOverviewSeoSummary(
  snapshot: { pages: PageAuditEntry[] | null; bots: BotAccessReport | null } | null
): OverviewSeoSummary | null {
  if (!snapshot?.pages || !snapshot.bots) return null;
  const report = buildTechnicalIssuesReport(snapshot.pages, snapshot.bots);
  if (report.analyzedPageCount === 0) return null;
  const block = buildAuditBlock("seo", snapshot.pages, report, snapshot.bots);
  const counts: Record<IssueSeverity, number> = { critical: 0, warning: 0, improvement: 0 };
  for (const { issue } of block.issues) counts[issue.severity] += 1;
  return {
    analyzedPageCount: report.analyzedPageCount,
    saludScore: block.score,
    counts,
    top: block.issues.slice(0, OVERVIEW_SEO_TOP_ISSUES),
    speed: mobileSpeedLine(snapshot.bots)
  };
}

function mobileSpeedLine(bots: BotAccessReport): OverviewSeoSpeed | null {
  const mobile = bots.site?.pageSpeed?.mobile;
  if (!mobile) return null;
  const worst = worstVital(mobile);
  if (worst) return { vital: worst.key, value: worst.value, rating: worst.rating };
  for (const vital of VITAL_ORDER) {
    const value = vitalValue(mobile, vital);
    if (value !== null) return { vital, value, rating: rateVital(vital, value) };
  }
  return null;
}
