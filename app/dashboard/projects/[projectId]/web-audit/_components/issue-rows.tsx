import { Icon } from "@/components/ui/icon";
import type {
  TechnicalIssue,
  TechnicalPassingCheck,
  IssueSeverity
} from "@/lib/web-audit/issues";
import type { LlmsTxtResult, PublishStep } from "@/lib/web-audit/llms-txt";
import type { SitemapStep } from "@/lib/web-audit/sitemap";
import { LlmsTxtBlock } from "../llms-txt-block";
import { SitemapStepsBlock } from "../sitemap-steps-block";
import { ISSUE_CHECK_META as CHECK_META, SINGLE_FACT_CHECKS, issueScopeLabel, pluralizeUnit } from "@/lib/web-audit/issue-labels";

/**
 * PRELAUNCH-HARDENING-1 Fase R7 — un trozo de la pantalla de Auditoría web.
 *
 * `page.tsx` tenía 1.933 líneas con catorce componentes de presentación
 * definidos dentro, así que para cambiar una fila había que navegar la página
 * entera. Son todos componentes de servidor y puros: reciben datos ya
 * calculados y devuelven marcado. Cero cambios de lógica y cero cambios de
 * marcado — el `ux-pilot` es quien lo verifica, porque esta fase SÍ toca UI
 * (log §83).
 */

const SEVERITY_META: Record<IssueSeverity, { label: string; stripe: string; badgeClass: string }> = {
  critical: { label: "Crítico", stripe: "var(--wa-crit)", badgeClass: "badge-neg" },
  warning: { label: "Aviso", stripe: "var(--warn)", badgeClass: "badge-warn" },
  improvement: { label: "Mejora", stripe: "var(--wa-improve)", badgeClass: "badge-neutral" }
};

/** One technical problem, collapsed by default (same `.wa-details` pattern PageAuditRow already uses) — severity + scope always visible, the fix and affected pages one tap away. */
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
  // abrirla. El distintivo lo dice en la fila cerrada — sin tocar severidad ni
  // orden, que dependen del impacto real en el score y no de lo satisfactoria
  // que sea la solución.
  const hasFix = Boolean(llmsTxt || sitemap);
  const sev = SEVERITY_META[issue.severity];
  const scopeLabel = issueScopeLabel(issue);

  return (
    <details className="wa-details">
      <summary>
        <span className="wa2-issue-stripe" style={{ background: sev.stripe }} aria-hidden="true" />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span className={`badge ${sev.badgeClass}`} style={{ fontSize: 10 }}>
              {sev.label}
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 650, color: "var(--ink)" }}>{meta.label}</span>
            {hasFix && (
              <span className="badge wa2-fix-ready">
                <Icon name="check" size={10} />
                Solución disponible
              </span>
            )}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--ink-4)", marginTop: 2 }}>{scopeLabel}</div>
        </div>
        {issue.pointDelta !== null && (
          <span className="badge badge-accent" style={{ fontSize: 10.5, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
            +{issue.pointDelta.toFixed(1).replace(".", ",")} pt
          </span>
        )}
        <span className="wa-chev">
          <Icon name="chevDown" size={14} />
        </span>
      </summary>
      <div className="wa-details-body">
        <p style={{ fontSize: 12, color: "var(--ink-3)", margin: "0 0 8px", lineHeight: 1.5 }}>{meta.guidance}</p>
        {llmsTxt && <LlmsTxtBlock file={llmsTxt.file} steps={llmsTxt.steps} />}
        {sitemap && <SitemapStepsBlock steps={sitemap.steps} />}
        {issue.affectedLabels.length > 0 && (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
            {issue.affectedLabels.slice(0, 12).map((label) => (
              <li
                key={label}
                style={{
                  fontSize: 11,
                  color: "var(--ink-4)",
                  fontFamily: label.startsWith("http") ? "var(--mono)" : undefined,
                  overflowWrap: "anywhere"
                }}
              >
                {label}
              </li>
            ))}
            {issue.affectedLabels.length > 12 && (
              <li style={{ fontSize: 11, color: "var(--ink-4)" }}>y {issue.affectedLabels.length - 12} más…</li>
            )}
          </ul>
        )}
      </div>
    </details>
  );
}

/** Mirror of IssueRow for a check that's already passing (WEB-AUDIT-ISSUES-1 fase 2, founder-requested "Correcto" tab) — same data issues.ts already computes, just never shown before. */
export function PassingRow({ passing }: { passing: TechnicalPassingCheck }) {
  const meta = CHECK_META[passing.check];
  const scopeLabel = SINGLE_FACT_CHECKS.has(passing.check)
    ? "Encontrado"
    : `${passing.passedCount} de ${passing.applicableCount} ${pluralizeUnit(meta.unit, passing.applicableCount)}`;
  return (
    <div className="wa2-passing-row">
      <span className="wa2-check-icon">
        <Icon name="check" size={12} />
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 650, color: "var(--ink-3)", textDecoration: "line-through" }}>{meta.label}</div>
        <div style={{ fontSize: 10.5, color: "var(--ink-4)" }}>{scopeLabel}</div>
      </div>
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
