import { buildTechnicalIssuesReport, type IssueSeverity, type TechnicalIssue } from "@/lib/web-audit/issues";
import type { BotAccessReport } from "@/lib/web-audit/robots";
import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";

/**
 * What Visión general's Auditoría SEO card shows (SEARCH-SEO-1 Fase 1b, log
 * §271). A thin projection of `buildTechnicalIssuesReport`, the same
 * aggregation the Auditoría SEO screen runs, so the card and the screen can
 * never count a different number of problems.
 *
 * Null when there is nothing honest to show: no snapshot, a snapshot missing
 * either half, or no page that could be analyzed. The card is then not
 * rendered at all rather than promising an audit that may never run (the
 * automatic technical audit can be switched off per project).
 */
export type OverviewSeoSummary = {
  analyzedPageCount: number;
  counts: Record<IssueSeverity, number>;
  /** First issues to fix, in the report's own order: severity, then points gained. */
  top: TechnicalIssue[];
};

export const OVERVIEW_SEO_TOP_ISSUES = 3;

export function buildOverviewSeoSummary(
  snapshot: { pages: PageAuditEntry[] | null; bots: BotAccessReport | null } | null
): OverviewSeoSummary | null {
  if (!snapshot?.pages || !snapshot.bots) return null;
  const report = buildTechnicalIssuesReport(snapshot.pages, snapshot.bots);
  if (report.analyzedPageCount === 0) return null;
  const counts: Record<IssueSeverity, number> = { critical: 0, warning: 0, improvement: 0 };
  for (const issue of report.issues) counts[issue.severity] += 1;
  return {
    analyzedPageCount: report.analyzedPageCount,
    counts,
    top: report.issues.slice(0, OVERVIEW_SEO_TOP_ISSUES)
  };
}
