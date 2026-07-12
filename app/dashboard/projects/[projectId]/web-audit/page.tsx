import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { Delta } from "@/components/ui/delta";
import { InfoTip } from "@/components/ui/info-tip";
import { requireUser } from "@/lib/auth";
import { requireActiveProject } from "@/lib/project-workspace";
import { isProOrAbove } from "@/lib/billing";
import { parseCoverageMap } from "@/lib/web-audit/coverage-map";
import { buildWebAuditSummary, type PromptResultLite, type ClassifiedTopic, type TopicOutcome } from "@/lib/web-audit/opportunity-matrix";
import { buildCoverageTrend } from "@/lib/web-audit/trend";
import { buildGlobalScore } from "@/lib/web-audit/global-score";
import {
  buildActionPlan,
  extractMentionedCompetitors,
  mergeCompetitorNames,
  synthesizedGuidance,
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
  GoToTabButton,
  QuadrantButton,
  TopicFilterBar,
  TopicGroupSection,
  type TopicFilterCount
} from "./audit-tabs";
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

const OUTCOME_META: Record<TopicOutcome, { label: string; badgeClass: string }> = {
  performing: { label: "Rindiendo", badgeClass: "badge-pos" },
  invisible: { label: "Invisible para la IA", badgeClass: "badge-warn" },
  content_gap: { label: "Hueco de contenido", badgeClass: "badge-neg" },
  open_opportunity: { label: "Oportunidad abierta", badgeClass: "badge-neutral" },
  unverified_cited: { label: "Citado sin contenido verificado", badgeClass: "badge-neutral" },
  inconclusive: { label: "Sin verificar", badgeClass: "badge-outline" }
};

const TOPIC_LIST_ORDER: TopicOutcome[] = [
  "invisible",
  "content_gap",
  "performing",
  "unverified_cited",
  "open_opportunity",
  "inconclusive"
];

/** Segment colors for the coverage distribution bar in the Contenido tab. */
const OUTCOME_BAR_COLOR: Record<TopicOutcome, string> = {
  performing: "var(--pos)",
  invisible: "var(--warn)",
  content_gap: "var(--neg-ink)",
  open_opportunity: "var(--info)",
  unverified_cited: "var(--ink-3)",
  inconclusive: "var(--line)"
};

const ACTION_KIND_META: Record<ActionItemKind, { label: string; linkLabel: string; badgeClass: string }> = {
  optimize: { label: "Optimizar página existente", linkLabel: "Cómo optimizar →", badgeClass: "badge-warn" },
  create_competing: { label: "Crear contenido — compite un rival", linkLabel: "Ver recomendación →", badgeClass: "badge-neg" },
  create_open: { label: "Crear contenido — oportunidad abierta", linkLabel: "Ver recomendación →", badgeClass: "badge-neutral" },
  capture: { label: "Formalizar página propia", linkLabel: "Ver recomendación →", badgeClass: "badge-neutral" }
};

// Which action a topic's own outcome maps to — same mapping buildActionPlan()
// uses to prioritize the "Plan de acción" card, applied here per-row so
// every actionable topic in "Detalle por tema" shows its own "Qué hacer"
// inline, instead of making the founder cross-reference a summary card
// elsewhere on the page (founder report: looking at a single topic row gave
// no idea what to do about it). performing/inconclusive intentionally have
// no entry — the first is already working, the second has no reliable
// signal to act on.
const OUTCOME_TO_ACTION_KIND: Partial<Record<TopicOutcome, ActionItemKind>> = {
  invisible: "optimize",
  content_gap: "create_competing",
  open_opportunity: "create_open",
  unverified_cited: "capture"
};

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

