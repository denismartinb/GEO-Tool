import Link from "next/link";
import { after } from "next/server";
import { Icon } from "@/components/ui/icon";
import { Delta } from "@/components/ui/delta";
import { InfoTip } from "@/components/ui/info-tip";
import { Gauge } from "@/components/ui/gauge";
import { ScanStatePill } from "@/components/scan-state-pill";
import { requireUser } from "@/lib/auth";
import { requireActiveProject } from "@/lib/project-workspace";
import { isProOrAbove } from "@/lib/billing";
import { parseCoverageMap } from "@/lib/web-audit/coverage-map";
import { buildLlmsTxt, publishSteps, type LlmsTxtResult, type PublishStep } from "@/lib/web-audit/llms-txt";
import { sitemapSteps, type SitemapStep } from "@/lib/web-audit/sitemap";
import {
  buildWebAuditSummary,
  buildCitationWindowCandidates,
  type PromptResultLite,
  type ClassifiedTopic,
  type TopicOutcome
} from "@/lib/web-audit/opportunity-matrix";
import { buildCoverageTrend } from "@/lib/web-audit/trend";
import { buildGlobalScore } from "@/lib/web-audit/global-score";
import { isDeltaTrustworthy, SMALL_SAMPLE_THRESHOLD } from "@/lib/web-audit/sample-confidence";
import { WEB_AUDIT_JOB_TYPE, WEB_AUDIT_STALE_LOCK_MS } from "@/lib/web-audit/audit-job";
import { deriveAuditPillState, isWebAuditJobDue } from "@/lib/web-audit/audit-liveness";
import { isAutoWebAuditEnabled, triggerWebAuditRun } from "@/lib/web-audit/audit-dispatch";
import { WebAuditProvider } from "./web-audit-context";
import { WebAuditDriveNotice } from "./web-audit-drive-notice";
import { AuditTabsProvider, AuditTabBar, AuditTabPanel } from "./audit-tabs";
import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";
import type { BotAccessReport, BotAgent } from "@/lib/web-audit/robots";
import { buildPageCheckGuidance } from "@/lib/web-audit/page-checks";
import {
  buildTechnicalIssuesReport,
  failingPageChecks,
  type TechnicalIssue,
  type TechnicalIssuesReport,
  type TechnicalPassingCheck,
  type IssueCheckKey,
  type IssueSeverity
} from "@/lib/web-audit/issues";
import { buildPageFixes, type PageFixContext } from "@/lib/web-audit/page-fixes";
import { PageFixBlock } from "./page-fix-block";
import { LlmsTxtBlock } from "./llms-txt-block";
import { SitemapStepsBlock } from "./sitemap-steps-block";

// Server Actions invoked from this page (auditDomainCoverageAction) run
// several sequential Gemini grounding calls up to COVERAGE_TOTAL_BUDGET_MS
// (~45s) — same ADR-0003 rationale as the Escaneos page's maxDuration.
export const maxDuration = 60;

// WEB-AUDIT-R3 (founder-approved 2026-07-12) rescaled page-checks.ts's point
// weights and added new sub-checks — the SAME page's pageScore can differ
// before/after this ships even with zero content change. A snapshot taken
// before this date used the old (narrower) criteria; the banner below flags
// that explicitly so a lower score never reads as a silent regression. Purely
// a display cutoff — self-expiring the moment a project re-audits.
const TECHNICAL_CRITERIA_EXPANDED_AT = new Date("2026-07-13T00:00:00Z");

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Madrid"
  });
}

// Display names for the AI-bot user agents tracked by robots.ts — the
// UA token stays visible alongside it (badges), since that's what actually
// appears in a robots.txt file and what the founder would go verify.
const BOT_ENGINE_LABELS: Record<BotAgent, string> = {
  GPTBot: "OpenAI (ChatGPT)",
  "OAI-SearchBot": "OpenAI (búsqueda)",
  "Google-Extended": "Google (Gemini)",
  PerplexityBot: "Perplexity",
  ClaudeBot: "Anthropic (Claude)",
  "anthropic-ai": "Anthropic (legado)",
  Bingbot: "Microsoft (Copilot/Bing)"
};

const PAGE_SKIP_LABELS: Record<Exclude<PageAuditEntry["status"], "analyzed">, string> = {
  skipped_offsite: "Descartada: fuera del dominio verificado",
  // Distinct from skipped_offsite (WEB-AUDIT-2 bug report, 2026-07-11): a page
  // whose hostname genuinely IS the audited domain but whose DNS resolution
  // couldn't be verified safe (lookup error/timeout, or a resolved private
  // address) — never the same thing as "not your domain". Check the Vercel
  // function logs (lib/web-audit/fetch-page.ts's dns_lookup_failed /
  // dns_resolved_unsafe_ip lines) for the actual reason.
  skipped_unsafe_ip: "Descartada: no se ha podido verificar de forma segura la IP de este dominio",
  skipped_not_html: "Descartada: la respuesta no es HTML",
  skipped_timeout: "Descartada: tiempo de carga agotado",
  skipped_error: "Descartada: no se ha podido cargar",
  skipped_budget: "Sin comprobar: límite de tiempo de la auditoría"
};

function freshnessLabel(status: "fresh" | "aging" | "stale" | "unknown"): string {
  switch (status) {
    case "fresh":
      return "Actualizada";
    case "aging":
      return "Empieza a desactualizarse";
    case "stale":
      return "Desactualizada";
    default:
      return "Sin fecha detectada";
  }
}

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
function IssueRow({
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
function PassingRow({ passing }: { passing: TechnicalPassingCheck }) {
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

function CheckDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: ok ? "var(--ink-2)" : "var(--ink-4)" }}>
      <Icon name={ok ? "check" : "x"} size={11} />
      {label}
    </span>
  );
}

/** Shared semantic color for any 0-100 score (gauge, rings, mini bars): red <40, amber 40-69, green ≥70. */
function scoreColor(score: number | null): string {
  if (score === null) return "var(--ink-4)";
  return score < 40 ? "var(--neg-ink)" : score < 70 ? "var(--warn)" : "var(--pos)";
}

/**
 * Hero "Preparación GEO" gauge — the SAME shared `Gauge` component Overview
 * uses (270° sweep, gradient stroke, Bricolage numeral via `.gauge-num`),
 * not the bespoke flat-arc SVG this page had before (founder-approved
 * 2026-08-02: "los gauges son muy distintos" del artefacto — that bespoke
 * version never got the visual treatment the rest of the console already
 * has). `.wa2-scope .gauge-num` in globals.css gives it the same
 * Bricolage/gradient treatment `.ov2-scope`/`.cit2-scope` already apply.
 */
/**
 * Half-circle variant, matching the approved mockup's "Salud del sitio" dial
 * (founder review 2026-08-03 — second pass on this same point: adopting the
 * shared component fixed consistency but not the shape).
 */
function ScoreGauge({ score }: { score: number | null }) {
  const size = 168;
  const stroke = 15;
  if (score === null) {
    const height = size / 2 + stroke / 2;
    const r = (size - stroke) / 2;
    return (
      <svg width={size} height={height} role="img" aria-label="Diagnóstico general sin datos" style={{ flexShrink: 0 }}>
        <path
          d={`M ${stroke / 2} ${size / 2} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${size / 2}`}
          fill="none"
          stroke="var(--surface-sunk)"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        <text x="50%" y={size / 2 - 4} textAnchor="middle" style={{ fontSize: 26, fontWeight: 700, fill: "var(--ink-4)" }}>
          —
        </text>
      </svg>
    );
  }
  return <Gauge value={score} size={size} stroke={stroke} variant="semi" />;
}

