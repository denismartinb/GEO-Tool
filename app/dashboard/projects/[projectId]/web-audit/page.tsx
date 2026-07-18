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
import { parseGeneratedSolution, type GeneratedSolution } from "@/lib/recommendations/generated-solution";
import { RunAuditButton } from "./run-audit-button";
import { RunTechnicalAuditButton } from "./run-technical-audit-button";
import { WebAuditProvider } from "./web-audit-context";
import {
  AuditTabsProvider,
  AuditTabBar,
  AuditTabPanel,
  GoToTabButton,
  QuadrantButton,
  ActionFilterBar,
  ActionRowVisibility,
  PlanExpander,
  type ActionFilterId,
  type ActionFilterCount
} from "./audit-tabs";
import { RecCard, type Recommendation } from "../recommendations/recommendations-client";
import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";
import type { BotAccessReport, BotAgent } from "@/lib/web-audit/robots";
import { buildPageCheckGuidance } from "@/lib/web-audit/page-checks";

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

// WEB-AUDIT-R5: a matched recommendation now embeds its own interactive
// RecCard (see ActionPlanRow) instead of deep-linking out — this only ever
// points at the generic Recomendaciones page, for topics with no matching
// recommendation type in the engine at all.
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
 * One row of the Plan de acción (WEB-AUDIT-R5, self-contained per founder
 * request 2026-07-16). When a real recommendation matches this topic (only
 * add_citation_block/increase_brand_visibility ever can — see the query in
 * the page component), embed the SAME interactive `RecCard` used on the
 * Recomendaciones page: its own evidence, "Generar propuesta con IA", and
 * "Marcar como hecho" all work right here, no navigation required. When no
 * real recommendation matches (content_gap/open_opportunity/unverified_cited
 * have no matching type in the engine yet), keep the synthesized
 * "Sugerencia" box — plain text and a generic link, never a fake button on
 * something that isn't a trackable recommendation.
 *
 * The number chip + kind badge sit in a header ABOVE the content box in
 * BOTH cases (founder report 2026-07-17: with the chip sitting beside the
 * box only for the synthesized case, `RecCard` — which owns its own full-
 * width border and can't have a sibling merged into it — rendered visibly
 * narrower and offset from the synthesized box next to it). Keeping the
 * chip entirely outside either box means the box itself is always the row's
 * full available width, whichever branch renders.
 */
