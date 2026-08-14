import { Icon } from "@/components/ui/icon";
import type {
  TechnicalIssue,
  TechnicalPassingCheck,
  IssueCheckKey,
  IssueSeverity
} from "@/lib/web-audit/issues";
import type { LlmsTxtResult, PublishStep } from "@/lib/web-audit/llms-txt";
import type { SitemapStep } from "@/lib/web-audit/sitemap";
import { LlmsTxtBlock } from "../llms-txt-block";
import { SitemapStepsBlock } from "../sitemap-steps-block";

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

/**
 * Presentation-layer labels/guidance for lib/web-audit/issues.ts's technical
 * checks (WEB-AUDIT-ISSUES-1 fase 2). Deterministic, aggregate-level text —
 * same rationale as buildPageCheckGuidance (no LLM, no interpretation), just
 * phrased for "N pages fail this" instead of one page's own detail.
 */
const CHECK_META: Record<IssueCheckKey, { label: string; guidance: string; unit: "página" | "bot" }> = {
  structured_data: {
    label: "Datos estructurados",
    guidance: "Añade datos estructurados (JSON-LD) con un @type reconocido por los motores de IA: Article, FAQPage, HowTo, Product, Organization…",
    unit: "página"
  },
  single_h1: { label: "Un solo <h1> por página", guidance: "Usa un único <h1> en cada página afectada.", unit: "página" },
  two_h2: { label: "Al menos dos <h2>", guidance: "Añade al menos dos <h2> que estructuren la respuesta.", unit: "página" },
  answer_first_intro: {
    label: "Intro respuesta-primero",
    guidance: "Añade un párrafo de al menos 200 caracteres justo después del título que responda directamente a la pregunta principal.",
    unit: "página"
  },
  title_length: { label: "Título con longitud válida", guidance: "Ajusta el <title> a entre 15 y 70 caracteres.", unit: "página" },
  description_length: {
    label: "Meta description con longitud válida",
    guidance: "Ajusta la meta description a entre 50 y 160 caracteres.",
    unit: "página"
  },
  open_graph: { label: "Etiquetas Open Graph", guidance: "Añade etiquetas Open Graph (og:title y og:description).", unit: "página" },
  noindex: {
    label: "Página indexable",
    guidance: 'Quita la etiqueta <meta name="robots" content="noindex"> — mientras esté, ni Google ni los motores de IA pueden indexar la página.',
    unit: "página"
  },
  canonical: {
    label: "Canonical propio",
    guidance: 'Añade o corrige el <link rel="canonical"> para que apunte a esta misma URL en tu dominio.',
    unit: "página"
  },
  hreflang: {
    label: "Hreflang",
    guidance: 'Si estas páginas tienen versiones en otros idiomas o países, añade etiquetas <link rel="alternate" hreflang="...">.',
    unit: "página"
  },
  list_or_table: {
    label: "Listas o tablas",
    guidance: "Añade listas o tablas que estructuren la información — los motores de IA citan con más frecuencia contenido en ese formato.",
    unit: "página"
  },
  content_length: {
    label: "Contenido sustancial",
    guidance: "Amplía el contenido visible de la página — los motores de IA prefieren respuestas sustanciales.",
    unit: "página"
  },
  freshness: {
    label: "Contenido actualizado",
    guidance: "Actualiza el contenido y refresca su fecha de modificación (dateModified en el JSON-LD, o una etiqueta de última modificación).",
    unit: "página"
  },
  bot_blocked: { label: "Acceso de bots de IA", guidance: "Revisa tu robots.txt y quita la regla que bloquea a este motor.", unit: "bot" },
  llms_txt_missing: {
    label: "llms.txt",
    guidance: "Publica un fichero llms.txt en la raíz de tu dominio con una guía de lectura para los modelos de IA.",
    unit: "página"
  },
  sitemap_missing: {
    label: "sitemap.xml",
    guidance:
      "Un sitemap le dice a los buscadores y a los motores de IA qué páginas tienes. Casi seguro que tu plataforma ya sabe generarlo — es cuestión de activarlo, no de escribirlo.",
    unit: "página"
  }
};

function pluralizeUnit(unit: "página" | "bot", count: number): string {
  if (unit === "bot") return count === 1 ? "bot" : "bots";
  return count === 1 ? "página" : "páginas";
}

const SEVERITY_META: Record<IssueSeverity, { label: string; stripe: string; badgeClass: string }> = {
  critical: { label: "Crítico", stripe: "var(--wa-crit)", badgeClass: "badge-neg" },
  warning: { label: "Aviso", stripe: "var(--warn)", badgeClass: "badge-warn" },
  improvement: { label: "Mejora", stripe: "var(--wa-improve)", badgeClass: "badge-neutral" }
};

const SINGLE_FACT_CHECKS = new Set<IssueCheckKey>(["llms_txt_missing", "sitemap_missing"]);

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
  const scopeLabel = SINGLE_FACT_CHECKS.has(issue.check)
    ? "No encontrado"
    : `${issue.affectedCount} de ${issue.applicableCount} ${pluralizeUnit(meta.unit, issue.applicableCount)}`;

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
