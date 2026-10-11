import type { AuditBlockView } from "@/lib/web-audit/audit-blocks";
import type { ClassifiedTopic } from "@/lib/web-audit/opportunity-matrix";
import type { IssueSeverity } from "@/lib/web-audit/issues";
import { ISSUE_SEVERITY_LABELS } from "@/lib/web-audit/issue-labels";
import type { LlmsTxtResult, PublishStep } from "@/lib/web-audit/llms-txt";
import type { SitemapStep } from "@/lib/web-audit/sitemap";
import { IssueRow, PassingRow } from "./issue-rows";

/**
 * The Problemas and Correcto tabs of one audit block (log §274). Server
 * components: the tab bar (`audit-tabs.tsx`) only toggles which one is
 * visible.
 */

const SEVERITIES: IssueSeverity[] = ["critical", "warning", "improvement"];

export function BlockIssuesCard({
  view,
  llmsTxtFile,
  llmsPublishSteps,
  sitemapFixSteps
}: {
  view: AuditBlockView;
  llmsTxtFile: LlmsTxtResult | null;
  llmsPublishSteps: PublishStep[];
  sitemapFixSteps: SitemapStep[];
}) {
  const counts = SEVERITIES.map((severity) => ({
    severity,
    count: view.issues.filter((i) => i.issue.severity === severity).length
  })).filter((c) => c.count > 0);

  return (
    <div className="card sa-fixes">
      <div className="sa-ch">
        <h3>Problemas</h3>
        <span className="sa-src">Primero lo que más te frena</span>
      </div>
      {view.issues.length === 0 ? (
        <p className="sa-empty">Ningún problema en este bloque en la última revisión.</p>
      ) : (
        <>
          <div className="sa-counts">
            {counts.map(({ severity, count }) => (
              <div key={severity} className={`sa-count sa-count-${severity}`}>
                <span>{ISSUE_SEVERITY_LABELS[severity][count === 1 ? 0 : 1]}</span>
                <b>{count}</b>
              </div>
            ))}
          </div>
          <div className="sa-issues">
            {view.issues.map(({ issue, blockPoints }) => (
              <IssueRow
                key={issue.check}
                issue={issue}
                blockPoints={blockPoints}
                llmsTxt={
                  issue.check === "llms_txt_missing" && llmsTxtFile
                    ? { file: llmsTxtFile, steps: llmsPublishSteps }
                    : null
                }
                sitemap={issue.check === "sitemap_missing" ? { steps: sitemapFixSteps } : null}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function BlockPassingCard({
  view,
  citedTopics
}: {
  view: AuditBlockView;
  /** GEO only: topics with own content the AI already cites (the coverage map's «performing»). */
  citedTopics?: ClassifiedTopic[];
}) {
  return (
    <>
      <div className="card sa-fixes">
        <div className="sa-ch">
          <h3>Lo que ya está bien</h3>
          <span className="sa-src">Cumple en todo lo que revisamos</span>
        </div>
        {view.passing.length === 0 ? (
          <p className="sa-empty">Todavía no hay ninguna comprobación de este bloque que cumplan todas tus páginas.</p>
        ) : (
          <div className="sa-issues">
            {view.passing.map((passing) => (
              <PassingRow key={passing.check} passing={passing} />
            ))}
          </div>
        )}
      </div>
      {citedTopics && citedTopics.length > 0 && (
        <div className="card sa-fixes">
          <div className="sa-ch">
            <h3>Temas que la IA ya cita</h3>
          </div>
          <p className="sa-note">
            Contenido propio que la IA ya cita en sus respuestas. No hay nada que hacer, sólo mantenerlo al día.
          </p>
          <ul className="cov-list">
            {citedTopics.map((topic) => (
              <li key={topic.promptId}>{topic.topic}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