function ActionPlanRow({
  item,
  index,
  projectId,
  recommendation
}: {
  item: ActionItem;
  index: number;
  projectId: string;
  recommendation: Recommendation | null;
}) {
  const meta = ACTION_KIND_META[item.kind];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <ActionNumberChip index={index} kind={item.kind} />
        <span className={`badge ${meta.badgeClass}`}>{meta.label}</span>
        {/* The topic text only needs to appear here for the synthesized case
            — a matched recommendation's own title (inside RecCard) already
            names the topic, repeating it in the header would be redundant. */}
        {!recommendation && (
          <span style={{ fontSize: 13, fontWeight: 650, color: "var(--ink)", minWidth: 0, overflowWrap: "anywhere" }}>
            {item.topic}
          </span>
        )}
      </div>
      {recommendation ? (
        <RecCard rec={recommendation} projectId={projectId} />
      ) : (
        <div style={{ padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10 }}>
          <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: "0 0 6px" }}>{item.rationale}</p>
          {item.competitors.length > 0 && (
            <p style={{ fontSize: 11.5, color: "var(--ink-3)", margin: "0 0 6px" }}>
              La IA cita a: <strong style={{ color: "var(--ink-2)" }}>{item.competitors.join(", ")}</strong>
            </p>
          )}
          <Link href={genericRecommendationsHref(projectId)} style={{ fontSize: 12, fontWeight: 650, color: "var(--accent)" }}>
            Ver recomendaciones →
          </Link>
        </div>
      )}
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

  // WEB-AUDIT-2: latest technical-audit snapshot, if any. Rendered as-is —
  // this page never re-triggers the audit itself, only the button does
  // (lib/web-audit/technical-audit.ts owns the cache/rate-limit rules).
  const { data: technicalSnapshotRow } = canAudit
    ? await supabase
        .from("web_audit_snapshots")
        .select("readiness_score, pages, bots, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };
  const technicalSnapshot = technicalSnapshotRow as {
    readiness_score: number | null;
    pages: PageAuditEntry[];
    bots: BotAccessReport;
    created_at: string;
  } | null;

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
  // WEB-AUDIT-R5 (founder-approved 2026-07-16): the Plan de acción now embeds
  // the SAME interactive RecCard the Recomendaciones page renders — "Generar
  // propuesta con IA" and "Marcar como hecho" work in place, so the query
  // widened from {id, title, description} to every column RecCard reads.
  //
  // Bug fix (founder report 2026-07-18): "Ver recomendación" stopped
  // rendering inline. Root cause — lib/scan/executor.ts supersedes every
  // OTHER run's "active" recommendations project-wide the instant any new
  // scan completes (exactly one run ever holds "active" at a time), but the
  // domain-coverage audit behind `latestMap` is a separate, manually
  // triggered action that can lag behind the latest scan (see
  // `auditedScanDate`'s own scanId-mismatch guard just above, which already
  // anticipated this). Filtering matchedRecs by `run_id = latestMap.scanId`
  // silently returned nothing whenever the two fell out of sync — a very
  // common state, not an edge case — so every row fell back to the plain
  // link. `status = "active"` alone is the correct, staleness-proof filter;
  // the evidence's scan_prompt_results id is resolved to a promptId via a
  // query scoped to each recommendation's own `run_id`, never assumed to
  // equal `latestMap.scanId`.
  const { data: matchedRecs } = latestMap
    ? await supabase
        .from("recommendations")
        .select(
          "id, run_id, priority_rank, title, description, recommendation_type, impact, effort, confidence, status, source_type, evidence_json, consecutive_runs_open"
        )
        .eq("project_id", projectId)
        .in("recommendation_type", ["add_citation_block", "increase_brand_visibility"])
        .eq("status", "active")
    : { data: [] };

  type MatchedRecRow = {
    id: string;
    run_id: string;
    priority_rank: number;
    title: string;
    description: string;
    recommendation_type: string;
    impact: string;
    effort: string;
    confidence: string;
    status: string;
    source_type: string;
    evidence_json: unknown;
    consecutive_runs_open: number | null;
  };

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

  // Founder report: "Ver recomendación →" sent the founder to a
  // decontextualized Recomendaciones page with no explanation of the
  // problem or the fix right where they were looking. A matched real
  // recommendation now renders inline via RecCard instead of a link.
  // `coverageOverlay` is intentionally left null here — computing it needs
  // the same coverage-overlay join lib/recommendations/coverage-overlay.ts
  // performs, out of scope for this first cut; RecCard renders its normal
  // (non-enriched) state without it, never a fake one.
  const recommendationByPromptId = new Map<string, Recommendation>();
  for (const rec of matchedRecRows) {
    const evidence = rec.evidence_json as { affected_prompt_details?: Array<{ id: string }> } | null;
    const resultId = evidence?.affected_prompt_details?.[0]?.id;
    if (!resultId) continue;
    const promptId = resultIdToPromptIdForRecs.get(resultId);
    if (!promptId || recommendationByPromptId.has(promptId)) continue;
    recommendationByPromptId.set(promptId, {
      id: rec.id,
      priority_rank: rec.priority_rank,
      title: rec.title,
      description: rec.description,
      recommendation_type: rec.recommendation_type,
      impact: rec.impact,
      effort: rec.effort,
      confidence: rec.confidence,
      status: rec.status,
      source_type: rec.source_type,
      evidence_json: rec.evidence_json as Recommendation["evidence_json"],
      consecutive_runs_open: rec.consecutive_runs_open ?? undefined,
      solution: null,
      coverageOverlay: null
    });
  }

  // Same pattern recommendations/page.tsx uses to attach the latest
  // sanitized AI-generated solution (if any) — the embedded RecCard needs it
  // to show "Propuesta generada" instead of the "Generar propuesta" button.
  const matchedRecIds = Array.from(recommendationByPromptId.values()).map((r) => r.id);
  if (matchedRecIds.length > 0) {
    const { data: solutionRows } = await supabase
      .from("generated_solutions")
      .select("recommendation_id, sanitized_content, created_at")
      .eq("project_id", projectId)
      .eq("status", "completed")
      .eq("is_sanitized", true)
      .in("recommendation_id", matchedRecIds)
      .order("created_at", { ascending: false });

    const solutionByRecId = new Map<string, GeneratedSolution>();
    for (const row of (solutionRows ?? []) as Array<{ recommendation_id: string; sanitized_content: string | null }>) {
      // Newest-first order means the first row seen per recommendation wins.
      if (solutionByRecId.has(row.recommendation_id) || !row.sanitized_content) continue;
      const parsed = parseGeneratedSolution(row.sanitized_content);
      if (parsed) solutionByRecId.set(row.recommendation_id, parsed);
    }
    for (const rec of recommendationByPromptId.values()) {
      rec.solution = solutionByRecId.get(rec.id) ?? null;
    }
  }

  const recommendationIdByPromptId = new Map<string, string>();
  for (const [promptId, rec] of recommendationByPromptId) {
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
  const allowedBotsCount = technicalSnapshot ? technicalSnapshot.bots.bots.filter((b) => b.allowed).length : 0;

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
          <AuditTabPanel id="resumen">
            {/* Plan de acción — the first actionable thing after the verdict,
                closing the "¿y ahora qué hago?" the matrix on its own leaves
                open (WEB-AUDIT-ACTION), the protagonist of the default tab
                (WEB-AUDIT-R1) and now fully self-contained (WEB-AUDIT-R5,
                founder-approved 2026-07-16): a matched real recommendation
                embeds its own interactive RecCard right here — Generar
                propuesta / Marcar como hecho work in place, no navigation
                required. `id="action-plan"` is the matrix's scroll target
                (audit-tabs.tsx). "Ver todas las acciones" only appears while
                filter === "all" (founder-approved 2026-07-17) — with a
                specific filter active, every matching row is already shown
                directly; see PlanExpander. */}
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
                            recommendation={recommendationByPromptId.get(item.promptId) ?? null}
                          />
                        </ActionRowVisibility>
                      ))}
                      rest={restActions.map((item, i) => (
                        <ActionRowVisibility key={item.promptId} matches={visibilityMatches(item.kind)}>
                          <ActionPlanRow
                            item={item}
                            index={i + 4}
                            projectId={projectId}
                            recommendation={recommendationByPromptId.get(item.promptId) ?? null}
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

            {/* Compact technical status — one line per signal; the detail
                lives once, in its own tab. Expanded only when something is
                actually wrong (a blocked bot deserves attention; seven green
                "Permitido" rows don't). */}
            <div className="card" style={{ marginTop: 12 }}>
              <div style={{ padding: "13px 16px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700 }}>Salud técnica</span>
                  <span style={{ fontSize: 12, color: "var(--ink-3)", flex: 1, minWidth: 0 }}>
                    {technicalSnapshot
                      ? technicalSnapshot.readiness_score === null
                        ? "Ninguna página clave se pudo analizar en la última auditoría técnica."
                        : `${technicalSnapshot.readiness_score} / 100 · media de ${analyzedPagesCount} ${analyzedPagesCount === 1 ? "página clave" : "páginas clave"} · ${formatDate(technicalSnapshot.created_at)}`
                      : "Todavía no has auditado la salud técnica de tu web."}
                  </span>
                  <GoToTabButton tab="tecnica">Ver detalle →</GoToTabButton>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700 }}>Bots de IA</span>
                  <span style={{ fontSize: 12, color: "var(--ink-3)", flex: 1, minWidth: 0 }}>
                    {technicalSnapshot ? (
                      <>
                        {allowedBotsCount} / {technicalSnapshot.bots.bots.length} con acceso
                        {technicalSnapshot.bots.bots.some((b) => !b.allowed) &&
                          ` · bloqueado: ${technicalSnapshot.bots.bots.filter((b) => !b.allowed).map((b) => b.agent).join(", ")}`}
                        {" · llms.txt "}
                        {technicalSnapshot.bots.llmsTxtFound ? "encontrado ✓" : "no encontrado"}
                      </>
                    ) : (
                      "Se comprueban con la auditoría técnica (robots.txt y llms.txt)."
                    )}
                  </span>
                  <GoToTabButton tab="tecnica">Ver detalle →</GoToTabButton>
                </div>
              </div>
            </div>
          </AuditTabPanel>

          {/* ─── Salud técnica ─── */}
          <AuditTabPanel id="tecnica">
            {/* Salud técnica GEO (WEB-AUDIT-2): deterministic per-page checks +
                AI-bot access, independent from the Gemini-driven coverage
                audit. */}
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

          {/* ─── Evolución ─── */}
          <AuditTabPanel id="evolucion">
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
    </WebAuditProvider>
  );
}
