import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/empty-state";
import { Gauge } from "@/components/ui/gauge";
import { Sparkline } from "@/components/ui/sparkline";
import { Delta } from "@/components/ui/delta";
import { DotMeter } from "@/components/ui/dot-meter";
import { InfoTip } from "@/components/ui/info-tip";
import { ScanInProgressLive } from "@/components/scan-in-progress-live";
import { ScanProgressPoller } from "@/components/scan-progress-poller";
import { ScanTriggerButton } from "@/components/scan-trigger-button";
import { feedbackErrorMessages, feedbackSuccessMessages } from "@/lib/projects/feedback-messages";
import { reconcileStuckScanRuns, scanRunsNeedReconciliation } from "@/lib/scan/scan-runner";
import { getLLMScanProviders } from "@/lib/scan/executor";
import { createServiceClient } from "@/lib/supabase/service";

/* ---- constants & helpers ---- */

const COMPETITOR_COLORS = ["#0e9488", "#d9772b", "#9333a8", "#3b6fd6", "#e54563"];

const ENGINE_LABELS: Record<string, { label: string; color: string }> = {
  gemini: { label: "Gemini", color: "#4285f4" },
  claude: { label: "Claude", color: "#d97757" }
};

const statusLabels: Record<string, string> = {
  pending: "pendiente",
  running: "en curso",
  completed: "completado",
  failed: "fallido",
  cancelled: "cancelado"
};

const confidenceLabels: Record<string, string> = {
  low: "baja",
  medium: "media",
  high: "alta"
};

const sentimentLabels: Record<string, string> = {
  positive: "positivo",
  neutral: "neutral",
  negative: "negativo",
  mixed: "mixto",
  unknown: "desconocido"
};

const priorityLabels: Record<string, string> = {
  high: "alta",
  med: "media",
  low: "baja"
};

function n(v: unknown): number {
  return Number(v ?? 0);
}

function confidenceToPercent(c: string): number {
  return c === "high" ? 90 : c === "medium" ? 70 : 40;
}

function impactEffortToN(v: string): number {
  return v === "high" ? 5 : v === "medium" || v === "med" ? 3 : 1;
}

function getBandLabel(score: number): string {
  if (score >= 70) return "Franja «competitivo»";
  if (score >= 40) return "Franja «emergente»";
  return "Franja «inicial»";
}

function getBandTone(score: number): string {
  if (score >= 70) return "pos";
  if (score >= 40) return "accent";
  return "warn";
}

/**
 * Classification bands for "Presión Competitiva" (docs/adr/0011).
 * Higher score = worse (the brand is more displaced by competitors), so the
 * tone scale is inverted relative to getBandTone: low score = green/positive,
 * high score = red/negative.
 */
function getCompetitivePressureBand(score: number): { label: string; tone: string } {
  if (score > 80) return { label: "Crítica", tone: "neg" };
  if (score >= 50) return { label: "Alta", tone: "warn" };
  if (score >= 20) return { label: "Media", tone: "accent" };
  return { label: "Baja", tone: "pos" };
}

type ExtractedJsonPartial = {
  competitors?: Array<{ name?: string; mentioned?: boolean }>;
  citations?: Array<{ url?: string | null; domain?: string | null; title?: string | null; source?: string }>;
  brand?: { mentioned?: boolean; evidence?: string[] };
  summary?: string;
};

type BrandPositionEntry = {
  name?: string;
  is_brand?: boolean;
  avg_position?: number;
  mention_count?: number;
};

type BrandPositionDetails = {
  prompts_with_position_data?: number;
  total_entities?: number;
  ranking?: BrandPositionEntry[];
  brand_avg_position?: number;
  confidence?: string;
};

type GeoScoreComponent = {
  value?: number | null;
  weight?: number;
  reason?: string;
};

type GeoScoreDetails = {
  score?: number;
  composite_version?: string;
  confidence?: string;
  inputs_used?: string[];
  components?: {
    presence?: GeoScoreComponent;
    prominence?: GeoScoreComponent;
    standing?: GeoScoreComponent;
    authority?: GeoScoreComponent;
  };
  formula?: string;
};

function parseExt(raw: unknown): ExtractedJsonPartial {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as ExtractedJsonPartial;
}

/* ---- page ---- */