/** Small Lighthouse-style score ring for per-page rows in Salud técnica (WEB-AUDIT-R4). `label` names WHICH page the ring belongs to — QA report: a screen reader tabbing the page list heard the same generic phrase on every ring. */
function ScoreRing({ score, label }: { score: number; label: string }) {
  const size = 38;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = scoreColor(score);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Salud técnica de ${label}: ${score} de 100`}
      style={{ flexShrink: 0 }}
    >
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-soft)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${(score / 100) * c} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fontSize: 11.5, fontWeight: 800, fill: "var(--ink)", fontVariantNumeric: "tabular-nums" }}
      >
        {score}
      </text>
    </svg>
  );
}

/** 4px progress bar under a hero tile / history row (WEB-AUDIT-R4). */
function MiniBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 4, borderRadius: 999, background: "var(--line-soft)", overflow: "hidden" }}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: "100%", borderRadius: 999, background: color }} />
    </div>
  );
}

function SubScoreTile({
  label,
  value,
  hint,
  delta,
  pct,
}: {
  label: string;
  value: string;
  hint: string;
  /** null also when the delta exists but isn't trustworthy enough to show — see isDeltaTrustworthy. */
  delta: number | null;
  /** 0-100 fill for the tile's progress bar; null → no bar (signal never computed). */
  pct: number | null;
}) {
  return (
    <div style={{ padding: "9px 11px", background: "var(--surface-2)", borderRadius: 10, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--ink-4)", flex: 1, minWidth: 0 }}>
          {label}
        </div>
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-.01em", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
        {value}
        {delta !== null && delta !== 0 && (
          <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 600 }}>
            <Delta value={delta} suffix=" pt" />
          </span>
        )}
      </div>
      {pct !== null && (
        <div style={{ marginTop: 6 }}>
          <MiniBar pct={pct} color={scoreColor(pct)} />
        </div>
      )}
      <div style={{ fontSize: 10.5, color: "var(--ink-4)", marginTop: pct !== null ? 5 : 2 }}>{hint}</div>
    </div>
  );
}

/**
 * WEB-AUDIT-TECH-ALL-PLANS-1: coverage/surfacing stay Pro-only (batched
 * Gemini grounding, genuinely expensive) while the technical tile next to
 * them now works on every plan. Reusing SubScoreTile's "—"/"Sin auditar"
 * here would claim "never run" when the real fact is "not included in your
 * plan" — a different, false claim about the user's own account
 * (`.claude/rules/web-audit.md`: "Ningún número de relleno"). Same box, same
 * grid slot as SubScoreTile so the three-tile row never reflows by plan.
 */
function LockedSubScoreTile({ label, hint }: { label: string; hint: string }) {
  return (
    <div style={{ padding: "9px 11px", background: "var(--surface-2)", borderRadius: 10, minWidth: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--ink-4)" }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
        <Icon name="lock" size={12} />
        <span style={{ fontSize: 14, fontWeight: 750, color: "var(--ink-3)" }}>No está en tu plan</span>
      </div>
      <div style={{ fontSize: 10.5, color: "var(--ink-4)", marginTop: 5 }}>{hint}</div>
      <Link
        href="/dashboard/settings/billing"
        style={{ fontSize: 10.5, fontWeight: 650, color: "var(--accent)", marginTop: 4, display: "inline-block" }}
      >
        Ver planes
      </Link>
    </div>
  );
}

function PageAuditRow({ page, fixContext }: { page: PageAuditEntry; fixContext: PageFixContext }) {
  let path: string;
  try {
    path = new URL(page.url).pathname || "/";
  } catch {
    path = page.url;
  }

  if (page.status !== "analyzed" || !page.check) {
    const skipLabel = page.status === "analyzed" ? PAGE_SKIP_LABELS.skipped_error : PAGE_SKIP_LABELS[page.status];
    return (
      <div style={{ padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12.5, fontWeight: 650, color: "var(--ink-3)", overflowWrap: "anywhere" }}>{path}</span>
          <span style={{ fontSize: 10.5, color: "var(--ink-4)" }}>{page.contextLabel}</span>
        </div>
        <p style={{ fontSize: 11.5, color: "var(--ink-4)", margin: "4px 0 0" }}>{skipLabel}</p>
      </div>
    );
  }

  const { check } = page;
  const guidance = buildPageCheckGuidance(check);
  // `failingPageChecks` (issues.ts) rather than re-deriving the predicates
  // here: PAGE_CHECKS stays the one definition of what "failing" means, and
  // checks never measured on this page are excluded instead of being shown
  // as broken (legacy pre-R3 snapshots).
  const fixes = buildPageFixes(failingPageChecks(check), page, fixContext);
  // Collapsed by default (WEB-AUDIT-R1): 10 pages × up to 7 guidance bullets
  // was the page's biggest wall of text. The summary row keeps the verdict
  // (score + failing-check count); the how-to-fix detail is one tap away.
  const failingCount = guidance.length;
  return (
    <details className="wa-details">
      <summary>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 650, color: "var(--ink)", overflowWrap: "anywhere" }}>{path}</div>
          <div style={{ fontSize: 10.5, color: "var(--ink-4)" }}>
            {page.contextLabel}
            {failingCount > 0 ? ` · ${failingCount} ${failingCount === 1 ? "mejora pendiente" : "mejoras pendientes"}` : " · todo en orden"}
          </div>
        </div>
        {/* Lighthouse-style ring instead of a flat neutral badge (WEB-AUDIT-R4):
            same semantic thresholds as the hero gauge, so a failing page reads
            red at a glance without opening it. */}
        <ScoreRing score={check.pageScore} label={path} />
        <span className="wa-chev">
          <Icon name="chevDown" size={14} />
        </span>
      </summary>
      <div className="wa-details-body">
        {/* LEGACY SNAPSHOTS: `check` is a persisted JSONB row; a snapshot
            taken before R3 has NO indexability/citability objects and no
            metadata.ogOk (production crash 2026-07-12 on exactly this render:
            "Cannot read properties of undefined (reading 'noindex')"). The
            R3 dots render only when their sub-check was actually measured —
            an old snapshot shows the original 4 dots until re-audited (the
            "criterios ampliados" note above the cards already tells the
            founder to re-audit). Same rationale as buildPageCheckGuidance's
            legacy guards. */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <CheckDot ok={check.structuredData.pass} label="Datos estructurados" />
          <CheckDot
            ok={check.answerFormat.hasOneH1 && check.answerFormat.hasTwoH2 && check.answerFormat.hasAnswerFirstIntro}
            label="Formato respuesta-primero"
          />
          <CheckDot
            ok={check.metadata.titleOk && check.metadata.descriptionOk && check.metadata.ogOk !== false}
            label={check.metadata.ogOk === undefined ? "Metadatos" : "Metadatos + Open Graph"}
          />
          <CheckDot ok={check.freshness.status === "fresh"} label={freshnessLabel(check.freshness.status)} />
          {/* WEB-AUDIT-R3 (founder-approved 2026-07-12): indexing + citability signals. */}
          {check.indexability && (
            <>
              <CheckDot ok={!check.indexability.noindex} label="Indexable" />
              <CheckDot ok={check.indexability.canonicalOk} label="Canonical propio" />
              {/* hreflang is never shown as a hard failure elsewhere (guidance
                  text is conditional — a single-market page genuinely has none
                  to add) but the dot itself stays a simple presence signal,
                  consistent with every other dot on this row. */}
              <CheckDot ok={check.indexability.hreflangPresent} label="Hreflang" />
            </>
          )}
          {check.citability && (
            <>
              <CheckDot ok={check.citability.hasListOrTable} label="Listas o tablas" />
              <CheckDot ok={check.citability.contentOk} label="Contenido sustancial" />
            </>
          )}
        </div>
        {/* `!= null` (loose), not `!== null`: legacy PageAuditEntry rows lack
            fetchMs/htmlBytes entirely (undefined), which `!== null` would let
            through as "Tiempo de respuesta: undefined ms". */}
        {(page.fetchMs != null || page.htmlBytes != null) && (
          <p style={{ fontSize: 10.5, color: "var(--ink-4)", margin: "8px 0 0" }}>
            {page.fetchMs != null && `Tiempo de respuesta: ${page.fetchMs} ms`}
            {page.fetchMs != null && page.htmlBytes != null && " · "}
            {page.htmlBytes != null && `Tamaño HTML: ${(page.htmlBytes / 1024).toFixed(1)} KB`}
          </p>
        )}
        {/* Deterministic "qué hacer" per failing sub-check (no LLM — see
            buildPageCheckGuidance), reviewed with geo-strategy 2026-07-11:
            founder report was that seeing red X's with no explanation left no
            idea what to actually do. An AI-generated draft (rewritten title/
            description/intro) is a separate, larger feature explicitly parked
            for its own Task Intake — this is only the deterministic half. */}
        {guidance.length > 0 && (
          <ul
            style={{
              fontSize: 11.5,
              color: "var(--ink-3)",
              lineHeight: 1.5,
              margin: "8px 0 0",
              paddingLeft: 18,
              listStyleType: "disc",
              listStylePosition: "outside",
              display: "flex",
              flexDirection: "column",
              gap: 4
            }}
          >
            {guidance.map((line, i) => (
              <li key={i} style={{ display: "list-item" }}>{line}</li>
            ))}
          </ul>
        )}
        {/* Fase 3b: the copyable fix for each failing check that HAS one.
            Founder review 2026-08-03: "en páginas está muy bien, pero no
            damos una solución para mejorar la puntuación de cada página" —
            the prose above says what to change, these say it in code you can
            paste. Deliberately after the guidance, not instead of it: several
            checks (h1, intro, listas, extensión) are edits to the page's own
            content and correctly produce no snippet at all. */}
        {fixes.length > 0 && (
          <div className="wa2-fixes">
            {fixes.map((fix) => (
              <PageFixBlock key={fix.check} fix={fix} />
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

/**
 * Cómo se lee un sitemap, ahora que lo parseamos.
 *
 * `bots.sitemap` es opcional: los snapshots anteriores a WEB-AUDIT-SITEMAP-1
 * sólo tienen `sitemapFound`, así que ahí se conserva exactamente el texto de
 * antes. Nada se recalcula sobre un snapshot viejo — sería inventar un dato
 * que aquella auditoría nunca midió.
 *
 * El recuento sólo se muestra como cifra cuando el fichero cabía entero. Si
 * vino truncado por el tope de 128 KB, es un suelo y se dice "más de N": dar
 * el prefijo como total sería una métrica fabricada.
 */
function describeSitemap(bots: BotAccessReport): {
  sitemapIsReal: boolean;
  sitemapBadge: string;
  sitemapDetail: string | null;
} {
  // "No pudimos comprobarlo" gana a cualquier lectura del contenido: si el
  // servidor nos rechazó, lo que tengamos no es evidencia de nada.
  if (bots.probes?.sitemap === "unknown") {
    return {
      sitemapIsReal: false,
      sitemapBadge: "Sin comprobar",
      sitemapDetail:
        "No hemos podido acceder a la dirección (bloqueo, error del servidor o tiempo agotado). No significa que falte."
    };
  }

  const report = bots.sitemap;

  if (report === undefined) {
    return {
      sitemapIsReal: bots.sitemapFound,
      sitemapBadge: bots.sitemapFound ? "Encontrado" : "No encontrado",
      sitemapDetail: null
    };
  }

  if (!report) {
    return { sitemapIsReal: false, sitemapBadge: "No encontrado", sitemapDetail: null };
  }

  if (report.kind === "invalid") {
    return {
      sitemapIsReal: false,
      sitemapBadge: "No es un sitemap",
      sitemapDetail: "La dirección responde, pero lo que devuelve no es XML de sitemap — normalmente una página de error."
    };
  }

  if (report.kind === "index") {
    return {
      sitemapIsReal: true,
      sitemapBadge: "Índice de sitemaps",
      sitemapDetail: `Apunta a ${report.locCount} ${report.locCount === 1 ? "sitemap" : "sitemaps"}. No se abren: seguirlos sería rastrear tu web, y esta auditoría no lo hace.`
    };
  }

  return {
    sitemapIsReal: true,
    sitemapBadge: "Encontrado",
    sitemapDetail: report.truncated
      ? `Más de ${report.locCount} URLs (el fichero es más largo de lo que leemos).`
      : `${report.locCount} ${report.locCount === 1 ? "URL" : "URLs"}.`
  };
}

function BotAccessCard({ bots, checkedAt }: { bots: BotAccessReport; checkedAt: string }) {
  const { sitemapIsReal, sitemapBadge, sitemapDetail } = describeSitemap(bots);
  return (
    <div className="card">
      <div style={{ padding: "13px 16px 0" }}>
        <div style={{ fontSize: 13.5, fontWeight: 750 }}>Acceso de bots de IA</div>
        <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
          Qué motores de IA puede rastrear tu robots.txt. Comprobado {formatDate(checkedAt)}.
        </div>
      </div>
      <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
        {!bots.robotsFound && (
          <p style={{ fontSize: 11.5, color: "var(--ink-4)", margin: "0 0 4px" }}>
            {bots.probes?.robots === "unknown"
              ? "No hemos podido acceder a robots.txt (bloqueo, error del servidor o tiempo agotado). Los permisos de abajo son el comportamiento por defecto, no lo que dice tu fichero."
              : "No se ha encontrado robots.txt — se asume acceso permitido por defecto."}
          </p>
        )}
        {bots.bots.map((bot) => (
          <div
            key={bot.agent}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", borderRadius: 8, background: "var(--surface-2)" }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 650, color: "var(--ink)" }}>{BOT_ENGINE_LABELS[bot.agent]}</div>
              <div style={{ fontSize: 10.5, color: "var(--ink-4)", fontFamily: "var(--mono)" }}>{bot.agent}</div>
            </div>
            <span className={`badge ${bot.allowed ? "badge-pos" : "badge-neg"}`}>{bot.allowed ? "Permitido" : "Bloqueado"}</span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", borderRadius: 8, background: "var(--surface-2)" }}>
          <div style={{ fontSize: 12, fontWeight: 650, color: "var(--ink)" }}>llms.txt</div>
          <span className={`badge ${bots.llmsTxtFound ? "badge-pos" : "badge-outline"}`}>
            {bots.llmsTxtFound
              ? `Encontrado (${bots.llmsTxtBytes} bytes)`
              : bots.probes?.llmsTxt === "unknown"
                ? "Sin comprobar"
                : "No encontrado"}
          </span>
        </div>
        {/* WEB-AUDIT-SITEMAP-1: ya no es sólo alcanzabilidad. `bots.sitemap`
            es opcional — un snapshot anterior a esta fase no lo trae, y
            entonces se degrada al texto de antes en vez de inventar un
            estado. Un "Encontrado" a secas era engañoso en el caso más común
            de fallo: un 404 blando (página HTML de error servida con 200),
            que respondía y por tanto contaba como encontrado. */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 8, background: "var(--surface-2)" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 650, color: "var(--ink)" }}>sitemap.xml</div>
            {sitemapDetail && (
              <div style={{ fontSize: 10.5, color: "var(--ink-4)", marginTop: 2 }}>{sitemapDetail}</div>
            )}
          </div>
          <span className={`badge ${sitemapIsReal ? "badge-pos" : "badge-outline"}`} style={{ flexShrink: 0 }}>
            {sitemapBadge}
          </span>
        </div>
      </div>
    </div>
  );
}

type TrendChartPoint = {
  generatedAt: string;
  coveragePct: number | null;
  surfacingPct: number | null;
  conclusiveCount: number;
  coveredCount: number;
};

/**
 * A hollow (stroke-only) point marker instead of the usual filled dot when
 * that point's sample is small (WEB-AUDIT-R6 phase 1, geo-strategy review
 * 2026-07-17) — a visual cue, per point along the whole series, that a swing
 * around a hollow marker is more likely sampling noise than real movement.
 * The legend below the chart spells this out in words too, never relying on
 * the shape alone.
 */
function TrendPointMarker({ cx, cy, color, isLast, isSmallSample }: { cx: number; cy: number; color: string; isLast: boolean; isSmallSample: boolean }) {
  const r = isLast ? 4 : 3;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill={isSmallSample ? "var(--surface)" : color}
      stroke={color}
      strokeWidth={isSmallSample ? 1.5 : 2}
    />
  );
}

function TrendChart({ points }: { points: TrendChartPoint[] }) {
  const W = 440;
  const H = 190;
  const padL = 42;
  const padR = 12;
  const top = 18;
  const bottom = 170;
  const stepX = points.length > 1 ? (W - padL - padR) / (points.length - 1) : 0;
  const yFor = (pct: number) => bottom - (pct / 100) * (bottom - top);
  const xFor = (i: number) => padL + i * stepX;

  function pathFor(key: "coveragePct" | "surfacingPct"): string | null {
    const coords: string[] = [];
    points.forEach((p, i) => {
      const v = p[key];
      if (v === null) return;
      coords.push(`${i === 0 || coords.length === 0 ? "M" : "L"} ${xFor(i)} ${yFor(v)}`);
    });
    return coords.length > 0 ? coords.join(" ") : null;
  }

  const covPath = pathFor("coveragePct");
  const surPath = pathFor("surfacingPct");
  const lastCovIdx = [...points].map((p, i) => ({ p, i })).reverse().find(({ p }) => p.coveragePct !== null)?.i;
  const lastSurIdx = [...points].map((p, i) => ({ p, i })).reverse().find(({ p }) => p.surfacingPct !== null)?.i;

  const ariaLabel = `Cobertura ${points[0]?.coveragePct ?? "sin dato"}% a ${lastCovIdx !== undefined ? points[lastCovIdx].coveragePct : "sin dato"}%; implementación ${points[0]?.surfacingPct ?? "sin dato"}% a ${lastSurIdx !== undefined ? points[lastSurIdx].surfacingPct : "sin dato"}% en ${points.length} auditorías.`;

  // Consecutive audits over the same scan share a calendar date — render each
  // date label once (founder screenshot: "9 jul 2026 · 9 jul 20…" repeated,
  // truncated, on the x-axis).
  const xLabels = points.map((p) => formatDate(p.generatedAt));

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
      <g stroke="var(--line-soft)" strokeWidth={1}>
        {[0, 25, 50, 75, 100].map((pct) => (
          <line key={pct} x1={padL} y1={yFor(pct)} x2={W - padR} y2={yFor(pct)} />
        ))}
      </g>
      <g fontSize={10} fill="var(--ink-4)" textAnchor="end">
        {[100, 75, 50, 25, 0].map((pct) => (
          <text key={pct} x={padL - 6} y={yFor(pct) + 3}>
            {pct}%
          </text>
        ))}
      </g>
      <g fontSize={10} fill="var(--ink-4)" textAnchor="middle">
        {points.map((p, i) => {
          if (i > 0 && xLabels[i] === xLabels[i - 1]) return null;
          return (
            <text key={p.generatedAt} x={xFor(i)} y={H - 4}>
              {xLabels[i]}
            </text>
          );
        })}
      </g>
      {covPath && <path d={covPath} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
      {surPath && <path d={surPath} fill="none" stroke="var(--pos)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
      {points.map((p, i) =>
        p.coveragePct !== null ? (
          <TrendPointMarker
            key={`cov-${p.generatedAt}`}
            cx={xFor(i)}
            cy={yFor(p.coveragePct)}
            color="var(--accent)"
            isLast={i === lastCovIdx}
            isSmallSample={p.conclusiveCount < SMALL_SAMPLE_THRESHOLD}
          />
        ) : null
      )}
      {points.map((p, i) =>
        p.surfacingPct !== null ? (
          <TrendPointMarker
            key={`sur-${p.generatedAt}`}
            cx={xFor(i)}
            cy={yFor(p.surfacingPct)}
            color="var(--pos)"
            isLast={i === lastSurIdx}
            isSmallSample={p.coveredCount < SMALL_SAMPLE_THRESHOLD}
          />
        ) : null
      )}
    </svg>
  );
}

export default async function WebAuditPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireActiveProject(projectId);
  const { supabase, user } = await requireUser();

  // Two capabilities, not one (WEB-AUDIT-TECH-ALL-PLANS-1, founder-approved
  // 2026-08-05). Coverage (DOMAIN-COVERAGE-1) still reads the raw plan
  // column directly via isProOrAbove, never getPlanForUser/resolvePlan
  // (route rule, .claude/rules/web-audit.md) — it runs batched Gemini
  // grounding calls and stays genuinely Pro-only. The technical half (pure
  // fetch + regex, zero LLM — lib/web-audit/technical-audit.ts) is now
  // available on every plan: GEO-SCORE-V4 (docs/adr/0033) made
  // `readiness_score` a real .20 GEO Score component, so gating it made the
  // headline metric measure a different number of signals depending on plan.

  // Always true today. Kept as a named capability rather than inlining
  // `true` at every call site so a future plan tier ever needs to gate it
  // again, there is one place to flip. Declarado aquí arriba (antes iba junto
  // a `canAuditCoverage`) porque el lote de abajo lo necesita y, a diferencia
  // de aquél, no depende de `profileRow`.
  const canAuditTechnical = true;

  // Las cinco lecturas independientes de esta pantalla, en paralelo
  // (PRELAUNCH-HARDENING-1 Fase V, V7). Estaban encadenadas una tras otra
  // aunque ninguna consume el resultado de la anterior: el usuario pagaba la
  // suma de cinco viajes a Supabase en vez del más lento de los cinco. Lo que
  // sí depende de algo (el `jobs` de abajo necesita `latestRunRow`) sigue
  // detrás, que es exactamente donde tiene que estar.
  const [
    { data: profileRow },
    { data: latestRunRow },
    { data: historyRows },
    { data: technicalHistoryRows },
    { data: activeCampaignRow }
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("current_plan")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("scan_runs")
      .select("id, finished_at, created_at")
      .eq("project_id", projectId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("generated_solutions")
      .select("sanitized_content, created_at")
      .eq("project_id", projectId)
      .eq("generation_type", "domain_coverage")
      .is("recommendation_id", null)
      .eq("status", "completed")
      .eq("is_sanitized", true)
      .order("created_at", { ascending: false })
      .limit(12),
    canAuditTechnical
    ? supabase
        .from("web_audit_snapshots")
        .select("readiness_score, pages, bots, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(8)
    : { data: [] },
    supabase
      .from("generated_solutions")
      .select("sanitized_content, updated_at")
      .eq("project_id", projectId)
      .eq("generation_type", "domain_coverage")
      .is("recommendation_id", null)
      .eq("status", "running")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  const canAuditCoverage = isProOrAbove(profileRow?.current_plan as string | undefined);





  // WEB-AUDIT-2: technical-audit snapshots, most recent first. Rendered
  // as-is — this page never re-triggers the audit itself, only the button
  // does (lib/web-audit/technical-audit.ts owns the cache/rate-limit rules).
  //
  // WEB-AUDIT-ISSUES-1 fase 2 (founder-approved 2026-08-02): widened from
  // a single row to the last 8 — the "Problemas" tab's críticos/avisos
  // mini-trend and the readiness-score delta both need more than the latest
  // snapshot, which nothing on this page loaded before this phase.
  //
  // WEB-AUDIT-TECH-ALL-PLANS-1: queried for every plan now — this used to be
  // skipped entirely under `!canAudit` (the old single Pro gate), which made
  // a non-Pro project's technical snapshot null by construction even on a
  // project that had one. `canAuditTechnical` is always true; the ternary
  // stays so a future gate has one line to change, not this query's shape.

  const technicalHistory = (technicalHistoryRows ?? []) as Array<{
    readiness_score: number | null;
    pages: PageAuditEntry[];
    bots: BotAccessReport;
    created_at: string;
  }>;
  const technicalSnapshot = technicalHistory[0] ?? null;

  // Pure aggregation (lib/web-audit/issues.ts, WEB-AUDIT-ISSUES-1 fase 1) run
  // over each loaded snapshot — cheap, no I/O, no new query per point.
  // The chronological critical/warning series this used to build fed the two
  // sparklines beside the Críticos/Avisos counts; both were removed in the
  // founder review of 2026-08-03, so the series went with them rather than
  // being left computed and unread on every render.
  const technicalReportsNewestFirst = technicalHistory.map((snap) => ({
    createdAt: snap.created_at,
    report: buildTechnicalIssuesReport(snap.pages, snap.bots)
  }));
  const currentTechnicalReport: TechnicalIssuesReport | null = technicalReportsNewestFirst[0]?.report ?? null;
  const previousTechnicalReport: TechnicalIssuesReport | null = technicalReportsNewestFirst[1]?.report ?? null;
  const technicalScoreDelta =
    currentTechnicalReport?.actualReadinessScore != null && previousTechnicalReport?.actualReadinessScore != null
      ? currentTechnicalReport.actualReadinessScore - previousTechnicalReport.actualReadinessScore
      : null;

  // WEB-AUDIT-CHAIN: detect a campaign left "running" for the current scan
  // (from a previous batch, whether the user is still on this page or came
  // back after navigating away/closing the tab) so the audit button can
  // resume driving it automatically — same shape as AutoExecuteScan resuming
  // a pending/running scan_run on Escaneos. Read server-side, not from any
  // client-only state, so it survives a full page reload.

  const activeCampaignMap = parseCoverageMap(activeCampaignRow?.sanitized_content ?? null);
  const hasActiveCampaign = Boolean(
    activeCampaignMap && latestRunRow && activeCampaignMap.scanId === latestRunRow.id
  );

  // WEB-AUDIT-DRIVE-1: the audit job for this run, read through RLS
  // (`jobs_select_owner`) rather than the service client — this is a render
  // path and the owner is entitled to its own job's state.
  //
  // Two things depend on it, and neither could be answered from the campaign
  // row alone: whether the pill may claim the audit is moving, and whether
  // anything is owed that opening this page should wake up.
  const { data: auditJobRow } = latestRunRow
    ? await supabase
        .from("jobs")
        .select("status, next_attempt_at, locked_at")
        .eq("project_id", projectId)
        .eq("run_id", latestRunRow.id)
        .eq("job_type", WEB_AUDIT_JOB_TYPE)
        .maybeSingle()
    : { data: null };

  const auditPillState = deriveAuditPillState({
    campaignUpdatedAt: hasActiveCampaign ? activeCampaignRow?.updated_at : null,
    jobStatus: auditJobRow?.status
  });

  // Wake the worker when this project has an audit owed to it. Until now the
  // only things that could start one were the `after()` dispatch at the end of
  // a scan and the 07:00 daily cron, so a lost dispatch meant the screen sat
  // on "Auditando…" until the next morning — and on a preview deployment,
  // where Vercel runs no crons at all, forever (2026-08-07).
  //
  // Safe to fire on a render: the worker claims jobs with the same atomic
  // conditional UPDATE the scan batches use, so a duplicate dispatch is a
  // no-op rather than a second audit, and the predicate only passes for a job
  // that is genuinely due or genuinely abandoned. Fire-and-forget via
  // `after()`, so the page's own response is never held up by it.
  if (
    auditJobRow &&
    isAutoWebAuditEnabled() &&
    isWebAuditJobDue({
      status: auditJobRow.status as string,
      nextAttemptAt: auditJobRow.next_attempt_at as string | null,
      lockedAt: auditJobRow.locked_at as string | null,
      staleLockMs: WEB_AUDIT_STALE_LOCK_MS
    })
  ) {
    after(() => triggerWebAuditRun());
  }
  let activeCampaignProgress: { covered: number; total: number } | null = null;
  if (hasActiveCampaign && activeCampaignMap) {
    const { count: activePromptCount } = await supabase
      .from("project_prompts")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("is_active", true);
    activeCampaignProgress = {
      covered: activeCampaignMap.topics.length,
      total: activePromptCount ?? activeCampaignMap.topics.length
    };
  }

  const maps = ((historyRows ?? []) as Array<{ sanitized_content: string | null }>)
    .map((row) => parseCoverageMap(row.sanitized_content))
    .filter((m): m is NonNullable<typeof m> => m !== null);

  const scanIds = Array.from(new Set(maps.map((m) => m.scanId)));

  const { data: resultRows } =
    scanIds.length > 0
      ? await supabase
          .from("scan_prompt_results")
          .select("id, prompt_id, run_id, extracted_json, provider, mentioned_competitors_count")
          .eq("project_id", projectId)
          .in("run_id", scanIds)
          .eq("status", "completed")
      : { data: [] };

  const resultsByScanId = new Map<string, PromptResultLite[]>();
  for (const row of (resultRows ?? []) as Array<PromptResultLite & { run_id: string }>) {
    const list = resultsByScanId.get(row.run_id) ?? [];
    list.push(row);
    resultsByScanId.set(row.run_id, list);
  }

  const latestMap = maps.length > 0 ? maps.reduce((a, b) => (a.generatedAt > b.generatedAt ? a : b)) : null;

  // WEB-AUDIT-R6 phase 2: citation is classified over a fixed window of
  // recent scans, not just the latest one (see opportunity-matrix.ts) — the
  // same deduped candidates list drives both this current summary and every
  // historical trend point (buildCoverageTrend), so they stay consistent.
  const citationWindowCandidates = buildCitationWindowCandidates(maps, resultsByScanId);
  const summary = latestMap
    ? buildWebAuditSummary({ coverage: latestMap, citationWindowCandidates, projectDomain: project.domain })
    : null;
  const trend = buildCoverageTrend({ maps, resultsByScanId, projectDomain: project.domain });

  // Brand + domain for the copyable fixes (fase 3b). `project.domain` is
  // already the normalized host used everywhere else on this page.
  const fixContext: PageFixContext = { projectName: project.name, domainNormalized: project.domain };

  // Fase 3a: the llms.txt the user can publish, built from the latest coverage
  // campaign. Null when no campaign has ever produced a verified page — the
  // builder refuses to emit a file that would be nothing but placeholders.
  const llmsTxtFile = buildLlmsTxt({
    brand: project.name,
    domainNormalized: project.domain,
    coverage: latestMap
  });
  const llmsPublishSteps = publishSteps(project.domain);
  const sitemapFixSteps = sitemapSteps(project.domain);

  const auditedScan = latestMap ? maps.find((m) => m.scanId === latestMap.scanId) : null;
  const auditedScanDate = auditedScan?.scanId === latestRunRow?.id ? latestRunRow?.finished_at ?? latestRunRow?.created_at : null;

  // WEB-AUDIT-R6 phase 1 (geo-strategy methodology review 2026-07-17):
  // coverage/citation are both sampled fresh per scan from Gemini's Google
  // Search grounding — a noisy sensor. With a small denominator, a single
  // sampling flip swings the percentage by double digits; showing that swing
  // as a bare "+17 pt" delta reads as precision the sample doesn't support.
  // A delta is only shown when BOTH the current and previous point clear
  // SMALL_SAMPLE_THRESHOLD (isDeltaTrustworthy) — never fabricated, never
  // silently rounded away, just withheld when the comparison itself would be
  // noise. The tile itself still always shows the real fraction (n/N).
  const previousPoint = trend.length >= 2 ? trend[trend.length - 2] : null;

  const previousCoveragePct = previousPoint?.coveragePct ?? null;
  const coverageDeltaTrustworthy =
    previousPoint !== null && isDeltaTrustworthy(summary?.conclusiveCount ?? 0, previousPoint.conclusiveCount);
  const coverageDelta =
    coverageDeltaTrustworthy &&
    summary?.coveragePct !== null &&
    summary?.coveragePct !== undefined &&
    previousCoveragePct !== null
      ? summary.coveragePct - previousCoveragePct
      : null;

  const previousSurfacingPct = previousPoint?.surfacingPct ?? null;
  const surfacingDeltaTrustworthy =
    previousPoint !== null && isDeltaTrustworthy(summary?.coveredCount ?? 0, previousPoint.coveredCount);
  const surfacingDelta =
    surfacingDeltaTrustworthy &&
    summary?.surfacingPct !== null &&
    summary?.surfacingPct !== undefined &&
    previousSurfacingPct !== null
      ? summary.surfacingPct - previousSurfacingPct
      : null;

  // WEB-AUDIT-R1: the hero's composite score — plain mean of the real signals
  // available (see lib/web-audit/global-score.ts). Its breakdown renders right
  // next to it, so the composite is never a black box; a component that has
  // never been computed (e.g. technical audit not yet run) is excluded, not
  // faked as 0.
  const globalScore = buildGlobalScore({
    coveragePct: summary?.coveragePct ?? null,
    surfacingPct: summary?.surfacingPct ?? null,
    technicalScore: technicalSnapshot?.readiness_score ?? null
  });

  // WEB-AUDIT-TECH-ALL-PLANS-1 (Director's call, 2026-08-05): a non-Pro
  // account can never populate coverage/surfacing, so `globalScore.score`
  // would silently equal the technical score anyway (mean of one value is
  // itself) — the actual problem was never the number, it was the caption
  // ("Media de 1 señal disponible… audita el resto para completarla"), which
  // reads as "not run yet" when the true fact is "not included in your
  // plan". Rather than keep the composite framing with a patched caption,
  // the non-Pro headline IS the technical score — one named signal, not a
  // same-valued disguised average. Pro's composite is untouched.
  const heroScore = canAuditCoverage ? globalScore.score : (technicalSnapshot?.readiness_score ?? null);

  // WEB-AUDIT-ISSUES-1 fase 2 (founder-approved 2026-08-02): el Plan de
  // acción (competitor extraction, join con `recommendations`, buildActionPlan
  // y su expansor) se retiró de esta pantalla entero — "no tiene sentido
  // aquí, debe estar en la página de recomendaciones". `grouped` sigue
  // haciendo falta para "Lo que ya funciona" y la pista de la tarjeta hero.
  const grouped: Record<TopicOutcome, ClassifiedTopic[]> = {
    performing: [],
    invisible: [],
    content_gap: [],
    open_opportunity: [],
    unverified_cited: [],
    inconclusive: []
  };
  for (const topic of summary?.topics ?? []) {
    grouped[topic.outcome].push(topic);
  }

  const analyzedPagesCount = technicalSnapshot ? technicalSnapshot.pages.filter((p) => p.status === "analyzed").length : 0;

  return (
    <WebAuditProvider projectId={projectId} autoStart={activeCampaignProgress} canAudit={canAuditCoverage}>
    <div className="page">
      {/* Sticky header */}
      <div className="ov-sticky-header">
        <div className="ov-sticky-left">
          <div>
            <p className="kicker" style={{ marginBottom: 2 }}>Auditoría web</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 750, color: "var(--ink)", letterSpacing: "-.01em" }}>
                {project.name}
              </span>
              <span className="badge badge-neutral" style={{ fontFamily: "var(--mono)", fontSize: 11 }}>
                {project.domain}
              </span>
              {/* Was hardcoded unconditionally — read as "your account is
                  Pro" sitting right next to a "Disponible en plan Pro"
                  button when it wasn't (founder report: contradictory at a
                  glance after a plan downgrade). Reflects `canAuditCoverage`
                  specifically (WEB-AUDIT-TECH-ALL-PLANS-1): coverage is the
                  one half of this page that's still actually Pro-only, so
                  this is the one badge that still means something by plan —
                  the technical panels below render for every plan now. */}
              {canAuditCoverage && <span className="badge badge-accent" style={{ fontSize: 10 }}>PRO</span>}
            </div>
          </div>
        </div>
        {/* WEB-AUDIT-ISSUES-1 fase 2 (founder-approved 2026-08-02): the
            sticky header is shared chrome across every console page
            (docs/brand/design-decisions-log.md §3) — "el contexto vive
            entero en el sticky-header... título de sección + pill de fecha".
            Citations and Prompts, the two other v3-repainted pages, only put
            passive badges/status pills here, never an action button. The
            real "Auditar ahora" button moved into the page body below,
            leaving this side purely informational. (That button is gone
            entirely since AUDIT-NO-BUTTON-1; the body now holds only the
            audit's state.) */}
        <div className="ov-sticky-right" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Two lengths, not one. `.ov-sticky-right` is `flex-shrink: 0`, so
              whatever sits here keeps its intrinsic width — fine for the short
              pills Citations/Overview put here, but this is prose, and at
              375px the full sentence claimed ~340px of a 375px header. The
              left block (`flex: 1; min-width: 0`) collapsed to ~25px and its
              "Auditoría web" kicker painted straight over this text. Caught by
              reading the pilot's own mobile capture of PR #289 — no console
              error, no failed request and no overflow signal fired, because
              nothing overflowed: two elements simply shared the same pixels.
              The compact form keeps the audit date on mobile (it is the only
              place in the page that shows audit freshness) while fitting. */}
          {latestMap ? (
            <span style={{ fontSize: 11, color: "var(--ink-4)" }}>
              <span className="wa2-hdr-audit-full">
                Última auditoría: {formatDate(latestMap.generatedAt)}
                {auditedScanDate ? ` · sobre el escaneo del ${formatDate(auditedScanDate)}` : ""}
              </span>
              <span className="wa2-hdr-audit-compact">Auditada {formatDate(latestMap.generatedAt)}</span>
            </span>
          ) : (
            // WEB-AUDIT-TECH-ALL-PLANS-1: `latestMap` only ever exists for a
            // coverage campaign, so a non-Pro project (which never has one)
            // used to show no date here at all — even with a real, fresh
            // technical snapshot. That reads as "never audited", which is
            // false. Falls back to the technical snapshot's own date; still
            // nothing when neither exists.
            technicalSnapshot && (
              <span style={{ fontSize: 11, color: "var(--ink-4)" }}>Auditada {formatDate(technicalSnapshot.created_at)}</span>
            )
          )}
          {/* DOMAINS-REDESIGN-1: era un `.scan-status`, que el CSS oculta bajo
              el breakpoint móvil — el mismo fallo que §26 arregló para el
              escaneo y dejó anotado como pendiente para la auditoría. La
              pastilla compartida lo hace visible también en móvil y unifica el
              vocabulario de estado de toda la consola. Gate renombrado a
              `canAuditCoverage` por WEB-AUDIT-TECH-ALL-PLANS-1 (ADR 0035):
              este chip anuncia la campaña de COBERTURA, que sigue siendo Pro
              — la auditoría técnica corre en todos los planes y no tiene
              campaña que anunciar aquí. */}
          {/* WEB-AUDIT-DRIVE-1: the pill used to render off `status='running'`
              alone, with no notion of when that row last moved — so a campaign
              whose driver stopped 13 minutes earlier said "Auditando…"
              indefinitely (2026-08-07). `auditPillState` is the same claim
              measured against the clock and against the job's own status. */}
          {canAuditCoverage && auditPillState === "auditing" && <ScanStatePill auditing />}
          {canAuditCoverage && auditPillState === "pending" && (
            <span className="badge" style={{ fontSize: 11 }}>
              Auditoría pendiente
            </span>
          )}
        </div>
      </div>

      {/* WEB-AUDIT-ISSUES-1 fase 2: v3 repaint + the founder-approved
          640/1200/1280px console width standard (CITATIONS-REDESIGN-1,
          docs/brand/design-decisions-log.md §5), same mechanism as
          .ov2-scope/.cit2-scope — re-points the shared token names so every
          unedited `.card`/badge/etc. inside repaints automatically. Wraps
          everything below the sticky header, which stays on the shared
          chrome untouched, matching this repo's established nesting. */}
      <div className="wa2-scope wa2-page">

      {/* AUDIT-NO-BUTTON-1 (founder, 2026-08-05): here lived the page's one
          "Auditar ahora" button, and briefly after it a status pill. Both are
          gone. The audit has run on its own after every scan since
          AUDIT-AFTER-SCAN-1, so the button asked for work already done; and
          once the pill carried the date too, it repeated what the sticky
          header above already says ("dejamos solo la info de la cabecera").
          The header states the audit date, whether it covers the newest scan,
          and shows its own "Auditando" pill while a campaign runs — there was
          nothing left for a second element to add. */}

      {/* A campaign can be left "running" server-side while the account's
          plan lapses mid-audit (e.g. downgraded via Stripe billing) — the
          banner must never promise "seguirá por donde se quedó" when it
          genuinely can't: WebAuditProvider won't auto-resume without
          canAuditCoverage, and the button that would show any driving state
          is hidden entirely under the plan gate. Founder report: the old
          unconditional version left the page looking permanently stuck with
          no error, no explanation. This banner is about the COVERAGE
          campaign specifically — the technical half never had a "campaign"
          to pause, so WEB-AUDIT-TECH-ALL-PLANS-1 leaves this whole block
          keyed on canAuditCoverage unchanged. */}
      {/* Sólo la variante de plan pausado. La de "Auditoría en curso" se
          retiró (founder review 2026-08-04): mientras se audita, el propio
          botón ya lleva el spinner y el conteo de temas en vivo, así que el
          banner repetía la misma información en tres líneas más una pastilla
          — "todo el resto es liar la experiencia". Esta variante NO es
          redundante: cuando el plan decae a mitad de auditoría el botón
          desaparece entero bajo el gate, y entonces este banner es lo único
          que explica por qué la página parece atascada. */}
      {/* WEB-AUDIT-DRIVE-1: the coverage driver's own failures, which had no
          renderer at all until this phase — see the component. Placed above
          the plan-lapsed banner because the two are mutually exclusive in
          practice (that one only shows when the driver never starts) and this
          one is about work that did start and then stopped. */}
      <WebAuditDriveNotice />

      {activeCampaignProgress && !canAuditCoverage && (
          <div className="firstscan-banner">
            <div className="fb-ico">
              <Icon name="search" size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="fb-t">Auditoría pausada por cambio de plan</div>
              <div className="fb-d">
                Se quedó en {activeCampaignProgress.covered} de {activeCampaignProgress.total} temas. Tu plan actual
                no incluye esta función — el progreso está guardado y se reanudará en cuanto vuelvas a un plan Pro o
                superior.
              </div>
            </div>
            <Link href="/dashboard/settings/billing" className="btn btn-primary btn-sm">
              Ver planes
            </Link>
          </div>
        )}

      {/* Gated / empty states. WEB-AUDIT-TECH-ALL-PLANS-1 (2026-08-05): the
          old single `!canAudit` branch blanked out the ENTIRE page —
          technical panels included — for any non-Pro account. That was
          exactly the asymmetry GEO-SCORE-V4 (docs/adr/0033) turned into a
          scoring bug, not just a UX one: `readiness_score` is a real .20 GEO
          Score component, so a plan that can never see it structurally
          scored on four signals instead of five. The ladder below now gates
          on real data only — a completed scan, then either kind of audit
          result — never on plan. The plan-specific "not included" fact is
          told per-signal instead, inside the tiles/sections that need it
          (LockedSubScoreTile, the coverage-only Evolución/Historial blocks
          that stay empty by construction for a non-Pro project). */}
      {!latestRunRow ? (
        <div className="card" style={{ marginTop: 14, padding: "24px 22px", textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 750, color: "var(--ink)", marginBottom: 8 }}>
            Todavía no hay ningún escaneo completado
          </div>
          <p style={{ fontSize: 13.5, color: "var(--ink-3)", maxWidth: 460, margin: "0 auto 16px", lineHeight: 1.6 }}>
            La auditoría web necesita al menos un escaneo completado para cruzar tus prompts con lo que la IA cita.
          </p>
          <Link href={`/dashboard/projects/${projectId}`} className="btn btn-primary btn-sm">
            Ir a la visión general
          </Link>
        </div>
      ) : !summary && !technicalSnapshot ? (
        // Neither signal exists yet for THIS account — true empty state,
        // reachable on any plan (e.g. right after a scan finishes, before
        // the async post-scan audit job has run). Copy branches on
        // canAuditCoverage because the two plans are waiting on different
        // things: a Pro account is waiting on ITS OWN next audit; a non-Pro
        // account will only ever get the technical half, so telling it
        // "hasta 5 auditorías al día" would describe a feature it can't use.
        <div className="card" style={{ marginTop: 14, padding: "24px 22px", textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 750, color: "var(--ink)", marginBottom: 8 }}>
            Todavía no has auditado tu web
          </div>
          {canAuditCoverage ? (
            <p style={{ fontSize: 13.5, color: "var(--ink-3)", maxWidth: 460, margin: "0 auto 16px", lineHeight: 1.6 }}>
              Tu dominio visto como lo ve la IA: la auditoría comprueba, tema a tema, si tu dominio publica contenido
              que Google encuentra, y lo cruza con las citas de tu último escaneo.
            </p>
          ) : (
            <p style={{ fontSize: 13.5, color: "var(--ink-3)", maxWidth: 460, margin: "0 auto 16px", lineHeight: 1.6 }}>
              La salud técnica de tu web se audita sola tras cada escaneo — vuelve en unos minutos. Comparar lo que
              publicas con lo que la IA cita en sus respuestas es una función del plan Pro.
            </p>
          )}
          <p style={{ fontSize: 11.5, color: "var(--ink-4)", marginBottom: 16 }}>Hasta 5 auditorías al día por proyecto.</p>
        </div>
      ) : (
        <AuditTabsProvider>
          {/* HERO (WEB-AUDIT-R1): one composite verdict + its breakdown,
              replacing the old 4-tile KPI row that mixed units (fractions,
              scores, counts) with no hierarchy. */}
          <div className="card" style={{ marginTop: 14, padding: "16px 18px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 20 }}>
              {/* Title ABOVE the dial, like the mockup's "Salud del sitio"
                  (founder review 2026-08-03: "el gauge inicial necesita un
                  título"). It used to sit over the tiles, which left the big
                  number unlabelled and made it read as competing with the
                  "Salud técnica" tile below rather than summarising it. */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <div className="wa2-diag-title" style={{ display: "flex", alignItems: "center", fontSize: 13.5, fontWeight: 750 }}>
                  Diagnóstico general
                  {/* Qué te aporta, no cómo se calcula (founder review
                      2026-08-04). La versión anterior describía la aritmética
                      —"media simple de tus señales disponibles… no cuenta
                      como 0"— que es exactamente lo que un usuario no
                      necesita saber para decidir qué hacer, y además ocupaba
                      once líneas que tapaban el propio gauge. El desglose
                      sigue visible al lado, en los tres tiles. */}
                  <InfoTip text="Lo preparada que está tu web para que la IA te cite como fuente. Sube al cubrir los temas que te importan, al conseguir que la IA te mencione en ellos y al dejar tus páginas legibles para los motores." />
                </div>
                {/* WEB-AUDIT-TECH-ALL-PLANS-1: `heroScore` (computed above)
                    is the composite for a Pro account, same as before, and
                    the technical score alone for a non-Pro one — see its own
                    comment for why that's the honest headline rather than a
                    same-valued 1-of-3 average with a misleading caption. */}
                <ScoreGauge score={heroScore} />
              </div>
              <div style={{ flex: 1, minWidth: 240 }}>
                {/* Caption above the tiles: for a non-Pro account this is
                    always shown (coverage/surfacing can never be computed —
                    that's a plan fact, not a "not run yet" one); for Pro it
                    only shows below 3 signals, same as before
                    WEB-AUDIT-TECH-ALL-PLANS-1. */}
                {(!canAuditCoverage || globalScore.includedCount < 3) && (
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", margin: "2px 0 10px" }}>
                    {!canAuditCoverage
                      ? "Tu salud técnica — el contenido propio y lo que la IA cita se destapan en el plan Pro."
                      : `Media de ${globalScore.includedCount} ${globalScore.includedCount === 1 ? "señal disponible" : "señales disponibles"} — audita el resto para completarla.`}
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginTop: !canAuditCoverage || globalScore.includedCount < 3 ? 0 : 10 }}>
                  {/* Sin sparklines. Se probaron con 4 auditorías reales
                      (founder review 2026-08-04) y a 64×22px no se leen: "no
                      aportan mucho porque se ven muy pequeñas". Es además
                      información duplicada — el gráfico de Evolución, justo
                      debajo, dibuja exactamente la misma serie con ejes y
                      fechas. */}
                  {/* Contenido/Implementado: coverage stays Pro-only, and
                      `summary` is always null on a non-Pro account (no
                      coverage campaign ever runs) — locked, never "—", per
                      WEB-AUDIT-TECH-ALL-PLANS-1 (see LockedSubScoreTile). On
                      Pro, `summary` can ALSO be null transiently (a scan just
                      completed technical-first, coverage not through yet —
                      the structural fix that let this hero render at all
                      without a coverage summary), so this branch keeps its
                      own null-safety instead of assuming the old ladder's
                      guarantee. */}
                  {canAuditCoverage ? (
                    <>
                      <SubScoreTile
                        label="Contenido"
                        value={summary?.coveragePct == null ? "—" : `${summary.coveredCount} / ${summary.conclusiveCount}`}
                        hint="Temas con contenido propio verificado"
                        delta={coverageDelta}
                        pct={summary?.coveragePct ?? null}
                      />
                      <SubScoreTile
                        label="Implementado"
                        value={summary?.surfacingPct == null ? "—" : `${summary.surfacedCount} / ${summary.coveredCount}`}
                        hint={
                          summary?.surfacingPct != null && grouped.invisible.length > 0
                            ? `Palanca rápida: ${grouped.invisible.length} ${grouped.invisible.length === 1 ? "tema aún sin citar" : "temas aún sin citar"}`
                            : "De tus temas con contenido, cuántos cita la IA"
                        }
                        delta={surfacingDelta}
                        pct={summary?.surfacingPct ?? null}
                      />
                    </>
                  ) : (
                    <>
                      <LockedSubScoreTile label="Contenido" hint="Temas con contenido propio verificado por la IA" />
                      <LockedSubScoreTile label="Implementado" hint="Cuánto de ese contenido cita la IA en sus respuestas" />
                    </>
                  )}
                  <SubScoreTile
                    label="Salud técnica"
                    value={
                      technicalSnapshot
                        ? technicalSnapshot.readiness_score === null
                          ? "—"
                          : `${technicalSnapshot.readiness_score} / 100`
                        : "Sin auditar"
                    }
                    hint={
                      technicalSnapshot
                        ? `Media de ${analyzedPagesCount} ${analyzedPagesCount === 1 ? "página clave" : "páginas clave"}`
                        : "Se audita sola tras cada escaneo"
                    }
                    delta={null}
                    pct={technicalSnapshot?.readiness_score ?? null}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Evolución: subida aquí desde el pie de "Problemas" (founder
              review 2026-08-03: "subiría el gráfico de evolución de auditorías
              y lo pondría precisamente debajo de la primera caja"). Al vivir
              fuera del sistema de pestañas, la lectura pasa a ser: dónde
              estás (hero) → hacia dónde vas (esto) → qué hacer (pestañas).
              Umbral subido de 2 a 4 auditorías (founder-approved 2026-08-04,
              tras verlo en el preview): con dos puntos el gráfico dibuja una
              recta que se lee como tendencia sin serlo — el mismo criterio
              que ya aplican las sparklines de los tiles, y que pesa más aquí
              porque este bloque pasó a la posición más visible de la página.
              Sigue sin haber placeholder "necesitas más datos": desaparece
              entero. El Historial en tabla se queda en Problemas con umbral
              2 — es una tabla, no una línea: dos filas se leen perfectamente
              y son justo lo que da contexto mientras el gráfico no aparece. */}
          {trend.length >= 4 && (
            <div className="card" style={{ marginTop: 12 }}>
              <div style={{ padding: "13px 16px 0" }}>
                <div style={{ fontSize: 13.5, fontWeight: 750 }}>Evolución entre auditorías</div>
                <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                  Cobertura e implementación a lo largo de los últimos escaneos.
                </div>
              </div>
              <div style={{ display: "flex", gap: 14, fontSize: 11, color: "var(--ink-3)", fontWeight: 600, padding: "10px 16px 0" }}>
                <span>
                  <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, marginRight: 5, verticalAlign: -1, background: "var(--accent)" }} />
                  Cobertura de temas
                </span>
                <span>
                  <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, marginRight: 5, verticalAlign: -1, background: "var(--pos)" }} />
                  Tasa de implementación
                </span>
              </div>
              <div style={{ padding: "12px 16px 14px" }}>
                <TrendChart points={trend} />
              </div>
            </div>
          )}

          <AuditTabBar />

          {/* ─── Resumen ─── */}
          <AuditTabPanel id="problemas">
            {/* Salud técnica GEO — la lista de problemas (WEB-AUDIT-ISSUES-1
                fase 2, founder-approved 2026-08-02): "una auditoría web es
                para encontrar problemas técnicos" fue la lectura del
                fundador sobre los mockups, así que esta lista —no el antiguo
                resumen de una línea— abre ahora la pestaña. Cada fila sale
                de los checks reales por página/bot de lib/web-audit/issues.ts,
                ordenados por severidad; el delta de puntos de cada una es la
                ganancia exacta de score al arreglar solo ESE check (ver la
                cabecera de ese módulo para el porqué es exacto, no una
                estimación). */}
            {currentTechnicalReport ? (
              <>
                {currentTechnicalReport.totalPointPotential > 0 && (
                  <div
                    className="card"
                    style={{ marginTop: 12, padding: "14px 16px", background: "var(--pos-soft)", border: "1px solid transparent" }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".03em", color: "var(--pos-ink)", textTransform: "uppercase" }}>
                      Si arreglas los {currentTechnicalReport.issues.length}{" "}
                      {currentTechnicalReport.issues.length === 1 ? "problema técnico" : "problemas técnicos"}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
                      <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.02em", color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
                        {currentTechnicalReport.actualReadinessScore}
                      </span>
                      <Icon name="arrRight" size={16} />
                      <span
                        style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.02em", color: "var(--pos-ink)", fontVariantNumeric: "tabular-nums" }}
                      >
                        {currentTechnicalReport.projectedReadinessScore}
                      </span>
                      <span className="badge badge-pos" style={{ marginLeft: "auto", fontSize: 10.5, background: "var(--surface)" }}>
                        calculado
                      </span>
                    </div>
                    {/* Names WHICH score these two numbers are. Founder review
                        2026-08-03: the hero dial reads 58 and this card reads
                        81 — "ya veo que es salud técnica, pero me ha costado
                        identificarlo". They are different measures (global
                        average vs technical only), so the fix is a label, not
                        a shared number. Copy also cut down per the same
                        review ("la frase tiene que ser más pequeña"). */}
                    <div style={{ fontSize: 11, fontWeight: 650, color: "var(--pos-ink)", marginTop: 2 }}>
                      Salud técnica
                    </div>
                    <p style={{ fontSize: 10.5, lineHeight: 1.45, color: "var(--ink-3)", margin: "6px 0 0" }}>
                      Es una valoración técnica. Que la IA acabe citándote depende también de otros factores de
                      GEO, que trabajas en Recomendaciones.
                    </p>
                  </div>
                )}

                <div className="card" style={{ marginTop: 12 }}>
                  <div
                    style={{
                      padding: "13px 16px 0",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 8
                    }}
                  >
                    <div style={{ fontSize: 13.5, fontWeight: 750 }}>Problemas técnicos</div>
                    {technicalScoreDelta !== null && technicalScoreDelta !== 0 && (
                      <span style={{ fontSize: 11.5, fontWeight: 650, display: "flex", alignItems: "center", gap: 4 }}>
                        <Delta value={technicalScoreDelta} suffix=" pt" /> desde la auditoría anterior
                      </span>
                    )}
                  </div>
                  {/* Counts only. The sparklines that used to sit beside each
                      number were struck out by hand in the founder's review
                      screenshot (2026-08-03): "eso hay que eliminarlo, las
                      líneas me refiero. Dejamos solo el conteo de críticos y
                      el conteo de avisos". The same per-audit history is still
                      readable in Evolución/Historial, where it has axes. */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "12px 16px 0" }}>
                    <div>
                      <span
                        style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--ink-4)" }}
                      >
                        Críticos
                      </span>
                      <div style={{ marginTop: 2 }}>
                        <span style={{ fontSize: 22, fontWeight: 800, color: "var(--wa-crit)", fontVariantNumeric: "tabular-nums" }}>
                          {currentTechnicalReport.issues.filter((i) => i.severity === "critical").length}
                        </span>
                      </div>
                    </div>
                    <div>
                      <span
                        style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--ink-4)" }}
                      >
                        Avisos
                      </span>
                      <div style={{ marginTop: 2 }}>
                        <span style={{ fontSize: 22, fontWeight: 800, color: "var(--warn)", fontVariantNumeric: "tabular-nums" }}>
                          {currentTechnicalReport.issues.filter((i) => i.severity === "warning").length}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {currentTechnicalReport.issues.length > 0 ? (
                      currentTechnicalReport.issues.map((issue) => (
                        <IssueRow
                          key={issue.check}
                          issue={issue}
                          llmsTxt={
                            issue.check === "llms_txt_missing" && llmsTxtFile
                              ? { file: llmsTxtFile, steps: llmsPublishSteps }
                              : null
                          }
                          sitemap={issue.check === "sitemap_missing" ? { steps: sitemapFixSteps } : null}
                        />
                      ))
                    ) : (
                      <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: 0 }}>
                        Ningún problema técnico detectado en la última auditoría.
                      </p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="card" style={{ marginTop: 12, padding: "14px 16px" }}>
                <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: 0 }}>
                  {/* "no has auditado" ya no es cierto: nadie audita a mano
                      desde AUDIT-NO-BUTTON-1. Unconditional now
                      (WEB-AUDIT-TECH-ALL-PLANS-1): this used to only claim
                      "se comprueba sola" for canAudit (Pro) accounts, but the
                      technical half isn't plan-gated at all any more — it
                      auto-checks after every scan on every plan. */}
                  Todavía no se ha auditado la salud técnica de tu web. Se comprueba sola tras cada escaneo.
                </p>
              </div>
            )}

            {/* Plan de acción y Matriz de oportunidad, RETIRADOS de esta
                pantalla (founder-approved 2026-08-02): "toda la tabla de
                plan de acción no tiene sentido aquí... debe estar en la
                página de recomendaciones" y "la matriz no estaba en el
                artefacto". Efecto secundario real, señalado explícitamente:
                los temas content_gap/open_opportunity/capture no tienen hoy
                ninguna recomendación real que los cubra en el motor de
                reglas (ver el comentario histórico que vivía junto a la
                query de matchedRecs, ahora eliminada) — su guía sintetizada
                sólo existía en este bloque. Al quitarlo, esos temas se
                quedan sin ningún sitio en el producto hasta que se decida
                si esa guía migra a Recomendaciones o se descarta. No se
                reconstruye especulativamente aquí; queda como gap conocido
                para la siguiente fase. */}

            {/* "Lo que ya funciona": performing topics have no action, so
                they never belonged in a plan anyway. Plain always-expanded
                `.card`. No longer a matrix-quadrant scroll target (the
                matrix that used to link here is gone) — just a standalone
                confirmation block. */}
            {grouped.performing.length > 0 && (
              <div className="card" style={{ marginTop: 12 }}>
                {/* No "Rindiendo" pill: the heading already says these are
                    working, so the badge only repeated it (founder review
                    2026-08-03: "creo que no aporta nada, yo lo quitaría"). */}
                <div style={{ padding: "13px 16px 0" }}>
                  <div style={{ fontSize: 13.5, fontWeight: 750 }}>Lo que ya funciona ({grouped.performing.length})</div>
                </div>
                <div style={{ padding: "14px 16px 16px" }}>
                  <p style={{ fontSize: 12, color: "var(--ink-3)", margin: "0 0 10px" }}>
                    Contenido propio que la IA ya cita en sus respuestas — sin acción pendiente, solo mantenlo actualizado.
                  </p>
                  <ul style={{ display: "flex", flexDirection: "column", gap: 8, margin: 0, padding: 0, listStyle: "none" }}>
                    {grouped.performing.map((topic) => (
                      <li
                        key={topic.promptId}
                        style={{ padding: "8px 10px", background: "var(--surface-2)", borderRadius: 8, fontSize: 12.5, color: "var(--ink-2)" }}
                      >
                        {topic.topic}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* El GRÁFICO de Evolución ya no vive aquí — subido a nivel de
                página, justo bajo el hero (founder review 2026-08-03). Lo que
                queda debajo es sólo el Historial en tabla. */}

            {trend.length >= 2 && (
              <div className="card" style={{ marginTop: 12 }}>
                <div style={{ padding: "13px 16px 0" }}>
                  <div style={{ fontSize: 13.5, fontWeight: 750 }}>Historial de auditorías</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                    Una entrada por escaneo auditado (máx. las 8 más recientes).
                  </div>
                </div>
                {/* Each row gets mini bars in the same series colors as the
                    chart above (accent = cobertura, pos = implementación) so
                    the history scans visually, not just numerically
                    (WEB-AUDIT-R4). A null rate renders "—" with no bar —
                    never a 0-width bar, which would read as a measured 0%. */}
                <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                  {[...trend].reverse().map((point) => (
                    <div
                      key={point.scanId}
                      style={{ padding: "8px 10px", borderRadius: 8, background: "var(--surface-2)" }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 650, color: "var(--ink)", marginBottom: 6 }}>
                        {formatDate(point.generatedAt)}
                      </div>
                      {/* n/N always shown next to the % (WEB-AUDIT-R6 phase 1)
                          — the fraction itself is the honesty signal, no
                          separate warning text. */}
                      <div style={{ display: "grid", gridTemplateColumns: "110px minmax(0, 1fr) 92px", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 10.5, color: "var(--ink-4)" }}>Cobertura</span>
                        {point.coveragePct !== null ? (
                          <MiniBar pct={point.coveragePct} color="var(--accent)" />
                        ) : (
                          <span />
                        )}
                        <span style={{ fontSize: 11, color: "var(--ink-3)", fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
                          {point.coveragePct === null
                            ? "—"
                            : `${point.coveragePct}% (${point.coveredCount}/${point.conclusiveCount})`}
                        </span>
                        <span style={{ fontSize: 10.5, color: "var(--ink-4)" }}>Implementado</span>
                        {point.surfacingPct !== null ? (
                          <MiniBar pct={point.surfacingPct} color="var(--pos)" />
                        ) : (
                          <span />
                        )}
                        <span style={{ fontSize: 11, color: "var(--ink-3)", fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
                          {point.surfacingPct === null
                            ? "—"
                            : `${point.surfacingPct}% (${point.surfacedCount}/${point.coveredCount})`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </AuditTabPanel>

          {/* ─── Correcto ─── */}
          <AuditTabPanel id="correcto">
            {/* Founder request (2026-08-02, tras ver los mockups): "me
                gustaría una sección... donde tenga tachado y con el check de
                verificado todo lo que el usuario tiene bien porque eso da la
                sensación de tienes cosas bien, pero tienes que mejorar
                otras". Cero backend nuevo — issues.ts ya calcula qué checks
                pasan, esta pestaña sólo enseña lo que hoy se descartaba. */}
            {currentTechnicalReport ? (
              <>
                <div className="card" style={{ marginTop: 12, padding: "14px 16px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".03em", color: "var(--pos-ink)", textTransform: "uppercase" }}>
                    Comprobaciones superadas
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: "var(--pos-ink)", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                    {currentTechnicalReport.passing.reduce((sum, p) => sum + p.passedCount, 0)}
                    <span style={{ fontSize: 14, fontWeight: 650, color: "var(--ink-4)" }}>
                      {" "}
                      / {currentTechnicalReport.passing.reduce((sum, p) => sum + p.applicableCount, 0)}
                    </span>
                  </div>
                  <p style={{ fontSize: 11.5, color: "var(--ink-3)", margin: "8px 0 0" }}>
                    Tu web hace bien la mayoría de las cosas que comprobamos. Lo que falla está en la pestaña
                    Problemas.
                  </p>
                </div>
                <div className="card" style={{ marginTop: 12 }}>
                  <div style={{ padding: "13px 16px 16px", display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                    {currentTechnicalReport.passing.length > 0 ? (
                      currentTechnicalReport.passing.map((p) => <PassingRow key={p.check} passing={p} />)
                    ) : (
                      <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: 0 }}>
                        Ninguna comprobación superada todavía en la última auditoría.
                      </p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="card" style={{ marginTop: 12, padding: "14px 16px" }}>
                <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: 0 }}>
                  Todavía no has auditado la salud técnica de tu web.
                </p>
              </div>
            )}
          </AuditTabPanel>

          {/* ─── Páginas ─── */}
          <AuditTabPanel id="paginas">
            {/* Salud técnica GEO (WEB-AUDIT-2): deterministic per-page checks +
                AI-bot access, independent from the Gemini-driven coverage
                audit. Renamed from "tecnica" (WEB-AUDIT-ISSUES-1 fase 2) —
                content unchanged, this is still the page-by-page detail the
                aggregated Problemas/Correcto lists summarize.
                RunTechnicalAuditButton retirado de aquí (founder-approved
                2026-08-02: "prefiero que no haya dos botones distintos") —
                "Auditar ahora" ya disparaba la auditoría técnica en el mismo
                clic (WEB-AUDIT-R2, piggyback en web-audit-context.tsx), así
                que este botón era estrictamente redundante, no una segunda
                función real. Desde AUDIT-NO-BUTTON-1 no hay ningún botón: la
                auditoría técnica corre con la automática tras cada escaneo. */}
            <div className="section-head" style={{ marginTop: 16 }}>
              <div className="section-title">Salud técnica GEO</div>
              <div className="section-desc">
                {technicalSnapshot
                  ? `Comprobado ${formatDate(technicalSnapshot.created_at)}`
                  : "Comprueba si tus páginas son técnicamente citables por la IA y si sus bots pueden rastrear tu web."}
              </div>
            </div>
            {technicalSnapshot && new Date(technicalSnapshot.created_at) < TECHNICAL_CRITERIA_EXPANDED_AT && (
              <p style={{ fontSize: 11.5, color: "var(--ink-4)", marginTop: 8 }}>
                Los criterios técnicos se ampliaron el 13 jul 2026 (canonical, indexabilidad, hreflang, listas/tablas,
                contenido, Open Graph). Esta auditoría es de antes de ese cambio — vuelve a auditar para comparar con
                los criterios actuales.
              </p>
            )}
            {technicalSnapshot ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, marginTop: 12 }}>
                <div className="card">
                  <div style={{ padding: "13px 16px 0" }}>
                    <div style={{ fontSize: 13.5, fontWeight: 750 }}>Salud técnica GEO por página</div>
                    <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                      Hasta {technicalSnapshot.pages.length} páginas clave: portada, páginas verificadas y páginas citadas por la IA. Toca una
                      página para ver qué mejorar.
                    </div>
                  </div>
                  <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {technicalSnapshot.pages.map((page, i) => (
                      <PageAuditRow key={`${page.url}-${i}`} page={page} fixContext={fixContext} />
                    ))}
                  </div>
                </div>
                <BotAccessCard bots={technicalSnapshot.bots} checkedAt={technicalSnapshot.created_at} />
              </div>
            ) : (
              <p style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 8 }}>
                Todavía no has auditado la salud técnica de tu web. Hasta 5 auditorías al día por proyecto.
              </p>
            )}
          </AuditTabPanel>
        </AuditTabsProvider>
      )}

      {/* Footer links */}
      <div
        style={{
          display: "flex",
          gap: 20,
          marginTop: 28,
          paddingTop: 18,
          borderTop: "1px solid var(--line-soft)",
          flexWrap: "wrap"
        }}
      >
        {/* DOMAINS-REDESIGN-1: «Escaneos» ya no es una pantalla de cliente. El
            pie enlaza a Dominios, que es lo que ese enlace le resolvía al
            usuario — cambiar de dominio — y no al historial interno. */}
        <Link
          href="/dashboard/domains"
          style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, color: "var(--ink-3)", fontWeight: 600 }}
        >
          <Icon name="globe" size={13} />
          Dominios
        </Link>
        <Link
          href={`/dashboard/projects/${projectId}/recommendations`}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, color: "var(--ink-3)", fontWeight: 600 }}
        >
          <Icon name="recs" size={13} />
          Recomendaciones
        </Link>
      </div>
      </div>
    </div>
    </WebAuditProvider>
  );
}