/** Gauge ring for the hero's global "Preparación GEO" score. */
function ScoreGauge({ score }: { score: number | null }) {
  const size = 116;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = score ?? 0;
  const color = score === null ? "var(--ink-4)" : score < 40 ? "var(--neg-ink)" : score < 70 ? "var(--warn)" : "var(--pos)";
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

function SubScoreTile({
  label,
  value,
  hint,
  delta
}: {
  label: string;
  value: string;
  hint: string;
  delta: number | null;
}) {
  return (
    <div style={{ padding: "9px 11px", background: "var(--surface-2)", borderRadius: 10, minWidth: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--ink-4)" }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-.01em", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
        {value}
        {delta !== null && delta !== 0 && (
          <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 600 }}>
            <Delta value={delta} suffix=" pt" />
          </span>
        )}
      </div>
      <div style={{ fontSize: 10.5, color: "var(--ink-4)", marginTop: 2 }}>{hint}</div>
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
        <span className="badge badge-neutral" style={{ fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
          {check.pageScore} / 100
        </span>
        <span className="wa-chev">
          <Icon name="chevDown" size={14} />
        </span>
      </summary>
      <div className="wa-details-body">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <CheckDot ok={check.structuredData.pass} label="Datos estructurados" />
          <CheckDot
            ok={check.answerFormat.hasOneH1 && check.answerFormat.hasTwoH2 && check.answerFormat.hasAnswerFirstIntro}
            label="Formato respuesta-primero"
          />
          <CheckDot ok={check.metadata.titleOk && check.metadata.descriptionOk && check.metadata.ogOk} label="Metadatos + Open Graph" />
          <CheckDot ok={check.freshness.status === "fresh"} label={freshnessLabel(check.freshness.status)} />
          {/* WEB-AUDIT-R3 (founder-approved 2026-07-12): indexing + citability signals. */}
          <CheckDot ok={!check.indexability.noindex} label="Indexable" />
          <CheckDot ok={check.indexability.canonicalOk} label="Canonical propio" />
          {/* hreflang is never shown as a hard failure elsewhere (guidance text
              is conditional — a single-market page genuinely has none to add)
              but the dot itself stays a simple presence signal, consistent
              with every other dot on this row. */}
          <CheckDot ok={check.indexability.hreflangPresent} label="Hreflang" />
          <CheckDot ok={check.citability.hasListOrTable} label="Listas o tablas" />
          <CheckDot ok={check.citability.contentOk} label="Contenido sustancial" />
        </div>
        {(page.fetchMs !== null || page.htmlBytes !== null) && (
          <p style={{ fontSize: 10.5, color: "var(--ink-4)", margin: "8px 0 0" }}>
            {page.fetchMs !== null && `Tiempo de respuesta: ${page.fetchMs} ms`}
            {page.fetchMs !== null && page.htmlBytes !== null && " · "}
            {page.htmlBytes !== null && `Tamaño HTML: ${(page.htmlBytes / 1024).toFixed(1)} KB`}
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

function recommendationHref(projectId: string, recommendationId: string | null): string {
  // A deep-link only exists for recommendation types whose evidence anchors
  // to this exact prompt's result (currently add_citation_block — see
  // lib/recommendations/coverage-overlay.ts's join). Everything else falls
  // back to the generic Recomendaciones page rather than inventing a link.
  return recommendationId
    ? `/dashboard/projects/${projectId}/recommendations#rec-${recommendationId}`
    : `/dashboard/projects/${projectId}/recommendations`;
}

function TopicRow({
  topic,
  competitors,
  brandMentioned,
  recommendation,
  projectId
}: {
  topic: ClassifiedTopic;
  competitors: string[];
  brandMentioned: boolean;
  recommendation: { id: string; title: string; description: string } | null;
  projectId: string;
}) {
  const meta = OUTCOME_META[topic.outcome];
  const actionKind = OUTCOME_TO_ACTION_KIND[topic.outcome];
  // "Hueco de contenido" / "Oportunidad abierta" only mean: no own content
  // Google indexes for this topic, and no verified citation to your domain
  // in this scan. Neither checks whether the AI's answer names your brand
  // by its own knowledge (fame, not an asset you control) — a topic can be
  // a genuine content gap while the AI still leads with your brand name.
  // Surface that distinction here instead of leaving "Hueco de contenido"
  // read as "the AI doesn't know you" (founder-reported confusion).
  const showBrandMentionNote =
    (topic.outcome === "content_gap" || topic.outcome === "open_opportunity") && brandMentioned;

  // Collapsed by default (WEB-AUDIT-R1): 49 fully-expanded topic cards were
  // ~70% of the page's scroll. The summary row keeps outcome badge + topic;
  // everything else (qué hacer, competitors, pages, AI note) expands on tap.
  return (
    <details className="wa-details">
      <summary>
        <span className={`badge ${meta.badgeClass}`} style={{ flexShrink: 0 }}>{meta.label}</span>
        <span style={{ fontSize: 13, fontWeight: 650, color: "var(--ink)", minWidth: 0, overflowWrap: "anywhere" }}>
          {topic.topic}
        </span>
        <span className="wa-chev">
          <Icon name="chevDown" size={14} />
        </span>
      </summary>
      <div className="wa-details-body">
        {/* "Qué hacer" inline, per row — not just in the "Plan de acción"
            summary card (founder report, twice: looking at a single topic row
            gave no idea what to do about it, and clicking through to
            Recomendaciones landed on a decontextualized page with no
            explanation of the problem or the fix).
            When a real recommendation matches this exact topic (only
            add_citation_block/increase_brand_visibility can — see the query
            in the page component), show its own title + description right
            here; the link becomes a secondary "ver más" action instead of
            the only place to read anything. content_gap/unverified_cited
            topics have no matching recommendation type in the engine yet, so
            they keep the generic kind label + link — never inventing a
            problem statement that doesn't exist. */}
        {actionKind && (
          <div
            style={{
              padding: "8px 10px",
              margin: "0 0 8px",
              background: "var(--surface-2)",
              borderRadius: 8
            }}
          >
            {recommendation ? (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", marginBottom: 3 }}>
                  {recommendation.title}
                </div>
                <p style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.5, margin: "0 0 6px" }}>
                  {recommendation.description}
                </p>
                <Link
                  href={recommendationHref(projectId, recommendation.id)}
                  style={{ fontSize: 11.5, fontWeight: 650, color: "var(--accent)" }}
                >
                  Ver en Recomendaciones →
                </Link>
              </>
            ) : (
              <>
                {/* No real recommendation matches this topic (only
                    add_citation_block/increase_brand_visibility ever can — see
                    the query above) — the recommendation engine never
                    generates a card for content_gap/open_opportunity/
                    unverified_cited at all. Synthesize the guidance from data
                    already on the topic instead of leaving a bare label + a
                    link to a decontextualized page. Framed as "Sugerencia",
                    not a title, and never linked with a #rec- anchor — this
                    isn't a trackable/dismissible recommendation, and must
                    never look like one. */}
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 3 }}>
                  Sugerencia · {ACTION_KIND_META[actionKind].label}
                </div>
                <p style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.5, margin: "0 0 6px" }}>
                  {synthesizedGuidance(actionKind, competitors)}
                </p>
                <Link
                  href={recommendationHref(projectId, null)}
                  style={{ fontSize: 11.5, fontWeight: 650, color: "var(--accent)" }}
                >
                  Ver recomendaciones →
                </Link>
              </>
            )}
          </div>
        )}

        {/* WEB-AUDIT-ACTION: only rendered for content_gap topics with at least
            one AI-mentioned competitor — never inferred, straight from
            extracted_json.competitors[].mentioned for this prompt's result. */}
        {topic.outcome === "content_gap" && competitors.length > 0 && (
          <p style={{ fontSize: 12, color: "var(--ink-3)", margin: "0 0 6px" }}>
            La IA cita a: <strong style={{ color: "var(--ink-2)" }}>{competitors.join(", ")}</strong>
          </p>
        )}

        {showBrandMentionNote && (
          <p style={{ fontSize: 12, color: "var(--ink-2)", margin: "0 0 6px", fontWeight: 600 }}>
            Tu marca sí aparece mencionada en la respuesta de la IA — pero sin contenido propio verificado ni una cita a
            tu dominio. Esa mención viene de lo que el modelo ya sabe de ti, no de un activo que controles.
          </p>
        )}

        {topic.pages.length > 0 && (
          <ul style={{ fontSize: 12.5, color: "var(--ink-3)", paddingLeft: 16, margin: "0 0 6px" }}>
            {topic.pages.map((page, i) => (
              <li key={i}>
                <a
                  href={page.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--accent)", overflowWrap: "anywhere" }}
                >
                  {page.url}
                </a>
              </li>
            ))}
          </ul>
        )}

        <p style={{ fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55, margin: 0, fontStyle: "italic" }}>
          {topic.note}
          {topic.found && (
            <span style={{ color: "var(--ink-4)" }}> (interpretación de la IA, revísala antes de confiar en ella)</span>
          )}
        </p>
      </div>
    </details>
  );
}

