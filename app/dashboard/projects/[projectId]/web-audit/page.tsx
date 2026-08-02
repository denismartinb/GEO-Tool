import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { Delta } from "@/components/ui/delta";
import { InfoTip } from "@/components/ui/info-tip";
import { requireUser } from "@/lib/auth";
import { requireActiveProject } from "@/lib/project-workspace";
import { isProOrAbove } from "@/lib/billing";
import { parseCoverageMap } from "@/lib/web-audit/coverage-map";
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
import {
  buildActionPlan,
  extractMentionedCompetitors,
  mergeCompetitorNames,
  type ActionItem,
  type ActionItemKind
} from "@/lib/web-audit/action-plan";
import { RunAuditButton } from "./run-audit-button";
import { RunTechnicalAuditButton } from "./run-technical-audit-button";
import { WebAuditProvider } from "./web-audit-context";
import {
  AuditTabsProvider,
  AuditTabBar,
  AuditTabPanel,
  QuadrantButton,
  ActionFilterBar,
  ActionRowVisibility,
  PlanExpander,
  type ActionFilterId,
  type ActionFilterCount
} from "./audit-tabs";
import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";
import type { BotAccessReport, BotAgent } from "@/lib/web-audit/robots";
import { buildPageCheckGuidance } from "@/lib/web-audit/page-checks";
import {
  buildTechnicalIssuesReport,
  type TechnicalIssue,
  type TechnicalIssuesReport,
  type TechnicalPassingCheck,
  type IssueCheckKey,
  type IssueSeverity
} from "@/lib/web-audit/issues";

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

const ACTION_KIND_META: Record<ActionItemKind, { label: string; badgeClass: string }> = {
  optimize: { label: "Optimizar página existente", badgeClass: "badge-warn" },
  create_competing: { label: "Crear contenido — compite un rival", badgeClass: "badge-neg" },
  create_open: { label: "Crear contenido — oportunidad abierta", badgeClass: "badge-neutral" },
  capture: { label: "Formalizar página propia", badgeClass: "badge-neutral" }
};

/**
 * Which real filter value(s) a Plan de acción row should stay visible under
 * (WEB-AUDIT-R5). content_gap/open_opportunity rows (create_competing/
 * create_open) also match the matrix's combined "no_content" quadrant.
 * create_competing/create_open/capture additionally match the chip row's
 * broader "create_content" grouping (founder-approved 2026-07-18) — all
 * three mean "publish a page", only `optimize` means editing an existing one.
 */
