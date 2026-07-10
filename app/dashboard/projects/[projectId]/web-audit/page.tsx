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
import { buildActionPlan, extractMentionedCompetitors, mergeCompetitorNames, type ActionItem, type ActionItemKind } from "@/lib/web-audit/action-plan";
import { RunAuditButton } from "./run-audit-button";
import { WebAuditProvider } from "./web-audit-context";
import { TopicChip } from "./topic-chip";

// Server Actions invoked from this page (auditDomainCoverageAction) run
// several sequential Gemini grounding calls up to COVERAGE_TOTAL_BUDGET_MS
// (~45s) — same ADR-0003 rationale as the Escaneos page's maxDuration.
export const maxDuration = 60;

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
  recommendationId,
  projectId
}: {
  topic: ClassifiedTopic;
  competitors: string[];
  brandMentioned: boolean;
  recommendationId: string | null;
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
  return (
    <div
      style={{
        padding: "12px 14px",
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: 10
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <span className={`badge ${meta.badgeClass}`}>{meta.label}</span>
        <span style={{ fontSize: 13, fontWeight: 650, color: "var(--ink)", minWidth: 0, overflowWrap: "anywhere" }}>
          {topic.topic}
        </span>
      </div>

      {/* "Qué hacer" inline, per row — not just in the "Plan de acción"
          summary card above (which caps at 5 items and requires scrolling
          back up to find). Founder report: looking at a single topic row
          here gave no idea what to do about it. */}
      {actionKind && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "8px 10px",
            margin: "0 0 8px",
            background: "var(--surface-2)",
            borderRadius: 8,
            flexWrap: "wrap"
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 650, color: "var(--ink-2)" }}>
            Qué hacer: {ACTION_KIND_META[actionKind].label}
          </span>
          <Link
            href={recommendationHref(projectId, recommendationId)}
            style={{ fontSize: 12, fontWeight: 650, color: "var(--accent)", whiteSpace: "nowrap" }}
          >
            {ACTION_KIND_META[actionKind].linkLabel}
          </Link>
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
  );
}

function ActionPlanRow({ item, index, projectId }: { item: ActionItem; index: number; projectId: string }) {
  const meta = ACTION_KIND_META[item.kind];
  const href = recommendationHref(projectId, item.recommendationId);

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
          {meta.linkLabel}
        </Link>
      </div>
    </div>
  );
}