function ActionPlanRow({ item, index, projectId }: { item: ActionItem; index: number; projectId: string }) {
  const meta = ACTION_KIND_META[item.kind];
  const href = recommendationHref(projectId, item.recommendationId);
  // Only claim a specific link when a real recommendation matches — the
  // per-kind label ("Cómo optimizar →" etc.) implies a matched card exists,
  // which is only ever true for optimize/capture-adjacent kinds anchored via
  // add_citation_block/increase_brand_visibility (see the query in the page
  // component). Everything else falls back to the honest generic wording.
  const linkLabel = item.recommendationId ? meta.linkLabel : "Ver recomendaciones →";

  return (
    <div style={{ display: "flex", gap: 10, padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10 }}>
      <div
        style={{
          flexShrink: 0,
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "var(--surface-2)",
          color: "var(--ink-3)",
          fontSize: 11,
          fontWeight: 750,
          display: "grid",
          placeItems: "center"
        }}
      >
        {index}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
          <span className={`badge ${meta.badgeClass}`}>{meta.label}</span>
          <span style={{ fontSize: 13, fontWeight: 650, color: "var(--ink)", minWidth: 0, overflowWrap: "anywhere" }}>
            {item.topic}
          </span>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: "0 0 6px" }}>{item.rationale}</p>
        {item.competitors.length > 0 && (
          <p style={{ fontSize: 11.5, color: "var(--ink-3)", margin: "0 0 6px" }}>
            La IA cita a: <strong style={{ color: "var(--ink-2)" }}>{item.competitors.join(", ")}</strong>
          </p>
        )}
        <Link href={href} style={{ fontSize: 12, fontWeight: 650, color: "var(--accent)" }}>
          {linkLabel}
        </Link>
      </div>
    </div>
  );
}