function visibilityMatches(kind: ActionItemKind): ActionFilterId[] {
  if (kind === "create_competing" || kind === "create_open") return [kind, "no_content", "create_content"];
  if (kind === "capture") return [kind, "create_content"];
  return [kind];
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
  sitemap_missing: { label: "sitemap.xml", guidance: "Publica un sitemap.xml en la raíz de tu dominio.", unit: "página" }
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
function IssueRow({ issue }: { issue: TechnicalIssue }) {
  const meta = CHECK_META[issue.check];
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

/** Gauge ring for the hero's global "Preparación GEO" score. */
function ScoreGauge({ score }: { score: number | null }) {
  const size = 116;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = score ?? 0;
  const color = scoreColor(score);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={score === null ? "Preparación GEO sin datos" : `Preparación GEO ${score} de 100`}
      style={{ flexShrink: 0 }}
    >
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-soft)" strokeWidth={stroke} />
      {score !== null && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
      <text
        x="50%"
        y="47%"
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-.02em", fill: "var(--ink)", fontVariantNumeric: "tabular-nums" }}
      >
        {score === null ? "—" : score}
      </text>
      <text x="50%" y="66%" textAnchor="middle" style={{ fontSize: 10.5, fontWeight: 600, fill: "var(--ink-4)" }}>
        / 100
      </text>
    </svg>
  );
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

/**
 * Tiny trend sparkline for a hero sub-score tile (WEB-AUDIT-R4). Values are
 * the same real per-audit percentages the Evolución chart plots — null points
 * (an audit where that rate couldn't be computed) are skipped, exactly like
 * TrendChart's pathFor. Rendered only with ≥2 real points; anything less has
 * no trend to show.
 */
function Sparkline({ values, color }: { values: Array<number | null>; color: string }) {
  const W = 64;
  const H = 22;
  const pad = 2;
  const points = values
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v !== null);
  if (points.length < 2) return null;
  const stepX = values.length > 1 ? (W - pad * 2) / (values.length - 1) : 0;
  const yFor = (pct: number) => H - pad - (pct / 100) * (H - pad * 2);
  const d = points.map((p, idx) => `${idx === 0 ? "M" : "L"} ${pad + p.i * stepX} ${yFor(p.v)}`).join(" ");
  const last = points[points.length - 1];
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pad + last.i * stepX} cy={yFor(last.v)} r={2.5} fill={color} />
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
  sparkValues,
  sparkColor
}: {
  label: string;
  value: string;
  hint: string;
  /** null also when the delta exists but isn't trustworthy enough to show — see isDeltaTrustworthy. */
  delta: number | null;
  /** 0-100 fill for the tile's progress bar; null → no bar (signal never computed). */
  pct: number | null;
  /** Per-audit history for the sparkline — same series the Evolución chart plots. */
  sparkValues?: Array<number | null>;
  sparkColor?: string;
}) {
  return (
    <div style={{ padding: "9px 11px", background: "var(--surface-2)", borderRadius: 10, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--ink-4)", flex: 1, minWidth: 0 }}>
          {label}
        </div>
        {sparkValues && <Sparkline values={sparkValues} color={sparkColor ?? "var(--accent)"} />}
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

function PageAuditRow({ page }: { page: PageAuditEntry }) {
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
      </div>
    </details>
  );
}

function BotAccessCard({ bots, checkedAt }: { bots: BotAccessReport; checkedAt: string }) {
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
            No se ha encontrado robots.txt — se asume acceso permitido por defecto.
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
            {bots.llmsTxtFound ? `Encontrado (${bots.llmsTxtBytes} bytes)` : "No encontrado"}
          </span>
        </div>
        {/* WEB-AUDIT-R3: sitemap.xml reachability — same presence-only check as llms.txt, no XML parsing. */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", borderRadius: 8, background: "var(--surface-2)" }}>
          <div style={{ fontSize: 12, fontWeight: 650, color: "var(--ink)" }}>sitemap.xml</div>
          <span className={`badge ${bots.sitemapFound ? "badge-pos" : "badge-outline"}`}>
            {bots.sitemapFound ? "Encontrado" : "No encontrado"}
          </span>
        </div>
      </div>
    </div>
  );
}

// Every Plan de acción row links out to Recomendaciones (WEB-AUDIT-ISSUES-1
// fase 2) — a matched row's link reads "Ver en Recomendaciones" and its
// header carries the "En tu plan" badge; an unmatched row's plain "Ver
// recomendaciones" is the same href, just without either.
function genericRecommendationsHref(projectId: string): string {
  return `/dashboard/projects/${projectId}/recommendations`;
}

// Number chip tone per action kind (WEB-AUDIT-R4) — the priority order reads
// as a colored sequence (amber optimize → red competing → neutral) instead
// of a flat grey list.
const NUMBER_TONE: Record<ActionItemKind, { bg: string; fg: string }> = {
  optimize: { bg: "var(--warn-soft)", fg: "var(--warn-ink)" },
  create_competing: { bg: "var(--neg-soft)", fg: "var(--neg-ink)" },
  create_open: { bg: "var(--surface-2)", fg: "var(--ink-3)" },
  capture: { bg: "var(--accent-soft)", fg: "var(--accent-ink)" }
};

function ActionNumberChip({ index, kind }: { index: number; kind: ActionItemKind }) {
  const tone = NUMBER_TONE[kind];
  return (
    <div
      style={{
        flexShrink: 0,
        width: 22,
        height: 22,
        borderRadius: "50%",
        background: tone.bg,
        color: tone.fg,
        fontSize: 11,
        fontWeight: 750,
        display: "grid",
        placeItems: "center"
      }}
    >
      {index}
    </div>
  );
}

/**
 * One row of the Plan de acción. Reworked in WEB-AUDIT-ISSUES-1 fase 2
 * (founder-approved 2026-08-02, "reparto" decision): this page no longer
 * embeds the interactive `RecCard` a matched recommendation used to render
 * (WEB-AUDIT-R5) — that was the exact "misma tarjeta en dos sitios"
 * duplication the founder flagged as confusing (is this the same action as
 * the one in Recomendaciones, or two?). The rule now: the Auditoría fixes
 * TECHNICAL problems in place; content work (this row) lives once, in
 * Recomendaciones, with its own ciclo de vida. A matched row gets a plain
 * "✓ En tu plan" badge instead of a second copy of the card — same
 * información (topic, rationale, competitors), one fewer place claiming to
 * own the action.
 */
function ActionPlanRow({
  item,
  index,
  projectId,
  hasMatchingRecommendation
}: {
  item: ActionItem;
  index: number;
  projectId: string;
  hasMatchingRecommendation: boolean;
}) {
  const meta = ACTION_KIND_META[item.kind];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <ActionNumberChip index={index} kind={item.kind} />
        <span className={`badge ${meta.badgeClass}`}>{meta.label}</span>
        <span style={{ fontSize: 13, fontWeight: 650, color: "var(--ink)", minWidth: 0, overflowWrap: "anywhere" }}>
          {item.topic}
        </span>
        {hasMatchingRecommendation && (
          <span className="badge badge-accent" style={{ marginLeft: "auto", fontSize: 10.5, flexShrink: 0 }}>
            ✓ En tu plan
          </span>
        )}
      </div>
      <div style={{ padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10 }}>
        <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: "0 0 6px" }}>{item.rationale}</p>
        {item.competitors.length > 0 && (
          <p style={{ fontSize: 11.5, color: "var(--ink-3)", margin: "0 0 6px" }}>
            La IA cita a: <strong style={{ color: "var(--ink-2)" }}>{item.competitors.join(", ")}</strong>
          </p>
        )}
        <Link href={genericRecommendationsHref(projectId)} style={{ fontSize: 12, fontWeight: 650, color: "var(--accent)" }}>
          {hasMatchingRecommendation ? "Ver en Recomendaciones →" : "Ver recomendaciones →"}
        </Link>
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

  // Pro+-gated (DOMAIN-COVERAGE-1): read the raw plan column directly via
  // isProOrAbove, never via getPlanForUser/resolvePlan.
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("current_plan")
    .eq("id", user.id)
    .maybeSingle();
  const canAudit = isProOrAbove(profileRow?.current_plan as string | undefined);

  const { data: latestRunRow } = await supabase
    .from("scan_runs")
    .select("id, finished_at, created_at")
    .eq("project_id", projectId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: historyRows } = await supabase
    .from("generated_solutions")
    .select("sanitized_content, created_at")
    .eq("project_id", projectId)
    .eq("generation_type", "domain_coverage")
    .is("recommendation_id", null)
    .eq("status", "completed")
    .eq("is_sanitized", true)
    .order("created_at", { ascending: false })
    .limit(12);

  // WEB-AUDIT-2: technical-audit snapshots, most recent first. Rendered
  // as-is — this page never re-triggers the audit itself, only the button
  // does (lib/web-audit/technical-audit.ts owns the cache/rate-limit rules).
  //
  // WEB-AUDIT-ISSUES-1 fase 2 (founder-approved 2026-08-02): widened from
  // a single row to the last 8 — the "Problemas" tab's críticos/avisos
  // mini-trend and the readiness-score delta both need more than the latest
  // snapshot, which nothing on this page loaded before this phase.
  const { data: technicalHistoryRows } = canAudit
    ? await supabase
        .from("web_audit_snapshots")
        .select("readiness_score, pages, bots, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(8)
    : { data: [] };
  const technicalHistory = (technicalHistoryRows ?? []) as Array<{
    readiness_score: number | null;
    pages: PageAuditEntry[];
    bots: BotAccessReport;
    created_at: string;
  }>;
  const technicalSnapshot = technicalHistory[0] ?? null;

  // Pure aggregation (lib/web-audit/issues.ts, WEB-AUDIT-ISSUES-1 fase 1) run
  // over each loaded snapshot — cheap, no I/O, no new query per point. Series
  // are chronological (oldest → newest) for the sparkline, matching how
  // `trend`/Sparkline already read elsewhere on this page.
  const technicalReportsNewestFirst = technicalHistory.map((snap) => ({
    createdAt: snap.created_at,
    report: buildTechnicalIssuesReport(snap.pages, snap.bots)
  }));
  const currentTechnicalReport: TechnicalIssuesReport | null = technicalReportsNewestFirst[0]?.report ?? null;
  const previousTechnicalReport: TechnicalIssuesReport | null = technicalReportsNewestFirst[1]?.report ?? null;
  const technicalReportsChronological = [...technicalReportsNewestFirst].reverse();
  const criticalSeries: Array<number | null> = technicalReportsChronological.map(
    (t) => t.report.issues.filter((i) => i.severity === "critical").length
  );
  const warningSeries: Array<number | null> = technicalReportsChronological.map(
    (t) => t.report.issues.filter((i) => i.severity === "warning").length
  );
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
  const { data: activeCampaignRow } = await supabase
    .from("generated_solutions")
    .select("sanitized_content")
    .eq("project_id", projectId)
    .eq("generation_type", "domain_coverage")
    .is("recommendation_id", null)
    .eq("status", "running")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const activeCampaignMap = parseCoverageMap(activeCampaignRow?.sanitized_content ?? null);
  const hasActiveCampaign = Boolean(
    activeCampaignMap && latestRunRow && activeCampaignMap.scanId === latestRunRow.id
  );
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

  // WEB-AUDIT-ACTION: competitor names the AI actually mentioned per topic,
  // and a deep-link to the matching `add_citation_block` recommendation when
  // one exists — both read straight from data this page already loads for
  // `latestMap.scanId`, no new Gemini calls, no schema. `resultIdToPromptId`
  // mirrors the join lib/recommendations/coverage-overlay.ts already
  // establishes for the same recommendation type.
  //
  // A prompt can have more than one result row (one per LLM provider the
  // project scans with, e.g. Gemini + Claude) — collect every row's
  // extraction per promptId first, then merge, instead of overwriting with
  // whichever row happens to be iterated last (production bug: a name from
  // a DIFFERENT provider's row than the one actually shown was leaking into
  // the resolved list).
  const latestScanResultRows = ((resultRows ?? []) as Array<PromptResultLite & { id: string; run_id: string }>).filter(
    (row) => latestMap && row.run_id === latestMap.scanId
  );
  const competitorListsByPromptId = new Map<string, string[][]>();
  for (const row of latestScanResultRows) {
    if (!row.prompt_id) continue;
    const lists = competitorListsByPromptId.get(row.prompt_id) ?? [];
    lists.push(extractMentionedCompetitors(row.extracted_json));
    competitorListsByPromptId.set(row.prompt_id, lists);
  }
  const competitorsByPromptId = new Map<string, string[]>();
  for (const [promptId, lists] of competitorListsByPromptId) {
    competitorsByPromptId.set(promptId, mergeCompetitorNames(lists));
  }

  // Only these two recommendation types anchor their evidence to a single
  // scan_prompt_results row (dedupeKey: `<type>:${result.id}` in
  // recommendation-engine.ts) — every other type is aggregate/run-wide
  // (e.g. close_competitor_gap groups multiple prompts by competitor name)
  // and can't be joined back to one specific topic. content_gap/
  // unverified_cited topics genuinely have no matching recommendation yet;
  // that's a real gap in the engine's rule set, not a bug in this join.
  //
  // WEB-AUDIT-ISSUES-1 fase 2 (founder-approved 2026-08-02): the Plan de
  // acción no longer embeds `RecCard` for a matched row (WEB-AUDIT-R5,
  // retired below) — only the recommendation's id is needed now, to render
  // a plain "En tu plan" badge instead. The wider RecCard-shaped query and
  // its generated_solutions join are gone with it; a shrunk `id, run_id,
  // evidence_json` select is all this page needs.
  //
  // Bug fix (founder report 2026-07-18, still applies): filter by
  // `status = "active"` alone, never by `run_id = latestMap.scanId` — the
  // domain-coverage audit behind `latestMap` is a separate, manually
  // triggered action that can lag behind the latest scan (see
  // `auditedScanDate`'s own scanId-mismatch guard above), so a scanId filter
  // silently returns nothing whenever the two fall out of sync, which is the
  // common state, not an edge case.
  const { data: matchedRecs } = latestMap
    ? await supabase
        .from("recommendations")
        .select("id, run_id, evidence_json")
        .eq("project_id", projectId)
        .in("recommendation_type", ["add_citation_block", "increase_brand_visibility"])
        .eq("status", "active")
    : { data: [] };

  type MatchedRecRow = { id: string; run_id: string; evidence_json: unknown };

  const matchedRecRows = (matchedRecs ?? []) as MatchedRecRow[];
  const matchedRecRunIds = Array.from(new Set(matchedRecRows.map((r) => r.run_id)));
  const { data: recResultRows } =
    matchedRecRunIds.length > 0
      ? await supabase
          .from("scan_prompt_results")
          .select("id, prompt_id")
          .eq("project_id", projectId)
          .in("run_id", matchedRecRunIds)
      : { data: [] };
  const resultIdToPromptIdForRecs = new Map<string, string>();
  for (const row of (recResultRows ?? []) as Array<{ id: string; prompt_id: string | null }>) {
    if (row.prompt_id) resultIdToPromptIdForRecs.set(row.id, row.prompt_id);
  }

  const recommendationIdByPromptId = new Map<string, string>();
  for (const rec of matchedRecRows) {
    const evidence = rec.evidence_json as { affected_prompt_details?: Array<{ id: string }> } | null;
    const resultId = evidence?.affected_prompt_details?.[0]?.id;
    if (!resultId) continue;
    const promptId = resultIdToPromptIdForRecs.get(resultId);
    if (!promptId || recommendationIdByPromptId.has(promptId)) continue;
    recommendationIdByPromptId.set(promptId, rec.id);
  }

  // Full prioritized list — every actionable topic, not just a top-N slice
  // (WEB-AUDIT-R1). The Resumen tab shows the top 3 expanded and folds the
  // rest behind a native "Ver todas" expander.
  const actionPlan = summary
    ? buildActionPlan({
        summary,
        competitorsByPromptId,
        recommendationIdByPromptId,
        limit: summary.topics.length
      })
    : [];
  const topActions = actionPlan.slice(0, 3);
  const restActions = actionPlan.slice(3);

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

  // WEB-AUDIT-R5: filter chips above the Plan de acción, driven by the same
  // ActionItemKind the matrix quadrants target — replaces the old per-outcome
  // topic filter that lived in the removed "Contenido" tab.
  //
  // Simplified to 3 chips (founder-approved 2026-07-18): Todas / Optimizar
  // página / Crear contenido. create_competing, create_open and capture all
  // collapse into the single "Crear contenido" chip — from the founder's
  // perspective all three mean "publish a page" (only optimize means editing
  // an existing one); each row still shows its own more specific badge
  // (ACTION_KIND_META) so the distinction isn't lost, just not exposed as
  // three separate top-level filters. The matrix quadrants keep their
  // original per-kind precision untouched (visibilityMatches).
  const countsByKind: Record<ActionItemKind, number> = { optimize: 0, create_competing: 0, create_open: 0, capture: 0 };
  for (const item of actionPlan) countsByKind[item.kind] += 1;
  const createContentCount = countsByKind.create_competing + countsByKind.create_open + countsByKind.capture;
  const actionFilterOptions: ActionFilterCount[] = [
    { id: "all", label: "Todas", count: actionPlan.length },
    ...(countsByKind.optimize > 0 ? [{ id: "optimize" as ActionFilterId, label: "Optimizar página", count: countsByKind.optimize }] : []),
    ...(createContentCount > 0 ? [{ id: "create_content" as ActionFilterId, label: "Crear contenido", count: createContentCount }] : [])
  ];

  const analyzedPagesCount = technicalSnapshot ? technicalSnapshot.pages.filter((p) => p.status === "analyzed").length : 0;

  return (
    <WebAuditProvider projectId={projectId} autoStart={activeCampaignProgress} canAudit={canAudit}>
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
                  glance after a plan downgrade). Now reflects the actual
                  gate this page enforces below. */}
              {canAudit && <span className="badge badge-accent" style={{ fontSize: 10 }}>PRO</span>}
            </div>
          </div>
        </div>
        <div className="ov-sticky-right" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {latestMap && (
            <span style={{ fontSize: 11, color: "var(--ink-4)" }}>
              Última auditoría: {formatDate(latestMap.generatedAt)}
              {auditedScanDate ? ` · sobre el escaneo del ${formatDate(auditedScanDate)}` : ""}
            </span>
          )}
          <RunAuditButton canAudit={canAudit} />
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

      {/* A campaign can be left "running" server-side while the account's
          plan lapses mid-audit (e.g. downgraded via Stripe billing) — the
          banner must never promise "seguirá por donde se quedó" when it
          genuinely can't: WebAuditProvider won't auto-resume without
          canAudit, and the button that would show any driving state is
          hidden entirely under the plan gate. Founder report: the old
          unconditional version left the page looking permanently stuck with
          no error, no explanation. */}
      {activeCampaignProgress &&
        (canAudit ? (
          <div className="firstscan-banner">
            <div className="fb-ico">
              <Icon name="search" size={18} />
              <span className="fb-spin"></span>
            </div>
            <div style={{ flex: 1 }}>
              <div className="fb-t">Auditoría en curso</div>
              <div className="fb-d">
                Llevamos {activeCampaignProgress.covered} de {activeCampaignProgress.total} temas. Puedes navegar a
                otras páginas — al volver aquí, seguirá por donde se quedó.
              </div>
            </div>
            <span className="st-chip st-scanning">
              <span className="d" />
              Auditando
            </span>
          </div>
        ) : (
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
        ))}

      {/* Gated / empty states */}
      {!canAudit ? (
        <div className="card" style={{ marginTop: 14, padding: "24px 22px", textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 750, color: "var(--ink)", marginBottom: 8 }}>
            Disponible en el plan Pro
          </div>
          <p style={{ fontSize: 13.5, color: "var(--ink-3)", maxWidth: 460, margin: "0 auto 16px", lineHeight: 1.6 }}>
            Auditar la cobertura y la implementación de tu web es una función del plan Pro. Compara lo que publicas
            con lo que la IA realmente cita en sus respuestas.
          </p>
          <Link href="/dashboard/settings/billing" className="btn btn-primary btn-sm">
            Ver planes
          </Link>
        </div>
      ) : !latestRunRow ? (
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
      ) : !summary ? (
        <div className="card" style={{ marginTop: 14, padding: "24px 22px", textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 750, color: "var(--ink)", marginBottom: 8 }}>
            Todavía no has auditado tu web
          </div>
          <p style={{ fontSize: 13.5, color: "var(--ink-3)", maxWidth: 460, margin: "0 auto 16px", lineHeight: 1.6 }}>
            Tu dominio visto como lo ve la IA: la auditoría comprueba, tema a tema, si tu dominio publica contenido
            que Google encuentra, y lo cruza con las citas de tu último escaneo.
          </p>
          <p style={{ fontSize: 11.5, color: "var(--ink-4)", marginBottom: 16 }}>Hasta 5 auditorías al día por proyecto.</p>
          {/* Both RunAuditButton instances on this page share one campaign
              driver via WebAuditProvider, so this can't race the header
              button into a second concurrent loop. It's still hidden while a
              campaign is active because the "en curso" banner above already
              covers that state — showing a second button here would be
              redundant, not unsafe. */}
          {!hasActiveCampaign && (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <RunAuditButton canAudit={canAudit} />
            </div>
          )}
        </div>
      ) : (
        <AuditTabsProvider>
          {/* HERO (WEB-AUDIT-R1): one composite verdict + its breakdown,
              replacing the old 4-tile KPI row that mixed units (fractions,
              scores, counts) with no hierarchy. */}
          <div className="card" style={{ marginTop: 14, padding: "16px 18px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 20 }}>
              <ScoreGauge score={globalScore.score} />
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ display: "flex", alignItems: "center", fontSize: 13.5, fontWeight: 750 }}>
                  Diagnóstico general
                  <InfoTip text="Media simple de tus señales disponibles: cobertura de temas, temas implementados (citados por la IA) y salud técnica. Cada componente se muestra al lado — un componente sin auditar no cuenta como 0, simplemente no entra en la media." />
                </div>
                {globalScore.includedCount < 3 && (
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", margin: "2px 0 10px" }}>
                    Media de {globalScore.includedCount} {globalScore.includedCount === 1 ? "señal disponible" : "señales disponibles"} — audita el resto para completarla.
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginTop: globalScore.includedCount < 3 ? 0 : 10 }}>
                  {/* Sparklines plot the same real per-audit series as the
                      Evolución chart, in the same series colors (accent =
                      cobertura, pos = implementación). The técnica tile has
                      no history loaded (only the latest snapshot) — no
                      sparkline rather than a fake flat line. */}
                  <SubScoreTile
                    label="Contenido"
                    value={summary.coveragePct === null ? "—" : `${summary.coveredCount} / ${summary.conclusiveCount}`}
                    hint="temas con contenido propio verificado"
                    delta={coverageDelta}
                    pct={summary.coveragePct}
                    sparkValues={trend.map((p) => p.coveragePct)}
                    sparkColor="var(--accent)"
                  />
                  <SubScoreTile
                    label="Implementado"
                    value={summary.surfacingPct === null ? "—" : `${summary.surfacedCount} / ${summary.coveredCount}`}
                    hint={
                      summary.surfacingPct !== null && grouped.invisible.length > 0
                        ? `palanca rápida: ${grouped.invisible.length} ${grouped.invisible.length === 1 ? "tema aún sin citar" : "temas aún sin citar"}`
                        : "de tus temas con contenido, cuántos cita la IA"
                    }
                    delta={surfacingDelta}
                    pct={summary.surfacingPct}
                    sparkValues={trend.map((p) => p.surfacingPct)}
                    sparkColor="var(--pos)"
                  />
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
                        ? `media de ${analyzedPagesCount} ${analyzedPagesCount === 1 ? "página clave" : "páginas clave"}`
                        : "lánzala desde la pestaña Salud técnica"
                    }
                    delta={null}
                    pct={technicalSnapshot?.readiness_score ?? null}
                  />
                </div>
              </div>
            </div>
          </div>

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
                    <p style={{ fontSize: 11.5, color: "var(--ink-2)", margin: "6px 0 0" }}>
                      Suma exacta de los puntos de salud técnica que hoy pierdes. No incluye contenido: eso depende de
                      que la IA decida citarte.
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
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "12px 16px 0" }}>
                    <div>
                      <span
                        style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--ink-4)" }}
                      >
                        Críticos
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                        <span style={{ fontSize: 22, fontWeight: 800, color: "var(--wa-crit)", fontVariantNumeric: "tabular-nums" }}>
                          {currentTechnicalReport.issues.filter((i) => i.severity === "critical").length}
                        </span>
                        <Sparkline values={criticalSeries} color="var(--wa-crit)" />
                      </div>
                    </div>
                    <div>
                      <span
                        style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--ink-4)" }}
                      >
                        Avisos
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                        <span style={{ fontSize: 22, fontWeight: 800, color: "var(--warn)", fontVariantNumeric: "tabular-nums" }}>
                          {currentTechnicalReport.issues.filter((i) => i.severity === "warning").length}
                        </span>
                        <Sparkline values={warningSeries} color="var(--warn)" />
                      </div>
                    </div>
                  </div>
                  <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {currentTechnicalReport.issues.length > 0 ? (
                      currentTechnicalReport.issues.map((issue) => <IssueRow key={issue.check} issue={issue} />)
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
                  Todavía no has auditado la salud técnica de tu web.{" "}
                  {canAudit ? "Se comprueba automáticamente al pulsar «Auditar ahora»." : ""}
                </p>
              </div>
            )}

            {/* Plan de acción — el lado de contenido ("consigue que te citen")
                del reparto con Recomendaciones (WEB-AUDIT-ISSUES-1 fase 2;
                ver la cabecera de ActionPlanRow para el porqué completo).
                `id="action-plan"` es el destino de scroll de la matriz
                (audit-tabs.tsx). "Ver todas las acciones" solo aparece con
                filter === "all" (founder-approved 2026-07-17) — con un
                filtro concreto activo, cada fila que coincide ya se muestra
                directamente; ver PlanExpander. */}
            <div className="card" style={{ marginTop: 12 }} id="action-plan">
              <div style={{ padding: "13px 16px 0" }}>
                <div style={{ fontSize: 13.5, fontWeight: 750 }}>Plan de acción</div>
                <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                  Las acciones de mayor palanca según la matriz, de más a menos urgentes.
                </div>
              </div>
              <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                {actionPlan.length > 0 ? (
                  <>
                    <ActionFilterBar options={actionFilterOptions} />
                    <PlanExpander
                      totalCount={actionPlan.length}
                      restCount={restActions.length}
                      top={topActions.map((item, i) => (
                        <ActionRowVisibility key={item.promptId} matches={visibilityMatches(item.kind)}>
                          <ActionPlanRow
                            item={item}
                            index={i + 1}
                            projectId={projectId}
                            hasMatchingRecommendation={recommendationIdByPromptId.has(item.promptId)}
                          />
                        </ActionRowVisibility>
                      ))}
                      rest={restActions.map((item, i) => (
                        <ActionRowVisibility key={item.promptId} matches={visibilityMatches(item.kind)}>
                          <ActionPlanRow
                            item={item}
                            index={i + 4}
                            projectId={projectId}
                            hasMatchingRecommendation={recommendationIdByPromptId.has(item.promptId)}
                          />
                        </ActionRowVisibility>
                      ))}
                    />
                  </>
                ) : (
                  <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: 0 }}>
                    Tu contenido propio está rindiendo — nada urgente que crear ahora.
                  </p>
                )}
              </div>
            </div>

            {/* "Lo que ya funciona" (WEB-AUDIT-R5): performing topics have no
                action, so they never belonged in the plan above — but they
                shouldn't vanish either (they used to live in the removed
                "Contenido" tab). Plain always-expanded `.card`, matching every
                other top-level card's width/border-radius exactly (founder
                report 2026-07-17: it previously used the smaller-radius
                `.wa-details` chrome meant for NESTED rows, standing out from
                its siblings). The matrix's "Rindiendo" quadrant scrolls here. */}
            {grouped.performing.length > 0 && (
              <div className="card" style={{ marginTop: 12 }} id="performing-section">
                <div style={{ padding: "13px 16px 0", display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="badge badge-pos" style={{ flexShrink: 0 }}>Rindiendo</span>
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

            {/* Opportunity matrix as navigation: counts only, tap → filters
                the Plan de acción above (same tab, scrolled into view). The
                topics themselves render exactly once, inside that plan or
                "Lo que ya funciona" (founder report: every topic used to
                appear up to three times on one endless page). */}
            <div className="card" style={{ marginTop: 12 }}>
              <div style={{ padding: "13px 16px 0" }}>
                <div style={{ fontSize: 13.5, fontWeight: 750, display: "flex", alignItems: "center" }}>
                  Matriz de oportunidad
                  <InfoTip text="Cruza dos señales que sí controlas: contenido propio que Google indexa, y citas verificadas a tu dominio en las respuestas de la IA. No mide si la IA menciona tu marca por lo que ya sabe de ella — puedes salir en 'Hueco de contenido' aunque la IA te nombre primero; revisa el Plan de acción para verlo." />
                </div>
                <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                  Cada tema de tus prompts, cruzando contenido propio verificado × citas en el último escaneo. Toca un
                  cuadrante para filtrar el plan de acción.
                </div>
              </div>
              <div style={{ padding: "14px 16px 16px" }}>
                {/* minmax(0, 1fr) — not "1fr" — so the quadrant buttons can't
                    force the tracks past the card's width on mobile. */}
                <div style={{ display: "grid", gridTemplateColumns: "18px minmax(0, 1fr) minmax(0, 1fr)", gridTemplateRows: "1fr 1fr 18px", gap: 6 }}>
                  <div style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", gridRow: "1 / 3", fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-4)", display: "grid", placeItems: "center" }}>
                    Con contenido propio
                  </div>
                  <QuadrantButton
                    title="⚠ Invisible para la IA"
                    count={grouped.invisible.length}
                    tone="warn"
                    hint="Tienes página, pero la IA no la cita → optimizar"
                    target="optimize"
                  />
                  <QuadrantButton
                    title="✓ Rindiendo"
                    count={grouped.performing.length}
                    tone="pos"
                    hint="Contenido propio citado por la IA → mantener"
                    target="performing"
                  />
                  <QuadrantButton
                    title="✕ Sin contenido propio"
                    count={grouped.content_gap.length + grouped.open_opportunity.length}
                    tone="neg"
                    hint="Sin página propia y sin citas → crear contenido"
                    target="no_content"
                    extra={
                      grouped.content_gap.length + grouped.open_opportunity.length > 0 ? (
                        <span style={{ fontSize: 10.5, color: "var(--ink-3)" }}>
                          {grouped.content_gap.length > 0 && `Compite un rival: ${grouped.content_gap.length}`}
                          {grouped.content_gap.length > 0 && grouped.open_opportunity.length > 0 && " · "}
                          {grouped.open_opportunity.length > 0 && `Nadie destaca aún: ${grouped.open_opportunity.length}`}
                        </span>
                      ) : undefined
                    }
                  />
                  <QuadrantButton
                    title="◌ Citado sin contenido verificado"
                    count={grouped.unverified_cited.length}
                    tone="neutral"
                    hint="La IA te cita por otra vía, sin página verificada → capturar"
                    target="capture"
                  />
                  <div style={{ gridColumn: "2 / 4", fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-4)", display: "grid", placeItems: "center" }}>
                    La IA no te cita → sí te cita
                  </div>
                </div>
                {grouped.inconclusive.length > 0 && (
                  <p style={{ fontSize: 11.5, color: "var(--ink-4)", marginTop: 12, marginBottom: 0 }}>
                    {grouped.inconclusive.length}{" "}
                    {grouped.inconclusive.length === 1 ? "tema sin verificar en esta auditoría" : "temas sin verificar en esta auditoría"}{" "}
                    (no cuentan para los KPIs).
                  </p>
                )}
              </div>
            </div>

            {/* Evolución — trasladada aquí desde su antigua pestaña propia,
                ahora retirada (WEB-AUDIT-ISSUES-1 fase 2): "¿voy mejorando?"
                es la pregunta natural justo después de la lista de arriba,
                no un destino aparte. Mismo contenido, sin cambios. */}
            {trend.length >= 2 ? (
              <div className="card" style={{ marginTop: 16 }}>
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
            ) : (
              <p style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 16 }}>
                Necesitas al menos dos auditorías sobre escaneos distintos para ver la evolución. Lanza un nuevo
                escaneo y vuelve a auditar para empezar a comparar.
              </p>
            )}

            {trend.length > 0 && (
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
                aggregated Problemas/Correcto lists summarize. */}
            <div className="section-head" style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
              <div>
                <div className="section-title">Salud técnica GEO</div>
                <div className="section-desc">
                  {technicalSnapshot
                    ? `Comprobado ${formatDate(technicalSnapshot.created_at)}`
                    : "Comprueba si tus páginas son técnicamente citables por la IA y si sus bots pueden rastrear tu web."}
                </div>
              </div>
              <RunTechnicalAuditButton projectId={projectId} canAudit={canAudit} />
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
                      <PageAuditRow key={`${page.url}-${i}`} page={page} />
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
        <Link
          href={`/dashboard/projects/${projectId}/runs`}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, color: "var(--ink-3)", fontWeight: 600 }}
        >
          <Icon name="runs" size={13} />
          Escaneos
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