function Quadrant({
  title,
  count,
  tone,
  hint,
  topics
}: {
  title: string;
  count: number;
  tone: "pos" | "warn" | "neg" | "neutral";
  hint: string;
  topics: ClassifiedTopic[];
}) {
  const toneVars: Record<string, { bg: string; fg: string; border: string }> = {
    pos: { bg: "var(--pos-soft)", fg: "var(--pos-ink)", border: "var(--pos-soft)" },
    warn: { bg: "var(--warn-soft)", fg: "var(--warn-ink)", border: "var(--warn-soft)" },
    neg: { bg: "var(--neg-soft)", fg: "var(--neg-ink)", border: "var(--neg-soft)" },
    neutral: { bg: "var(--surface-2)", fg: "var(--ink-3)", border: "var(--line)" }
  };
  const v = toneVars[tone];

  return (
    <div style={{ borderRadius: 10, padding: "10px 12px", border: `1px solid ${v.border}`, background: v.bg, minHeight: 108, minWidth: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 750, color: v.fg }}>
        {title}
        <span style={{ marginLeft: "auto", fontSize: 16, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{count}</span>
      </div>
      <div style={{ fontSize: 10.5, color: "var(--ink-3)", margin: "2px 0 7px" }}>{hint}</div>
      {topics.slice(0, 6).map((t) => (
        <TopicChip key={t.promptId} topic={t.topic} />
      ))}
      {topics.length > 6 && (
        <span style={{ fontSize: 10.5, color: "var(--ink-4)" }}>+{topics.length - 6} más</span>
      )}
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
        {points.map((p, i) => (
          <text key={p.generatedAt} x={xFor(i)} y={H - 4}>
            {formatDate(p.generatedAt)}
          </text>
        ))}
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

  const { data: addCitationRecs } = latestMap
    ? await supabase
        .from("recommendations")
        .select("id, evidence_json")
        .eq("project_id", projectId)
        .eq("run_id", latestMap.scanId)
        .eq("recommendation_type", "add_citation_block")
        .eq("status", "active")
    : { data: [] };

  const recommendationIdByPromptId = new Map<string, string>();
  for (const rec of (addCitationRecs ?? []) as Array<{
    id: string;
    evidence_json: { affected_prompt_details?: Array<{ id: string }> } | null;
  }>) {
    const resultId = rec.evidence_json?.affected_prompt_details?.[0]?.id;
    if (!resultId) continue;
    const promptId = resultIdToPromptId.get(resultId);
    if (!promptId || recommendationIdByPromptId.has(promptId)) continue;
    recommendationIdByPromptId.set(promptId, rec.id);
  }

  const actionPlan = summary
    ? buildActionPlan({ summary, competitorsByPromptId, recommendationIdByPromptId })
    : [];

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

  return (
    <WebAuditProvider projectId={projectId} autoStart={activeCampaignProgress}>
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
              <span className="badge badge-accent" style={{ fontSize: 10 }}>PRO</span>
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

      {activeCampaignProgress && (
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
      )}

      <div className="summary mt8">
        <div className="summary-ico">
          <Icon name="search" size={20} />
        </div>
        <p className="summary-txt">
          Tu dominio visto como lo ve la IA: qué contenido tienes y si las respuestas de IA lo aprovechan.
        </p>
      </div>

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
            La auditoría comprueba, tema a tema, si tu dominio publica contenido que Google encuentra, y lo cruza con
            las citas de tu último escaneo.
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
        <>
          {/* KPI row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 14 }}>
            <div className="card" style={{ padding: "13px 15px 11px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--ink-4)" }}>
                Cobertura de temas
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.02em", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
                {summary.coveragePct === null ? "—" : `${summary.coveredCount} / ${summary.conclusiveCount}`}
                <small style={{ fontSize: 13, color: "var(--ink-4)", fontWeight: 600, marginLeft: 6 }}>temas</small>
                {coverageDelta !== null && coverageDelta !== 0 && <Delta value={coverageDelta} suffix=" pt" />}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--ink-4)", marginTop: 6 }}>
                temas de tus prompts con contenido propio verificado
              </div>
            </div>
            <div className="card" style={{ padding: "13px 15px 11px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--ink-4)" }}>
                Temas aprovechados por la IA
              </div>
              {/* Fraction (like the coverage tile), not a bare percentage: a
                  giant "0 %" read as a failing grade when it actually flags
                  the fastest lever — pages that exist but aren't cited yet. */}
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.02em", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
                {summary.surfacingPct === null ? "—" : `${summary.surfacedCount} / ${summary.coveredCount}`}
                {summary.surfacingPct !== null && (
                  <small style={{ fontSize: 13, color: "var(--ink-4)", fontWeight: 600, marginLeft: 6 }}>temas</small>
                )}
              </div>
              <div style={{ fontSize: 10.5, marginTop: 6, color: grouped.invisible.length > 0 ? "var(--ink-2)" : "var(--ink-4)", fontWeight: grouped.invisible.length > 0 ? 650 : 400 }}>
                {summary.surfacingPct === null
                  ? "de tus temas con contenido propio, cuántos cita la IA"
                  : grouped.invisible.length > 0
                    ? `Tu palanca más rápida: ${grouped.invisible.length} ${grouped.invisible.length === 1 ? "tema con página propia que la IA aún no cita" : "temas con página propia que la IA aún no cita"}`
                    : "La IA ya cita todos tus temas con contenido propio"}
              </div>
            </div>
          </div>

          {/* Plan de acción (WEB-AUDIT-ACTION) — the first accionable thing
              after the KPIs, closing the "¿y ahora qué hago?" the matrix on
              its own leaves open. */}
          <div className="card" style={{ marginTop: 12 }}>
            <div style={{ padding: "13px 16px 0" }}>
              <div style={{ fontSize: 13.5, fontWeight: 750 }}>Plan de acción</div>
              <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                Las acciones de mayor palanca según la matriz, de más a menos urgentes.
              </div>
            </div>
            <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
              {actionPlan.length > 0 ? (
                actionPlan.map((item, i) => (
                  <ActionPlanRow key={item.promptId} item={item} index={i + 1} projectId={projectId} />
                ))
              ) : (
                <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: 0 }}>
                  Tu contenido propio está rindiendo — nada urgente que crear ahora.
                </p>
              )}
            </div>
          </div>

          {/* Opportunity matrix + trend — auto-fit so the two cards sit side by
              side on desktop but stack (never squash) on mobile; with only the
              matrix (no trend yet) auto-fit collapses the empty track to full
              width. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, marginTop: 12 }}>
            <div className="card">
              <div style={{ padding: "13px 16px 0" }}>
                <div style={{ fontSize: 13.5, fontWeight: 750, display: "flex", alignItems: "center" }}>
                  Matriz de oportunidad
                  <InfoTip text="Cruza dos señales que sí controlas: contenido propio que Google indexa, y citas verificadas a tu dominio en las respuestas de la IA. No mide si la IA menciona tu marca por lo que ya sabe de ella — puedes salir en 'Hueco de contenido' aunque la IA te nombre primero; mira el detalle por tema para verlo." />
                </div>
                <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                  Cada tema de tus prompts, cruzando contenido propio verificado × citas en el último escaneo.
                </div>
              </div>
              <div style={{ padding: "14px 16px 16px" }}>
                {/* minmax(0, 1fr) — not "1fr" — so the nowrap topic chips inside
                    the quadrants can't force the tracks to their min-content
                    width and overflow the card horizontally on mobile. */}
                <div style={{ display: "grid", gridTemplateColumns: "18px minmax(0, 1fr) minmax(0, 1fr)", gridTemplateRows: "1fr 1fr 18px", gap: 6 }}>
                  <div style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", gridRow: "1 / 3", fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-4)", display: "grid", placeItems: "center" }}>
                    Con contenido propio
                  </div>
                  <Quadrant
                    title="⚠ Invisible para la IA"
                    count={grouped.invisible.length}
                    tone="warn"
                    hint="Tienes página, pero la IA no la cita → optimizar"
                    topics={grouped.invisible}
                  />
                  <Quadrant
                    title="✓ Rindiendo"
                    count={grouped.performing.length}
                    tone="pos"
                    hint="Contenido propio citado por la IA → mantener"
                    topics={grouped.performing}
                  />
                  <div style={{ borderRadius: 10, padding: "10px 12px", border: "1px solid var(--neg-soft)", background: "var(--neg-soft)", minHeight: 108, minWidth: 0, overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 750, color: "var(--neg-ink)" }}>
                      ✕ Sin contenido propio
                      <span style={{ marginLeft: "auto", fontSize: 16, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                        {grouped.content_gap.length + grouped.open_opportunity.length}
                      </span>
                    </div>
                    <div style={{ fontSize: 10.5, color: "var(--ink-3)", margin: "2px 0 7px" }}>
                      Sin página propia y sin citas → crear contenido
                    </div>
                    {grouped.content_gap.length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--neg-ink)" }}>
                          Compite un rival ({grouped.content_gap.length})
                        </div>
                        {grouped.content_gap.slice(0, 4).map((t) => (
                          <TopicChip key={t.promptId} topic={t.topic} style={{ margin: "2px 0 0" }} />
                        ))}
                      </div>
                    )}
                    {grouped.open_opportunity.length > 0 && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-3)" }}>
                          Nadie destaca aún ({grouped.open_opportunity.length})
                        </div>
                        {grouped.open_opportunity.slice(0, 4).map((t) => (
                          <TopicChip key={t.promptId} topic={t.topic} style={{ margin: "2px 0 0" }} />
                        ))}
                      </div>
                    )}
                  </div>
                  <Quadrant
                    title="◌ Citado sin contenido verificado"
                    count={grouped.unverified_cited.length}
                    tone="neutral"
                    hint="La IA te cita por otra vía, sin página verificada → capturar"
                    topics={grouped.unverified_cited}
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

            {trend.length >= 2 && (
              <div className="card">
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
            )}
          </div>

          {/* Topic detail list, grouped by outcome */}
          <div className="section-head" style={{ marginTop: 20 }}>
            <div className="section-title">Detalle por tema</div>
            <div className="section-desc">{summary.topics.length} temas auditados</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {TOPIC_LIST_ORDER.flatMap((outcome) => grouped[outcome]).map((topic) => (
              <TopicRow
                key={topic.promptId}
                topic={topic}
                competitors={competitorsByPromptId.get(topic.promptId) ?? []}
                brandMentioned={brandMentionedByPromptId.get(topic.promptId) ?? false}
                recommendationId={recommendationIdByPromptId.get(topic.promptId) ?? null}
                projectId={projectId}
              />
            ))}
          </div>
        </>
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