function TrendChart({ points }: { points: { generatedAt: string; coveragePct: number | null; surfacingPct: number | null }[] }) {
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
  const lastCov = [...points].reverse().find((p) => p.coveragePct !== null);
  const lastSur = [...points].reverse().find((p) => p.surfacingPct !== null);

  const ariaLabel = `Cobertura ${points[0]?.coveragePct ?? "sin dato"}% a ${lastCov?.coveragePct ?? "sin dato"}%; aprovechamiento ${points[0]?.surfacingPct ?? "sin dato"}% a ${lastSur?.surfacingPct ?? "sin dato"}% en ${points.length} auditorías.`;

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
      {lastCov && <circle cx={xFor(points.indexOf(lastCov))} cy={yFor(lastCov.coveragePct!)} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />}
      {lastSur && <circle cx={xFor(points.indexOf(lastSur))} cy={yFor(lastSur.surfacingPct!)} r={4} fill="var(--pos)" stroke="var(--surface)" strokeWidth={2} />}
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
          .select("id, prompt_id, run_id, extracted_json, provider, mentioned_competitors_count, brand_mentioned")
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

  // Whether the AI mentioned the brand by name for a topic's prompt, in the
  // audited scan — a signal the opportunity matrix itself never reads (see
  // TopicRow). Merges across providers: true if ANY provider's answer
  // mentioned the brand, since a single "no" from one engine shouldn't hide
  // a "yes" from another.
  const brandMentionedByPromptId = new Map<string, boolean>();
  for (const row of (resultRows ?? []) as Array<{ prompt_id: string | null; run_id: string; brand_mentioned: boolean }>) {
    if (!row.prompt_id || !latestMap || row.run_id !== latestMap.scanId) continue;
    if (row.brand_mentioned) brandMentionedByPromptId.set(row.prompt_id, true);
  }
  const summary = latestMap
    ? buildWebAuditSummary({ coverage: latestMap, results: resultsByScanId.get(latestMap.scanId) ?? [], projectDomain: project.domain })
    : null;
  const trend = buildCoverageTrend({ maps, resultsByScanId, projectDomain: project.domain });

  const auditedScan = latestMap ? maps.find((m) => m.scanId === latestMap.scanId) : null;
  const auditedScanDate = auditedScan?.scanId === latestRunRow?.id ? latestRunRow?.finished_at ?? latestRunRow?.created_at : null;

  const previousCoveragePct = trend.length >= 2 ? trend[trend.length - 2].coveragePct : null;
  const coverageDelta =
    summary?.coveragePct !== null && summary?.coveragePct !== undefined && previousCoveragePct !== null
      ? summary.coveragePct - previousCoveragePct
      : null;
  const previousSurfacingPct = trend.length >= 2 ? trend[trend.length - 2].surfacingPct : null;
  const surfacingDelta =
    summary?.surfacingPct !== null && summary?.surfacingPct !== undefined && previousSurfacingPct !== null
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
  const resultIdToPromptId = new Map<string, string>();
  for (const row of latestScanResultRows) {
    if (!row.prompt_id) continue;
    const lists = competitorListsByPromptId.get(row.prompt_id) ?? [];
    lists.push(extractMentionedCompetitors(row.extracted_json));
    competitorListsByPromptId.set(row.prompt_id, lists);
    resultIdToPromptId.set(row.id, row.prompt_id);
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
  const { data: matchedRecs } = latestMap
    ? await supabase
        .from("recommendations")
        .select("id, title, description, evidence_json")
        .eq("project_id", projectId)
        .eq("run_id", latestMap.scanId)
        .in("recommendation_type", ["add_citation_block", "increase_brand_visibility"])
        .eq("status", "active")
    : { data: [] };

  // Founder report: "Ver recomendación →" sent the founder to a
  // decontextualized Recomendaciones page with no explanation of the
  // problem or the fix right where they were looking. When a real
  // recommendation matches this exact topic, surface its own title/
  // description inline instead of making the link the only place to read
  // it — the link still exists, but as a secondary "ver más" action.
  const recommendationByPromptId = new Map<string, { id: string; title: string; description: string }>();
  for (const rec of (matchedRecs ?? []) as Array<{
    id: string;
    title: string;
    description: string;
    evidence_json: { affected_prompt_details?: Array<{ id: string }> } | null;
  }>) {
    const resultId = rec.evidence_json?.affected_prompt_details?.[0]?.id;
    if (!resultId) continue;
    const promptId = resultIdToPromptId.get(resultId);
    if (!promptId || recommendationByPromptId.has(promptId)) continue;
    recommendationByPromptId.set(promptId, { id: rec.id, title: rec.title, description: rec.description });
  }
  const recommendationIdByPromptId = new Map<string, string>();
  for (const [promptId, rec] of recommendationByPromptId) {
    recommendationIdByPromptId.set(promptId, rec.id);
  }

  // Full prioritized list (WEB-AUDIT-R1): the Resumen tab shows the top 3
  // expanded and folds the rest behind a native "Ver todas" expander, instead
  // of the old hard cap of 5 with no way to see beyond it.
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

  const filterOptions: TopicFilterCount[] = [
    { id: "all", label: "Todos", count: summary?.topics.length ?? 0 },
    ...TOPIC_LIST_ORDER.filter((outcome) => grouped[outcome].length > 0).map((outcome) => ({
      id: outcome as TopicFilterCount["id"],
      label: OUTCOME_META[outcome].label,
      count: grouped[outcome].length
    }))
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
            Auditar la cobertura y el aprovechamiento de tu web es una función del plan Pro. Compara lo que publicas
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
                  <InfoTip text="Media simple de tus señales disponibles: cobertura de temas, temas aprovechados por la IA y salud técnica. Cada componente se muestra al lado — un componente sin auditar no cuenta como 0, simplemente no entra en la media." />
                </div>
                {globalScore.includedCount < 3 && (
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", margin: "2px 0 10px" }}>
                    Media de {globalScore.includedCount} {globalScore.includedCount === 1 ? "señal disponible" : "señales disponibles"} — audita el resto para completarla.
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginTop: globalScore.includedCount < 3 ? 0 : 10 }}>
                  <SubScoreTile
                    label="Contenido"
                    value={summary.coveragePct === null ? "—" : `${summary.coveredCount} / ${summary.conclusiveCount}`}
                    hint="temas con contenido propio verificado"
                    delta={coverageDelta}
                  />
                  <SubScoreTile
                    label="Aprovechamiento"
                    value={summary.surfacingPct === null ? "—" : `${summary.surfacedCount} / ${summary.coveredCount}`}
                    hint={
                      summary.surfacingPct !== null && grouped.invisible.length > 0
                        ? `palanca rápida: ${grouped.invisible.length} ${grouped.invisible.length === 1 ? "tema aún sin citar" : "temas aún sin citar"}`
                        : "de tus temas con contenido, cuántos cita la IA"
                    }
                    delta={surfacingDelta}
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
                open (WEB-AUDIT-ACTION), now the protagonist of the default
                tab (WEB-AUDIT-R1). */}
            <div className="card" style={{ marginTop: 12 }}>
              <div style={{ padding: "13px 16px 0" }}>
                <div style={{ fontSize: 13.5, fontWeight: 750 }}>Plan de acción</div>
                <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                  Las acciones de mayor palanca según la matriz, de más a menos urgentes.
                </div>
              </div>
              <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                {actionPlan.length > 0 ? (
                  <>
                    {topActions.map((item, i) => (
                      <ActionPlanRow key={item.promptId} item={item} index={i + 1} projectId={projectId} />
                    ))}
                    {restActions.length > 0 && (
                      <details className="wa-more">
                        <summary>Ver todas las acciones ({actionPlan.length})</summary>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {restActions.map((item, i) => (
                            <ActionPlanRow key={item.promptId} item={item} index={i + 4} projectId={projectId} />
                          ))}
                        </div>
                      </details>
                    )}
                  </>
                ) : (
                  <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: 0 }}>
                    Tu contenido propio está rindiendo — nada urgente que crear ahora.
                  </p>
                )}
              </div>
            </div>

            {/* Opportunity matrix as navigation: counts only, tap → Contenido
                tab pre-filtered. The topics themselves render exactly once,
                in that tab (founder report: every topic used to appear up to
                three times on one endless page). */}
            <div className="card" style={{ marginTop: 12 }}>
              <div style={{ padding: "13px 16px 0" }}>
                <div style={{ fontSize: 13.5, fontWeight: 750, display: "flex", alignItems: "center" }}>
                  Matriz de oportunidad
                  <InfoTip text="Cruza dos señales que sí controlas: contenido propio que Google indexa, y citas verificadas a tu dominio en las respuestas de la IA. No mide si la IA menciona tu marca por lo que ya sabe de ella — puedes salir en 'Hueco de contenido' aunque la IA te nombre primero; abre un tema en la pestaña Contenido para verlo." />
                </div>
                <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                  Cada tema de tus prompts, cruzando contenido propio verificado × citas en el último escaneo. Toca un
                  cuadrante para ver sus temas.
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
                    target="invisible"
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
                    target="unverified_cited"
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

          {/* ─── Contenido ─── */}
          <AuditTabPanel id="contenido">
            <div className="section-head" style={{ marginTop: 16 }}>
              <div className="section-title">Detalle por tema</div>
              <div className="section-desc">{summary.topics.length} temas auditados · toca un tema para ver qué hacer</div>
            </div>

            {/* Distribution bar: how the audited topics split across
                outcomes, in the same colors as their badges/quadrants. */}
            {summary.topics.length > 0 && (
              <div style={{ display: "flex", height: 8, borderRadius: 999, overflow: "hidden", margin: "10px 0 2px", background: "var(--surface-2)" }}>
                {TOPIC_LIST_ORDER.filter((outcome) => grouped[outcome].length > 0).map((outcome) => (
                  <div
                    key={outcome}
                    title={`${OUTCOME_META[outcome].label}: ${grouped[outcome].length}`}
                    style={{
                      width: `${(grouped[outcome].length / summary.topics.length) * 100}%`,
                      background: OUTCOME_BAR_COLOR[outcome]
                    }}
                  />
                ))}
              </div>
            )}

            <TopicFilterBar options={filterOptions} />

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {TOPIC_LIST_ORDER.map((outcome) =>
                grouped[outcome].length > 0 ? (
                  <TopicGroupSection key={outcome} outcome={outcome}>
                    {grouped[outcome].map((topic) => (
                      <TopicRow
                        key={topic.promptId}
                        topic={topic}
                        competitors={competitorsByPromptId.get(topic.promptId) ?? []}
                        brandMentioned={brandMentionedByPromptId.get(topic.promptId) ?? false}
                        recommendation={recommendationByPromptId.get(topic.promptId) ?? null}
                        projectId={projectId}
                      />
                    ))}
                  </TopicGroupSection>
                ) : null
              )}
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
                    Cobertura y aprovechamiento a lo largo de los últimos escaneos.
                  </div>
                </div>
                <div style={{ display: "flex", gap: 14, fontSize: 11, color: "var(--ink-3)", fontWeight: 600, padding: "10px 16px 0" }}>
                  <span>
                    <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, marginRight: 5, verticalAlign: -1, background: "var(--accent)" }} />
                    Cobertura de temas
                  </span>
                  <span>
                    <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, marginRight: 5, verticalAlign: -1, background: "var(--pos)" }} />
                    Tasa de aprovechamiento
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
                <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                  {[...trend].reverse().map((point) => (
                    <div
                      key={point.scanId}
                      style={{ display: "flex", alignItems: "center", gap: 12, padding: "7px 10px", borderRadius: 8, background: "var(--surface-2)", flexWrap: "wrap" }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 650, color: "var(--ink)" }}>{formatDate(point.generatedAt)}</span>
                      <span style={{ fontSize: 11.5, color: "var(--ink-3)", marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>
                        Cobertura: {point.coveragePct === null ? "—" : `${point.coveragePct}%`}
                      </span>
                      <span style={{ fontSize: 11.5, color: "var(--ink-3)", fontVariantNumeric: "tabular-nums" }}>
                        Aprovechamiento: {point.surfacingPct === null ? "—" : `${point.surfacingPct}%`}
                      </span>
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
