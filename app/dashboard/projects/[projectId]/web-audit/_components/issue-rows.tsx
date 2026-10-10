import { Icon } from "@/components/ui/icon";
import type { TechnicalIssue, TechnicalPassingCheck, IssueSeverity } from "@/lib/web-audit/issues";
import type { LlmsTxtResult, PublishStep } from "@/lib/web-audit/llms-txt";
import type { SitemapStep } from "@/lib/web-audit/sitemap";
import { LlmsTxtBlock } from "../llms-txt-block";
import { SitemapStepsBlock } from "../sitemap-steps-block";
import {
  ISSUE_CHECK_META as CHECK_META,
  ISSUE_SEVERITY_LABELS,
  SINGLE_FACT_CHECKS,
  issueScopeLabel,
  pluralizeUnit
} from "@/lib/web-audit/issue-labels";
import { AudienceTags } from "./audience-tags";

/**
 * The rows of «Qué arreglar» on Auditoría SEO (SEARCH-SEO-1 Fase 1b, design
 * in `docs/design-reference/search-seo-1/maqueta.html`). Native `<details>`,
 * collapsed by default: the severity, the GOOGLE/IA tags and the scope are
 * always visible, and «Por qué importa», «Cómo arreglarlo» and the affected
 * pages are one tap away. Pure server components, like every module here.
 *
 * The point gain the old row showed («+6,0 pt») is gone with the redesign:
 * the founder removed the projected score from the same screen's card on
 * Visión general, and the approved design has no per-row points either.
 */

const SEVERITY_ICON: Record<IssueSeverity, string> = { critical: "!", warning: "~", improvement: "+" };

export function IssueRow({
  issue,
  llmsTxt,
  sitemap
}: {
  issue: TechnicalIssue;
  /**
   * Fase 3a. Only ever passed for `llms_txt_missing`, and only when there was
   * real coverage data to build a file from — so a project that has never run
   * a coverage audit still gets the prose guidance and no half-empty artifact.
   */
  llmsTxt?: { file: LlmsTxtResult; steps: PublishStep[] } | null;
  /** Fase sitemap: qué hacer para tener uno. Sólo para `sitemap_missing`. */
  sitemap?: { steps: SitemapStep[] } | null;
}) {
  const meta = CHECK_META[issue.check];
  // Founder question (2026-08-04): una incidencia que ya trae solución dentro
  // se leía igual que una que sólo trae prosa, así que nadie tenía motivo para
  // abrirla. El distintivo lo dice en la fila cerrada.
  const hasFix = Boolean(llmsTxt || sitemap);
  const scopeLabel = issueScopeLabel(issue);

  return (
    <details className="wa-details sa-iss" data-sev={issue.severity}>
      <summary>
        <span className={`sa-sev sa-sev-${issue.severity}`} aria-hidden="true">
          {SEVERITY_ICON[issue.severity]}
        </span>
        <span className="sa-iss-t">
          <b>{meta.label}</b>
          <span>
            <span className="sa-sr">{ISSUE_SEVERITY_LABELS[issue.severity][0]} · </span>
            <span className="sa-iss-scope">{scopeLabel}</span>
            {hasFix && (
              <span className="badge wa2-fix-ready">
                <Icon name="check" size={10} />
                Solución disponible
              </span>
            )}
          </span>
        </span>
        <AudienceTags audience={meta.audience} />
        <span className="wa-chev">
          <Icon name="chevDown" size={14} />
        </span>
      </summary>
      <div className="wa-details-body sa-iss-in">
        <div>
          <h4>Por qué importa</h4>
          <p>{meta.why}</p>
          <h4>Cómo arreglarlo</h4>
          <p>{meta.guidance}</p>
          {llmsTxt && <LlmsTxtBlock file={llmsTxt.file} steps={llmsTxt.steps} />}
          {sitemap && <SitemapStepsBlock steps={sitemap.steps} />}
        </div>
        {issue.affectedLabels.length > 0 && (
          <div>
            <h4>{issue.check === "bot_blocked" ? "Bots bloqueados" : "Páginas afectadas"}</h4>
            <ul className="sa-urls">
              {issue.affectedLabels.slice(0, 12).map((label) => (
                <li key={label}>{label}</li>
              ))}
              {issue.affectedLabels.length > 12 && <li>y {issue.affectedLabels.length - 12} más…</li>}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}

/** A check every measured page already passes: «Bien» in the filter. */
export function PassingRow({ passing }: { passing: TechnicalPassingCheck }) {
  const meta = CHECK_META[passing.check];
  const scopeLabel = SINGLE_FACT_CHECKS.has(passing.check)
    ? "Encontrado"
    : `${passing.passedCount} de ${passing.applicableCount} ${pluralizeUnit(meta.unit, passing.applicableCount)}`;
  return (
    <div className="sa-iss sa-ok" data-sev="ok">
      <span className="sa-sev sa-sev-ok" aria-hidden="true">
        ✓
      </span>
      <span className="sa-iss-t">
        <b>{meta.label}</b>
        <span>
          <span className="sa-sr">Bien · </span>
          {scopeLabel}
        </span>
      </span>
      <AudienceTags audience={meta.audience} />
    </div>
  );
}

export function CheckDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: ok ? "var(--ink-2)" : "var(--ink-4)" }}>
      <Icon name={ok ? "check" : "x"} size={11} />
      {label}
    </span>
  );
}
