import type { FixList } from "@/lib/web-audit/seo-audit-view";
import type { LlmsTxtResult, PublishStep } from "@/lib/web-audit/llms-txt";
import type { SitemapStep } from "@/lib/web-audit/sitemap";
import { FixFilterGroup } from "./fix-filter";
import { IssueRow, PassingRow } from "./issue-rows";

/**
 * «Qué arreglar» (SEARCH-SEO-1 Fase 1b): every problem the last audit found,
 * in `buildTechnicalIssuesReport`'s order, then what already passes, behind
 * one severity filter. It replaces the old Problemas and Correcto tabs.
 */
export function FixListCard({
  list,
  llmsTxtFile,
  llmsPublishSteps,
  sitemapFixSteps
}: {
  list: FixList;
  llmsTxtFile: LlmsTxtResult | null;
  llmsPublishSteps: PublishStep[];
  sitemapFixSteps: SitemapStep[];
}) {
  return (
    <div className="card sa-fixes">
      <div className="sa-ch">
        <h3>Qué arreglar</h3>
        <span className="sa-src">Primero lo que más te frena</span>
      </div>
      {list.rows.length === 0 ? (
        <p className="sa-empty">La última revisión no ha podido comprobar nada todavía.</p>
      ) : (
        <FixFilterGroup counts={list.counts}>
          {list.counts.critical + list.counts.warning + list.counts.improvement === 0 && (
            <p className="sa-empty" data-sev="none">
              Ningún problema técnico en la última revisión.
            </p>
          )}
          {list.rows.map((row) =>
            row.kind === "issue" ? (
              <IssueRow
                key={row.issue.check}
                issue={row.issue}
                llmsTxt={
                  row.issue.check === "llms_txt_missing" && llmsTxtFile
                    ? { file: llmsTxtFile, steps: llmsPublishSteps }
                    : null
                }
                sitemap={row.issue.check === "sitemap_missing" ? { steps: sitemapFixSteps } : null}
              />
            ) : (
              <PassingRow key={`ok-${row.passing.check}`} passing={row.passing} />
            )
          )}
        </FixFilterGroup>
      )}
    </div>
  );
}