export default async function ProjectDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { projectId } = await params;
  const feedback = await searchParams;
  const { supabase } = await requireUser();

  const RUNS_SELECT =
    "id, status, error_summary, total_prompts, successful_prompts, failed_prompts, created_at, started_at, finished_at";

  // The project row, prompts, competitors, and runs are all independent of
  // each other and of reconciliation, so they are fetched in one batch.
  // Reconciliation itself is decided from the already-fetched `runs` below
  // instead of running unconditionally on every render
  // (docs/architecture-audit-2026-07.md, finding 1.3 / PERF-3a).
  const [{ data: project }, { data: prompts }, { data: competitors }, { data: runsData }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, domain, brand, country, language, created_at")
      .eq("id", projectId)
      .eq("is_archived", false)
      .single(),
    supabase
      .from("project_prompts")
      .select("id, prompt_text, category, is_active")
      .eq("project_id", projectId)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("project_competitors")
      .select("id, name, domain, is_active")
      .eq("project_id", projectId)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("scan_runs")
      .select(RUNS_SELECT)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
  ]);

  if (!project) notFound();

  let runs = runsData;
  if (scanRunsNeedReconciliation(runs)) {
    // Reconcile any stuck pending/running runs (or retry an exhausted
    // zero-result failure), then re-read scan_runs so the Overview reflects
    // the corrected status instead of the pre-reconciliation snapshot
    // (docs/scan-lifecycle.md, "Timeout detection").
    const { reconciledCount } = await reconcileStuckScanRuns({ projectId, service: createServiceClient() });
    if (reconciledCount > 0) {
      const { data: refreshedRuns } = await supabase
        .from("scan_runs")
        .select(RUNS_SELECT)
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      runs = refreshedRuns;
    }
  }

  const latestRun = runs?.[0];
  const latestCompletedRun = runs?.find((r) => r.status === "completed");
  const completedRunsCount = runs?.filter((r) => r.status === "completed").length ?? 0;
  const latestFailedRun = latestRun?.status === "failed" ? latestRun : null;
  const activeRun = runs?.find((r) => r.status === "pending" || r.status === "running");
  const feedbackErrorMessage = feedback.error
    ? feedbackErrorMessages[feedback.error] ?? feedbackErrorMessages.unexpected_error
    : null;
  const successMessage = feedback.success ? feedbackSuccessMessages[feedback.success] ?? null : null;

  /* ---- queries that require a completed run ---- */
  const [
    { data: latestScore },
    { data: allPromptResults },
    { data: latestRecommendations },
    { data: trendHistory }
  ] = latestCompletedRun
    ? await Promise.all([
        supabase
          .from("run_scores")
          .select("visibility_score, citation_score, competitor_gap_score, confidence, details_json")
          .eq("project_id", projectId)
          .eq("run_id", latestCompletedRun.id)
          .maybeSingle(),
        supabase
          .from("scan_prompt_results")
          .select("brand_mentioned, citation_found, sentiment, extracted_json, provider")
          .eq("project_id", projectId)
          .eq("run_id", latestCompletedRun.id)
          .eq("status", "completed"),
        supabase
          .from("recommendations")
          .select("id, priority_rank, title, impact, effort, confidence, recommendation_type, evidence_json")
          .eq("project_id", projectId)
          .eq("run_id", latestCompletedRun.id)
          .eq("status", "active")
          .order("priority_rank", { ascending: true })
          .limit(3),
        supabase
          .from("run_scores")
          .select("visibility_score, citation_score, competitor_gap_score, created_at")
          .eq("project_id", projectId)
          .order("created_at", { ascending: true })
          .limit(7)
      ])
    : [{ data: null }, { data: null }, { data: null }, { data: null }];

  /* ---- derived values ---- */
  const scoreDetails =
    latestScore?.details_json && typeof latestScore.details_json === "object"
      ? (latestScore.details_json as {
          total_results?: number;
          brand_mentioned_count?: number;
          brand_position?: BrandPositionDetails;
          geo_score?: GeoScoreDetails;
        })
      : {};
  const totalResults = n(scoreDetails.total_results ?? latestCompletedRun?.successful_prompts);
  const brandMentions = n(
    scoreDetails.brand_mentioned_count ??
      allPromptResults?.filter((r) => r.brand_mentioned).length
  );
  const visibilityScore = n(latestScore?.visibility_score);
  const citationScore = n(latestScore?.citation_score);
  const competitorPressureScore = n(latestScore?.competitor_gap_score);
  const runConfidence = latestScore?.confidence ?? "low";

  /* ---- composite GEO score (ADR 0008) ---- */
  const geoScore = scoreDetails.geo_score;
  // Fallback to legacy visibility_score for runs scored before geo-score-v1
  // existed (no backfill, per ADR 0008).
  const gaugeScore = Math.round(geoScore?.score ?? visibilityScore);
  const geoScoreLowConfidence = Boolean(geoScore) && geoScore?.confidence !== "high";
  const prominenceComponent = geoScore?.components?.prominence;
  const prominenceUnavailable = Boolean(geoScore) && (prominenceComponent?.value === null || prominenceComponent?.value === undefined);

  const computedMentionRate = allPromptResults?.length
    ? Math.round((allPromptResults.filter((r) => r.brand_mentioned).length / allPromptResults.length) * 100)
    : Math.round((totalResults > 0 ? (brandMentions / totalResults) * 100 : visibilityScore));

  const computedCitationRate = allPromptResults?.length
    ? Math.round((allPromptResults.filter((r) => r.citation_found).length / allPromptResults.length) * 100)
    : citationScore;

  /* ---- distribución por motor de IA: mention rate real de cada engine activo ---- */
  const engineDistribution = (() => {
    const byProvider = new Map<string, { total: number; mentioned: number }>();
    for (const r of allPromptResults ?? []) {
      const provider = (r.provider as string | null) ?? "gemini";
      const entry = byProvider.get(provider) ?? { total: 0, mentioned: 0 };
      entry.total += 1;
      if (r.brand_mentioned) entry.mentioned += 1;
      byProvider.set(provider, entry);
    }
    return Array.from(byProvider.entries())
      .map(([provider, { total, mentioned }]) => ({
        provider,
        label: ENGINE_LABELS[provider]?.label ?? provider,
        color: ENGINE_LABELS[provider]?.color ?? "#9333a8",
        mentionRate: total > 0 ? Math.round((mentioned / total) * 100) : 0
      }))
      .sort((a, b) => b.mentionRate - a.mentionRate);
  })();

  /* ---- citation share (computed at read time — no persisted column) ----
   * own_citation_share = own_citations / total_resolved_citations × 100
   * Only grounding citations with a non-null domain are counted.
   * If total_resolved_citations === 0 → null ("Sin datos").
   */
  const citationShareResult: { share: number | null; ownCitations: number; totalCitations: number } = (() => {
    if (!allPromptResults?.length) return { share: null, ownCitations: 0, totalCitations: 0 };

    const projectDomain = project.domain.replace(/^www\./, "").toLowerCase();

    let totalResolved = 0;
    let ownCitations = 0;

    for (const result of allPromptResults) {
      const ext = parseExt(result.extracted_json);
      for (const cit of ext.citations ?? []) {
        if (cit.source !== "grounding") continue;
        if (!cit.domain) continue;
        totalResolved += 1;
        const citDomain = cit.domain.replace(/^www\./, "").toLowerCase();
        if (citDomain === projectDomain || citDomain.endsWith(`.${projectDomain}`)) {
          ownCitations += 1;
        }
      }
    }

    if (totalResolved === 0) return { share: null, ownCitations: 0, totalCitations: 0 };
    return {
      share: Math.round((ownCitations / totalResolved) * 100),
      ownCitations,
      totalCitations: totalResolved
    };
  })();

  /* ---- trend sparklines ---- */
  const visTrend = (trendHistory ?? []).map((r) => n(r.visibility_score));
  const citTrend = (trendHistory ?? []).map((r) => n(r.citation_score));
  const gapTrend = (trendHistory ?? []).map((r) => n(r.competitor_gap_score));
  const confTrend = (trendHistory ?? []).map(() => confidenceToPercent(runConfidence));

  const prevScore = trendHistory && trendHistory.length >= 2 ? trendHistory[trendHistory.length - 2] : null;
  const visDelta = prevScore ? visibilityScore - n(prevScore.visibility_score) : 0;
  const citDelta = prevScore ? computedCitationRate - n(prevScore.citation_score) : 0;
  const gapDelta = prevScore ? competitorPressureScore - n(prevScore.competitor_gap_score) : 0;

  /* ---- competitor breakdown from extracted_json ---- */
  const competitorMentionCounts: Record<string, number> = {};
  // Keyed by `domain` when known, or by `title`/fallback label when the
  // grounding redirect could not be resolved (see
  // docs/adr/0006-grounding-redirect-resolution.md). Unresolved entries are
  // never grouped under the same key as resolved ones — display falls back
  // to `title`, never the raw Google redirect URL.
  const citedUrlCounts: Record<string, { display: string; domain: string | null; count: number }> = {};

  for (const result of allPromptResults ?? []) {
    const ext = parseExt(result.extracted_json);

    for (const comp of ext.competitors ?? []) {
      if (comp.name && comp.mentioned) {
        const key = comp.name.toLowerCase().trim();
        competitorMentionCounts[key] = (competitorMentionCounts[key] ?? 0) + 1;
      }
    }
    for (const cit of ext.citations ?? []) {
      const domain = cit.domain?.trim() || null;

      if (domain) {
        if (!citedUrlCounts[domain]) citedUrlCounts[domain] = { display: domain, domain, count: 0 };
        citedUrlCounts[domain].count++;
        continue;
      }

      // Unresolved grounding redirect: never display the raw
      // vertexaisearch.cloud.google.com URL. Group by title instead, or a
      // generic label if even the title is missing.
      if (cit.source === "grounding") {
        const label = cit.title?.trim() || "Fuente sin resolver";
        const key = `unresolved:${label.toLowerCase()}`;
        if (!citedUrlCounts[key]) citedUrlCounts[key] = { display: label, domain: null, count: 0 };
        citedUrlCounts[key].count++;
        continue;
      }

      // Inline citations without a domain: fall back to the raw URL as
      // before (these are not grounding redirects).
      const url = cit.url?.trim();
      if (!url) continue;
      if (!citedUrlCounts[url]) citedUrlCounts[url] = { display: url, domain: null, count: 0 };
      citedUrlCounts[url].count++;
    }
  }

  const totalForSov =
    brandMentions +
    (competitors ?? []).reduce((sum, c) => sum + (competitorMentionCounts[c.name.toLowerCase().trim()] ?? 0), 0);

  const competitorRows = (competitors ?? []).map((comp, i) => {
    const key = comp.name.toLowerCase().trim();
    const mentionCount = competitorMentionCounts[key] ?? 0;
    const mentionRate = allPromptResults?.length
      ? Math.round((mentionCount / allPromptResults.length) * 100)
      : 0;
    const sov = totalForSov > 0 ? Math.round((mentionCount / totalForSov) * 100) : 0;
    return {
      name: comp.name,
      domain: comp.domain,
      color: COMPETITOR_COLORS[i % COMPETITOR_COLORS.length],
      initial: comp.name.slice(0, 1).toUpperCase(),
      mentionRate,
      sov,
      isLeader: false
    };
  });

  const brandSov = totalForSov > 0 ? Math.round((brandMentions / totalForSov) * 100) : 0;
  const maxMentionRate = Math.max(computedMentionRate, ...competitorRows.map((c) => c.mentionRate));

  const citedPages = Object.values(citedUrlCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((p) => ({
      ...p,
      isYours: Boolean(
        p.domain && p.domain.replace(/^www\./, "").includes(project.domain.replace(/^www\./, ""))
      )
    }));

  const hasData = Boolean(latestCompletedRun && latestScore);

  /* ---- brand position (Phase A) ---- */
  const brandPosition = scoreDetails.brand_position;
  const brandPositionPromptsWithData = n(brandPosition?.prompts_with_position_data);
  const brandPositionAvailable = Boolean(brandPosition) && brandPositionPromptsWithData > 0;
  const brandPositionRanking = [...(brandPosition?.ranking ?? [])].sort(
    (a, b) => n(a.avg_position) - n(b.avg_position)
  );
  const brandPositionLowConfidence = brandPositionPromptsWithData > 0 && brandPositionPromptsWithData <= 2;
  const ownBrandPosition = brandPositionRanking.find((e) => e.is_brand);

  const topCompetitor = competitorRows.sort((a, b) => b.mentionRate - a.mentionRate)[0];

  /* ---- render ---- */
  return (
    <div className="page">
      {activeRun ? <ScanProgressPoller projectId={projectId} initialRunId={activeRun.id} /> : null}

      {/* Sticky page header */}
      <div className="ov-sticky-header">
        <div className="ov-sticky-left">
          <div>
            <p className="kicker" style={{ marginBottom: 2 }}>Visión general</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 750, color: "var(--ink)", letterSpacing: "-.01em" }}>{project.name}</span>
              <span className="badge badge-neutral" style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{project.domain}</span>
              <span className="meta-pill">{project.country}/{project.language}</span>
            </div>
          </div>
        </div>
        <div className="ov-sticky-right">
          {latestCompletedRun && (
            <span className="badge badge-pos" style={{ fontSize: 11 }}>
              Escaneado {new Date(latestCompletedRun.finished_at ?? latestCompletedRun.created_at)
                .toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid" })}
            </span>
          )}
          {activeRun ? (
            <span className="scan-status">
              <span className="dot run" />
              Escaneo en curso
            </span>
          ) : null}
        </div>
      </div>

      {/* Feedback */}
      {feedbackErrorMessage && (
        <p className="feedback error" style={{ marginBottom: 16 }}>{feedbackErrorMessage}</p>
      )}
      {successMessage && (
        <p className="feedback success" style={{ marginBottom: 16 }}>{successMessage}</p>
      )}
      {latestFailedRun && (
        <div className="feedback" style={{ background: "var(--warn-soft)", color: "var(--warn-ink)", borderColor: "#f3d086", marginBottom: 16 }}>
          <p style={{ fontWeight: 650 }}>
            {latestCompletedRun
              ? "El último escaneo no se pudo completar. Se muestran los últimos resultados completados."
              : "El último escaneo no se pudo completar. Vuelve a intentarlo con el botón de arriba."}
          </p>
        </div>
      )}
      {!prompts?.length && (
        <p className="feedback" style={{ background: "var(--warn-soft)", color: "var(--warn-ink)", borderColor: "#f3d086", marginBottom: 16 }}>
          Añade al menos un prompt activo antes de escanear.{" "}
          <Link href={`/dashboard/projects/${projectId}/prompts`} style={{ fontWeight: 700, textDecoration: "underline" }}>Añadir prompts</Link>
        </p>
      )}

      {/* ===== DATA STATE ===== */}
      {hasData ? (
        <>
          {/* 1 · Executive summary banner */}
          <div className="summary">
            <div className="summary-ico">
              <Icon name="sparkles" size={18} />
            </div>
            <p className="summary-txt">
              <b>{project.brand}</b> aparece en{" "}
              <b>{brandMentions} de {totalResults} prompts</b> analizados.
              {topCompetitor && topCompetitor.mentionRate > computedMentionRate ? (
                <>
                  {" "}Tu competidor más visible,{" "}
                  <b>{topCompetitor.name}</b>, aparece en{" "}
                  <span className="hl-neg">{topCompetitor.mentionRate}% de los prompts</span>.
                </>
              ) : null}
              {latestRecommendations?.length ? (
                <>
                  {" "}Lumira encontró{" "}
                  <b>{latestRecommendations.length} acciones prioritarias</b> para mejorar tu visibilidad.
                </>
              ) : null}
              {completedRunsCount < 2 && (
                <span style={{ color: "var(--ink-4)", fontStyle: "italic", fontSize: 13 }}>
                  {" "}(Muestra inicial — la tendencia estará disponible con ≥2 escaneos.)
                </span>
              )}
            </p>
          </div>

          {/* 2 · Section: Visibilidad de un vistazo */}
          <div className="section-head" style={{ marginTop: 28 }}>
            <div className="section-title">Visibilidad de un vistazo</div>
            <div className="section-desc">
              Señales reales · último escaneo{" "}
              {new Date(latestCompletedRun!.finished_at ?? latestCompletedRun!.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "Europe/Madrid" })}
            </div>
            <div className="right">
              <span className={`badge badge-${getBandTone(gaugeScore)}`}>
                {getBandLabel(gaugeScore)}
              </span>
            </div>
          </div>

          {/* Hero card */}
          <div className="hero-v2">
            {/* Gauge */}
            <div className="hv-gauge">
              <Gauge value={gaugeScore} size={140} stroke={14} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--ink-4)", marginBottom: 6 }}>
                  Puntuación GEO
                </div>
                <span className={`badge badge-${getBandTone(gaugeScore)}`}>
                  {getBandLabel(gaugeScore)}
                </span>
                {geoScoreLowConfidence && (
                  <div style={{ marginTop: 8 }}>
                    <span className="badge badge-warn" style={{ fontSize: 10.5 }}>
                      {prominenceUnavailable
                        ? "Confianza media: posición no disponible para este escaneo"
                        : `Confianza ${confidenceLabels[geoScore?.confidence ?? "medium"] ?? geoScore?.confidence}`}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="hv-divider" />

            {/* Composition */}
            <div className="hv-compose">
              <div className="hv-block-label">Cómo se compone tu puntuación</div>
              {geoScore?.components ? (
                [
                  { l: "Presencia (mención)", c: geoScore.components.presence, color: "var(--accent)" },
                  { l: "Prominencia (posición)", c: geoScore.components.prominence, color: "#7c3aed" },
                  { l: "Posición competitiva", c: geoScore.components.standing, color: "#0d9488" },
                  { l: "Autoridad (citas)", c: geoScore.components.authority, color: "#e54563" }
                ].map((row) => {
                  const unavailable = row.c?.value === null || row.c?.value === undefined;
                  const v = Math.min(100, Math.round(n(row.c?.value)));
                  return (
                    <div className="compose-row" key={row.l}>
                      <div className="compose-top">
                        <span className="compose-l">{row.l}</span>
                        <span className="compose-v tnum">
                          {unavailable ? "—" : `${v}%`}
                        </span>
                      </div>
                      {unavailable ? (
                        <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2 }}>
                          No disponible para este escaneo
                        </div>
                      ) : (
                        <div className="sov-bar" style={{ height: 7 }}>
                          <div className="sov-fill" style={{ width: `${v}%`, background: row.color }} />
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                [
                  { l: "Tasa de mención", v: computedMentionRate, color: "var(--accent)" },
                  { l: "Tasa de cita", v: computedCitationRate, color: "#7c3aed" },
                  { l: "Presión competitiva", v: Math.min(100, competitorPressureScore), color: "#0d9488" }
                ].map((c) => (
                  <div className="compose-row" key={c.l}>
                    <div className="compose-top">
                      <span className="compose-l">{c.l}</span>
                      <span className="compose-v tnum">{c.v}%</span>
                    </div>
                    <div className="sov-bar" style={{ height: 7 }}>
                      <div className="sov-fill" style={{ width: `${Math.min(100, c.v)}%`, background: c.color }} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 3 · 4 wide metric cards */}
          <div className="metrics-2col" style={{ marginTop: 12 }}>
            {[
              {
                key: "mention",
                label: "Tasa de mención",
                value: computedMentionRate,
                unit: "%",
                trend: visTrend,
                delta: visDelta,
                color: "var(--accent)",
                hint: "Prompts donde aparece tu marca.",
                tip: "Porcentaje de prompts en los que tu marca aparece mencionada en la respuesta de la IA, sobre el total de prompts del escaneo.",
                isShare: false as const
              },
              {
                key: "citation-share",
                label: "Cuota de Citas",
                value: citationShareResult.share,
                unit: "%",
                trend: [] as number[],
                delta: 0,
                color: "#7c3aed",
                hint: citationShareResult.share !== null
                  ? `${citationShareResult.ownCitations} de ${citationShareResult.totalCitations} citas grounding resueltas apuntan a tu dominio.`
                  : "Sin citas grounding resueltas en este escaneo.",
                tip: "Mide qué porcentaje del total de URLs que la IA cita en sus respuestas pertenecen a tu dominio. Cuanto mayor sea este ratio, más presente está tu contenido como fuente de referencia para la IA.",
                isShare: true as const
              },
              {
                key: "gap",
                label: "Presión competitiva",
                value: competitorPressureScore,
                unit: "%",
                trend: gapTrend,
                delta: gapDelta,
                color: "#e54563",
                hint: "Prompts donde aparece un competidor pero tu marca no.",
                invert: true,
                tip: "Mide en qué porcentaje de tus prompts aparece un competidor pero tu marca no. Cuanto más alto, más te están desplazando tus rivales en las respuestas de la IA.",
                isShare: false as const,
                band: getCompetitivePressureBand(competitorPressureScore)
              },
              {
                key: "confidence",
                label: "Confianza",
                value: confidenceLabels[runConfidence]
                  ? confidenceLabels[runConfidence].charAt(0).toUpperCase() + confidenceLabels[runConfidence].slice(1)
                  : runConfidence,
                unit: "",
                trend: confTrend,
                delta: 0,
                color: "#0d9488",
                hint: "Fiabilidad de la muestra de este escaneo.",
                tip: "Indica cuán fiable es la muestra de este escaneo, según la cobertura de extracción de datos (porcentaje de prompts procesados correctamente). Alta = cobertura completa; media/baja = datos parciales o errores de extracción.",
                isShare: false as const
              }
            ].map((m) => (
              <div key={m.key} className="wide-stat">
                <div className="ws-left">
                  <div className="stat-label">
                    {m.label}
                    <InfoTip text={m.tip} />
                  </div>
                  {m.isShare ? (
                    /* Citation share: special rendering — may be null */
                    m.value !== null ? (
                      <>
                        <div className="stat-value tnum">
                          {m.value}<span className="unit">%</span>
                        </div>
                        <div style={{ marginTop: 4 }}>
                          <span className={`badge ${
                            m.value > 50 ? "badge-pos" :
                            m.value >= 30 ? "badge-accent" :
                            m.value >= 15 ? "badge-neutral" :
                            m.value >= 5  ? "badge-warn" :
                            "badge-neg"
                          }`} style={{ fontSize: 11 }}>
                            {m.value > 50 ? "Muy alto" :
                             m.value >= 30 ? "Alto" :
                             m.value >= 15 ? "Medio" :
                             m.value >= 5  ? "Bajo" :
                             "Muy bajo"}
                          </span>
                        </div>
                        <p style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 6 }}>{m.hint}</p>
                      </>
                    ) : (
                      <>
                        <div className="stat-value tnum" style={{ color: "var(--ink-4)", fontSize: 20 }}>Sin datos</div>
                        <p style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2 }}>{m.hint}</p>
                      </>
                    )
                  ) : (
                    /* Standard metric rendering */
                    <>
                      <div className="stat-value tnum">
                        {m.value}<span className="unit">{m.unit}</span>
                      </div>
                      {"band" in m && m.band ? (
                        <div style={{ marginTop: 4 }}>
                          <span className={`badge badge-${m.band.tone}`} style={{ fontSize: 11 }}>
                            {m.band.label}
                          </span>
                        </div>
                      ) : null}
                      <div className="ws-delta">
                        {m.delta !== 0 ? (
                          <Delta value={m.delta} suffix=" pt" invert={"invert" in m ? m.invert : undefined} />
                        ) : (
                          <span className="delta flat">— sin cambio</span>
                        )}
                        <span className="stat-hint">vs. escaneo anterior</span>
                      </div>
                      <p style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2 }}>{m.hint}</p>
                    </>
                  )}
                </div>
                <div className="ws-spark">
                  {m.trend.length >= 2 ? (
                    <Sparkline data={m.trend} w={160} h={64} color={m.color} />
                  ) : (
                    <div style={{ width: 160, height: 64, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 11, color: "var(--ink-4)" }}>Sin tendencia aún</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* 3c · Posición media de marca */}
          <div className="wide-stat wide-stat--position" style={{ marginTop: 12 }}>
            <div className="ws-left" style={{ width: "100%" }}>
              <div className="stat-label">
                Posición media de marca
                <InfoTip text="Posición media en la que aparece tu marca respecto a los competidores mencionados en las respuestas de la IA, según el orden de aparición (1 = mencionada primero/más prominente). Las marcas no mencionadas en un prompt penalizan con la última posición posible." />
              </div>
              {brandPositionAvailable ? (
                <>
                  <div className="stat-value tnum">
                    {ownBrandPosition ? ownBrandPosition.avg_position?.toFixed(2) : brandPosition?.brand_avg_position?.toFixed(2)}
                    <span className="unit">pos. media</span>
                  </div>
                  <p className="stat-hint" style={{ marginTop: -2 }}>
                    Tu posición media entre las marcas mencionadas en las respuestas de IA.
                  </p>
                  {brandPositionLowConfidence && (
                    <span className="badge badge-warn" style={{ marginTop: 4, width: "fit-content" }}>
                      Pocos datos — basado en {brandPositionPromptsWithData} prompt{brandPositionPromptsWithData === 1 ? "" : "s"}
                    </span>
                  )}
                  <div className="bp-ranking">
                    {brandPositionRanking.map((entry, i) => (
                      <div key={entry.name ?? i} className={`bp-row ${entry.is_brand ? "you" : ""}`}>
                        <span className="bp-rank">{i + 1}</span>
                        <span
                          className="fav"
                          style={{
                            background: entry.is_brand ? "var(--accent)" : COMPETITOR_COLORS[i % COMPETITOR_COLORS.length],
                            width: 22,
                            height: 22,
                            fontSize: 10
                          }}
                        >
                          {(entry.name ?? "?").slice(0, 1).toUpperCase()}
                        </span>
                        <span className="bp-name">
                          {entry.name}
                          {entry.is_brand && <span className="bp-you-tag">Tú</span>}
                        </span>
                        <span className="bp-pos tnum">{n(entry.avg_position).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="section-empty" style={{ padding: "14px 12px", marginTop: 4 }}>
                  <div className="section-empty-desc">
                    Posición media no disponible para este escaneo — disponible a partir del próximo escaneo.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 4 · Dónde estás */}
          <div className="section-head">
            <div className="section-title">Dónde estás</div>
            <div className="section-desc">Cuota de voz en IA en tus prompts monitorizados</div>
          </div>

          <div className="grid-2-1">
            {/* Competitive table */}
            <div className="card">
              <div className="card-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div className="card-title">Panorámica competitiva</div>
                {competitors?.length ? (
                  <span className="badge badge-neutral">{competitors.length} competidores</span>
                ) : null}
              </div>
              {competitorRows.length > 0 ? (
                <div style={{ padding: "4px 6px 6px" }}>
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Marca</th>
                        <th className="num">Mención</th>
                        <th>Cuota de voz en IA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Brand row */}
                      <tr className="you">
                        <td>
                          <div className="ent">
                            <span
                              className="fav"
                              style={{ background: "var(--accent)", fontSize: 11, fontWeight: 800 }}
                            >
                              {project.brand.slice(0, 1).toUpperCase()}
                            </span>
                            <div>
                              <div className="nm">
                                {project.brand}
                                <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 700, marginLeft: 6 }}>Tú</span>
                              </div>
                              <div className="dm">{project.domain}</div>
                            </div>
                          </div>
                        </td>
                        <td className="num">
                          <b className="tnum">{computedMentionRate}%</b>
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div className="sov-bar">
                              <div
                                className="sov-fill"
                                style={{
                                  width: maxMentionRate > 0 ? `${(computedMentionRate / maxMentionRate) * 100}%` : "0%",
                                  background: "var(--accent)"
                                }}
                              />
                            </div>
                            <span className="tnum" style={{ fontSize: 12, fontWeight: 700, width: 32, textAlign: "right" }}>
                              {brandSov}%
                            </span>
                          </div>
                        </td>
                      </tr>
                      {/* Competitor rows */}
                      {competitorRows.map((c) => (
                        <tr key={c.name} className="hoverable">
                          <td>
                            <div className="ent">
                              <span className="fav" style={{ background: c.color }}>
                                {c.initial}
                              </span>
                              <div>
                                <div className="nm">{c.name}</div>
                                <div className="dm">{c.domain}</div>
                              </div>
                            </div>
                          </td>
                          <td className="num">
                            <b className="tnum">{c.mentionRate}%</b>
                          </td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div className="sov-bar">
                                <div
                                  className="sov-fill"
                                  style={{
                                    width: maxMentionRate > 0 ? `${(c.mentionRate / maxMentionRate) * 100}%` : "0%",
                                    background: c.color
                                  }}
                                />
                              </div>
                              <span className="tnum" style={{ fontSize: 12, fontWeight: 700, width: 32, textAlign: "right" }}>
                                {c.sov}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ padding: "16px 18px" }}>
                  <EmptyState
                    title="Sin datos de competidores"
                    description="Añade competidores para ver cómo se compara tu visibilidad en IA."
                  />
                  <Link
                    href={`/dashboard/projects/${projectId}/competitors`}
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 10, fontSize: 13, fontWeight: 650, color: "var(--accent)" }}
                  >
                    Añadir competidores <Icon name="arrRight" size={13} />
                  </Link>
                </div>
              )}
            </div>

            {/* LLM distribution */}
            <div className="card">
              <div className="card-head">
                <div className="card-title">Distribución por motor de IA</div>
                <InfoTip text="Tasa de mención de tu marca en cada motor de IA ejecutado en el último escaneo. Cada motor responde distinto — las brechas de cobertura en uno son una oportunidad." />
              </div>
              {engineDistribution.length > 0 ? (
                <div style={{ padding: "18px" }}>
                  {engineDistribution.map((e) => (
                    <div key={e.provider} style={{ marginBottom: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                        <span style={{ width: 9, height: 9, borderRadius: 3, background: e.color }} />
                        <span style={{ fontSize: 13, fontWeight: 650 }}>{e.label}</span>
                        <span
                          className="tnum"
                          style={{ marginLeft: "auto", fontSize: 12, color: "var(--ink-3)", fontWeight: 600 }}
                        >
                          {e.mentionRate}% mención
                        </span>
                      </div>
                      <div className="sov-bar" style={{ height: 9 }}>
                        <div className="sov-fill" style={{ width: `${e.mentionRate}%`, background: e.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: "24px 18px" }}>
                  <div className="section-empty">
                    <div className="section-empty-title">Sin datos todavía</div>
                    <div className="section-empty-desc">
                      La distribución por motor de IA aparecerá aquí después de completar un escaneo.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 5 · Oportunidades */}
          <div className="section-head">
            <div className="section-title">Oportunidades</div>
            <div className="section-desc">Prompts donde ganan los competidores y puedes mejorar</div>
          </div>

          <div className="grid-2-1">
            {/* Prompt opportunities */}
            <div className="card">
              <div className="card-head">
                <div className="card-title">Oportunidades de prompts</div>
              </div>
              <div style={{ padding: "16px 18px" }}>
                <div className="section-empty">
                  <div className="section-empty-title">Detección de oportunidades en desarrollo</div>
                  <div className="section-empty-desc">
                    Las oportunidades de prompts (prompts donde los competidores ganan y tu marca no aparece) se calcularán automáticamente en la próxima actualización.
                  </div>
                </div>
              </div>
            </div>

            {/* Cited pages */}
            <div className="card">
              <div className="card-head" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div className="card-title">Páginas fuente más citadas</div>
                {citedPages.length > 0 && (
                  <span className="badge badge-neutral">{citedPages.length}</span>
                )}
              </div>
              {citedPages.length > 0 ? (
                <div style={{ padding: "4px 0" }}>
                  {citedPages.map((p, i) => (
                    <div
                      key={p.display}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "11px 18px",
                        borderBottom: i < citedPages.length - 1 ? "1px solid var(--line-soft)" : "none"
                      }}
                    >
                      <span style={{ color: p.isYours ? "var(--accent)" : "var(--ink-4)", flexShrink: 0, display: "flex" }}>
                        <Icon name={p.isYours ? "link" : "globe"} size={14} />
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontFamily: "var(--mono)",
                            fontSize: 11.5,
                            fontWeight: 600,
                            color: p.isYours ? "var(--accent-ink)" : "var(--ink-2)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis"
                          }}
                        >
                          {p.display}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2 }}>
                          citada {p.count} {p.count === 1 ? "vez" : "veces"}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div className="tnum" style={{ fontSize: 15, fontWeight: 750, color: "var(--ink)" }}>{p.count}</div>
                        <div style={{ fontSize: 10, color: "var(--ink-4)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>citas</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: "16px 18px" }}>
                  <div className="section-empty">
                    <div className="section-empty-title">Sin fuentes detectadas</div>
                    <div className="section-empty-desc">
                      Las páginas citadas por los motores de IA aparecerán aquí cuando el escaneo las extraiga.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 6 · Qué hacer primero */}
          <div className="section-head">
            <div className="section-title">Qué hacer primero</div>
            <div className="section-desc">Acciones ordenadas por impacto en la visibilidad en IA</div>
            <div className="right">
              <Link
                href={`/dashboard/projects/${projectId}/recommendations`}
                style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 650, color: "var(--accent)" }}
              >
                Abrir todas las recomendaciones <Icon name="arrRight" size={13} />
              </Link>
            </div>
          </div>

          {latestRecommendations?.length ? (
            <div className="recs-3col">
              {latestRecommendations.map((rec) => {
                const evidence = rec.evidence_json && typeof rec.evidence_json === "object"
                  ? (rec.evidence_json as { why_this_matters?: string })
                  : {};
                const priority = (rec.priority_rank ?? 1) <= 2 ? "high" : (rec.priority_rank ?? 1) <= 4 ? "med" : "low";
                return (
                  <Link
                    key={rec.id}
                    href={`/dashboard/projects/${projectId}/recommendations`}
                    className="rec-card-preview"
                  >
                    <div className="rec-meta">
                      <span className={`rec-rank ${priority}`}>{rec.priority_rank}</span>
                      <span className={`badge badge-${priority === "high" ? "neg" : priority === "med" ? "warn" : "neutral"}`}>
                        Prioridad {priorityLabels[priority] ?? priority}
                      </span>
                      {rec.recommendation_type && (
                        <span className="badge badge-outline">{rec.recommendation_type.replaceAll("_", " ")}</span>
                      )}
                    </div>
                    <div className="rec-title">{rec.title}</div>
                    {evidence.why_this_matters && (
                      <p style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.55, flexGrow: 1 }}>
                        {String(evidence.why_this_matters).slice(0, 140)}{String(evidence.why_this_matters).length > 140 ? "…" : ""}
                      </p>
                    )}
                    <div className="rec-metrics">
                      <div className="rmetric">
                        <div className="l">Impacto</div>
                        <div className="v"><DotMeter n={impactEffortToN(rec.impact ?? "low")} tone="h" /></div>
                      </div>
                      <div className="rmetric">
                        <div className="l">Esfuerzo</div>
                        <div className="v"><DotMeter n={impactEffortToN(rec.effort ?? "low")} tone="m" /></div>
                      </div>
                      <div style={{ marginLeft: "auto", textAlign: "right" }}>
                        <div className="l" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--ink-4)" }}>
                          Confianza
                        </div>
                        <div className="tnum" style={{ fontSize: 13, fontWeight: 750, marginTop: 4 }}>
                          {confidenceToPercent(rec.confidence ?? "low")}%
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="section-empty">
              <div className="section-empty-title">Sin recomendaciones activas</div>
              <div className="section-empty-desc">Las recomendaciones se generan al completar un escaneo con suficiente evidencia.</div>
            </div>
          )}

          {/* Link to scan detail */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
            <Link
              href={`/dashboard/projects/${projectId}/runs/${latestCompletedRun!.id}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, color: "var(--ink-3)", fontWeight: 600 }}
            >
              Ver detalle del escaneo
              <Icon name="arrRight" size={13} />
            </Link>
          </div>
        </>
      ) : (
        /* ===== EMPTY STATE ===== */
        activeRun ? (
          /* Estado A — Escaneo en curso (componente compartido pixel-perfect) */
          <ScanInProgressLive projectId={projectId} initial={activeRun} />
        ) : prompts?.length ? (
          /* Estado B — Listo para lanzar */
          <div style={{ display: "flex", justifyContent: "center", padding: "60px 20px" }}>
            <div style={{
              background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r-xl)",
              padding: "40px 36px", maxWidth: 520, width: "100%", textAlign: "center",
              boxShadow: "var(--sh-2)"
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: "999px", margin: "0 auto 20px",
                background: "var(--accent-soft)", display: "grid", placeItems: "center", color: "var(--accent)"
              }}>
                <Icon name="overview" size={24} />
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 750, color: "var(--ink)", marginBottom: 10, letterSpacing: "-.01em" }}>
                Lanza tu primer escaneo de visibilidad en IA
              </h2>
              <p style={{ fontSize: 14, color: "var(--ink-3)", lineHeight: 1.65, marginBottom: 24 }}>
                Analiza cómo aparece <b style={{ color: "var(--ink-2)" }}>{project.brand}</b> en los motores de IA con tus <b style={{ color: "var(--ink-2)" }}>{prompts.length} prompts</b> activos.
              </p>
              <div style={{ display: "inline-block" }}>
                <ScanTriggerButton projectId={projectId} label="Lanzar escaneo" />
              </div>
              <p style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 14 }}>
                Primer escaneo · {prompts.length} prompts · {getLLMScanProviders().map((p) => ENGINE_LABELS[p]?.label ?? p).join(" y ")}
              </p>
            </div>
          </div>
        ) : (
          /* Estado C — Sin prompts */
          <div style={{ display: "flex", justifyContent: "center", padding: "60px 20px" }}>
            <div style={{
              background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r-xl)",
              padding: "40px 36px", maxWidth: 520, width: "100%", textAlign: "center",
              boxShadow: "var(--sh-2)"
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: "999px", margin: "0 auto 20px",
                background: "var(--surface-sunk)", display: "grid", placeItems: "center", color: "var(--ink-3)"
              }}>
                <Icon name="prompts" size={24} />
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 750, color: "var(--ink)", marginBottom: 10, letterSpacing: "-.01em" }}>
                Configura tus primeros prompts
              </h2>
              <p style={{ fontSize: 14, color: "var(--ink-3)", lineHeight: 1.65, marginBottom: 24 }}>
                Añade entre 5 y 10 preguntas de alta intención que tus potenciales clientes hacen a la IA. Son la base de tu análisis de visibilidad.
              </p>
              <Link href={`/dashboard/projects/${projectId}/prompts`}>
                <Button variant="outline">
                  <Icon name="prompts" size={14} />
                  Ir a Prompts
                </Button>
              </Link>
            </div>
          </div>
        )
      )}

      {/* ===== QUICK LINKS ===== */}
      <div style={{ display: "flex", gap: 16, marginTop: 32, paddingTop: 20, borderTop: "1px solid var(--line-soft)" }}>
        <Link
          href={`/dashboard/projects/${projectId}/prompts`}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, color: "var(--ink-3)", fontWeight: 600 }}
        >
          <Icon name="prompts" size={14} />
          Gestionar prompts ({prompts?.length ?? 0} activos)
        </Link>
        <Link
          href={`/dashboard/projects/${projectId}/competitors`}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, color: "var(--ink-3)", fontWeight: 600 }}
        >
          <Icon name="competitors" size={14} />
          Gestionar competidores ({competitors?.length ?? 0} activos)
        </Link>
        <Link
          href={`/dashboard/projects/${projectId}/runs`}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, color: "var(--ink-3)", fontWeight: 600 }}
        >
          <Icon name="runs" size={14} />
          Ver escaneos ({runs?.length ?? 0})
        </Link>
      </div>
    </div>
  );
}
