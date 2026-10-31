import { isRetiredRecommendationType, overlayForHeadline, recommendationHeadline } from "@/lib/recommendations/headline";
import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { requireActiveProject } from "@/lib/project-workspace";
import { Ic } from "@/components/ins/ic";
import { Motion } from "@/components/ins/kit/motion";
import {
  Breakdown,
  Kpis,
  OvHeader,
  PriorityAlert,
  QuietCard,
  Ranking,
  ScoreHero,
  SentimentBar,
  type BreakdownRow,
  type KpiView,
  type RankRow
} from "@/components/ins/overview/blocks";
import { LiveScanCard } from "@/components/ins/overview/live-scan-card";
import { PlanBlock } from "@/components/ins/overview/plan-block";
import { firstNameFromMetadata, greeting, leadParts, scoreHeadline } from "@/lib/ins/overview-copy";
import { buildOverviewPlan } from "@/lib/ins/overview-plan";
import { AutoExecuteScan } from "@/components/auto-execute-scan";
import { FirstScanTakeover } from "@/components/first-scan-takeover";
import { MEAN_RANK_COLUMN_LABEL } from "@/lib/competitors/mean-rank-copy";
import { ScanTriggerButton } from "@/components/scan-trigger-button";
import { feedbackErrorMessages, feedbackSuccessMessages } from "@/lib/projects/feedback-messages";
import { getEffectiveGeoScore, type ScoreInputRow } from "@/lib/scoring/run-scoring";
import {
  computeMentionInterval,
  hasSufficientSample,
  MIN_RESPONSES_FOR_BAND,
  readComparableRun,
  resolveDelta,
  type DeltaVerdict
} from "@/lib/scoring/score-reliability";
import { computeWindowedScore, computeWindowedSeries, readWindowRun } from "@/lib/scoring/score-window";
import { reconcileStuckScanRuns, scanRunsNeedReconciliation } from "@/lib/scan/scan-runner";
import { getLLMScanProviders } from "@/lib/scan/providers";
import { computeEngineBreakdown } from "@/lib/scan/engine-breakdown";
import { getEngineMeta } from "@/lib/scan/engine-meta";
import { createServiceClient } from "@/lib/supabase/service";
import { computePanoramaState } from "@/lib/competitors/panorama-state";
import { withAnalysisProgress } from "@/lib/scan/active-run-progress";
import { ENABLE_SYNC_SCAN_EXECUTION } from "@/lib/scan/scan-runner";
import { engineCoverageNotice } from "@/lib/scan/engine-coverage";
import { projectScreenMetadata } from "@/lib/seo/console-metadata";
import { blockerDetail, blockerTitle, findCitationBlockers } from "@/lib/recommendations/citation-blockers";
import { isAlreadyCovered } from "@/lib/recommendations/coverage-overlay";
import { loadCoverageOverlays } from "@/lib/recommendations/coverage-overlay-data";
import { readSearchConsoleAvailability } from "@/lib/search-console/load";
import type { BotAccessReport } from "@/lib/web-audit/robots";
import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";
import { buildOverviewSeoSummary } from "@/lib/web-audit/overview-seo-summary";
import { SeoAuditCard } from "./_components/seo-audit-card";
import { AgenticOverviewCard } from "./_components/agentic-overview-card";
import { GscOverviewHalf, GscOverviewHalfSkeleton } from "./_components/gsc-overview-half";
import { resolveCompetitiveClaim } from "@/lib/metrics/competitive-claim";
import { parseEngineCoverage, translateDroppedComponentReason, type GeoScoreEngineCoverage } from "./geo-score-breakdown";
export const maxDuration = 60;

/* ---- constants & helpers ---- */

const COMPETITOR_COLORS = ["#0e9488", "#d9772b", "#9333a8", "#3b6fd6", "#e54563"];


const sentimentLabels: Record<string, string> = {
  positive: "positivo",
  neutral: "neutral",
  negative: "negativo",
  mixed: "mixto",
  unknown: "desconocido"
};


function n(v: unknown): number {
  return Number(v ?? 0);
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
  avg_position_when_mentioned?: number | null;
  mention_rate?: number;
  mention_count?: number;
};

type BrandPositionDetails = {
  prompts_with_position_data?: number;
  total_entities?: number;
  ranking?: BrandPositionEntry[];
  brand_avg_position_when_mentioned?: number | null;
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
    /** Technical readiness of the site (GEO-SCORE-V4, ADR 0033) — web_audit_snapshots.readiness_score, deterministic, no LLM. */
    technical?: GeoScoreComponent;
    authority?: GeoScoreComponent;
  };
  engine_coverage?: GeoScoreEngineCoverage | null;
  formula?: string;
};

function parseExt(raw: unknown): ExtractedJsonPartial {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as ExtractedJsonPartial;
}

/**
 * Same/subdomain match against the project's own domain, mirroring the
 * scoring-side semantics (isSameOrSubdomain, lib/scoring/run-scoring.ts). A
 * plain substring check would also mark third-party domains that merely
 * contain the project domain (e.g. "no-acme.com" vs "acme.com") as the
 * brand's own (docs/geo-methodology-audit-2026-07.md, finding 9).
 */
function isOwnDomain(domain: string | null | undefined, projectDomain: string): boolean {
  if (!domain) return false;
  const d = domain.trim().toLowerCase().replace(/^www\./, "");
  const own = projectDomain.trim().toLowerCase().replace(/^www\./, "");
  if (!d || !own) return false;
  return d === own || d.endsWith(`.${own}`);
}

/* ---- page ---- */

// ROOT-METADATA-1: el dominio va en la pestaña. Sin esto las pantallas de
// consola heredaban `title: "GenScore"` del layout raíz y eran indistinguibles
// entre sí y entre proyectos. `requireActiveProject` está memoizada por
// petición, así que esto no añade ninguna consulta.
/** The page path only: the domain is already in the header (SEARCH-SEO-1). */
function displayPath(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    return url;
  }
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ projectId: string }>;
}): Promise<Metadata> {
  const { projectId } = await params;
  return projectScreenMetadata("Visión general", async () => (await requireActiveProject(projectId)).domain);
}

export default async function ProjectDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { projectId } = await params;
  const feedback = await searchParams;
  const { supabase, user } = await requireUser();

  const RUNS_SELECT =
    "id, status, error_summary, total_prompts, successful_prompts, failed_prompts, created_at, started_at, finished_at";

  // The project row, prompts, competitors, and runs are all independent of
  // each other and of reconciliation, so they are fetched in one batch.
  // Reconciliation itself is decided from the already-fetched `runs` below
  // instead of running unconditionally on every render
  // (docs/architecture-audit-2026-07.md, finding 1.3 / PERF-3a).
  const [project, { data: prompts }, { data: competitors }, { data: runsData }] =
    await Promise.all([
      requireActiveProject(projectId),
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
  // ONBOARDING-ROCKET-1: the mission is a first-impression, not a product
  // state — it spends itself once per domain. Zero completed runs is exactly
  // the condition `hasData` already gates the whole empty-state overlay on
  // (see `hasData` below), so this needs no new column: a project's second
  // scan onward always falls straight to `ScanInProgressLive`.
  const isFirstScan = completedRunsCount === 0;
  const latestFailedRun = latestRun?.status === "failed" ? latestRun : null;
  const rawActiveRun = runs?.find((r) => r.status === "pending" || r.status === "running");
  // EXTRACTION-RELIABILITY-1 Fase C: carries the analysis-stage counters, so
  // the progress bar keeps moving once generation is done instead of pinning
  // at 100% while extraction is still working.
  const activeRun = rawActiveRun ? await withAnalysisProgress(supabase, projectId, rawActiveRun) : rawActiveRun;
  const feedbackErrorMessage = feedback.error
    ? feedbackErrorMessages[feedback.error] ?? feedbackErrorMessages.unexpected_error
    : null;
  const rawSuccessMessage = feedback.success ? feedbackSuccessMessages[feedback.success] ?? null : null;
  /**
   * SCAN-STATES-2: `scan_started` is suppressed unconditionally. Its text
   * ("Dominio creado. Tu primer escaneo se está ejecutando — sigue el
   * progreso aquí") is the mission's own rail said twice, stacked above a
   * full-bleed scene as a second surface — exactly the "banner flotando
   * encima" the founder asked to remove (2026-08-10). Every other feedback
   * message still shows: this drops one redundant sentence, not the
   * mechanism.
   *
   * This key is fired ONLY from the first-scan creation redirect
   * (`app/dashboard/projects/actions.ts`), so it is never valid to show as a
   * banner: while the run is active the mission already says it, and once
   * the run finishes the text is simply false. A first attempt gated this on
   * `activeRun`/`isFirstScan` and got the direction backwards — it hid the
   * message after completion but let it show *while the mission itself was
   * on screen*, which is the one moment SCAN-STATES-2 explicitly banned
   * (log §105, corrected same day after the founder caught it live). There
   * is no state in which this key should ever render, so it is suppressed
   * outright rather than gated on a run's transient status.
   */
  const successMessage = rawSuccessMessage && feedback.success !== "scan_started" ? rawSuccessMessage : null;

  /* ---- queries that require a completed run ---- */
  const [
    { data: latestScore },
    { data: allPromptResults },
    { data: activeRecommendationsRaw },
    { data: trendHistoryDesc },
    { data: latestAuditSnapshot }
  ] =
    latestCompletedRun
      ? await Promise.all([
          supabase
            .from("run_scores")
            .select("visibility_score, citation_score, competitor_gap_score, confidence, details_json")
            .eq("project_id", projectId)
            .eq("run_id", latestCompletedRun.id)
            .maybeSingle(),
          supabase
            .from("scan_prompt_results")
            .select(
              "id, prompt_id, prompt_text_snapshot, brand_mentioned, citation_found, sentiment, extracted_json, provider, mentioned_competitors_count, citations_count, extraction_error, brand_snapshot, extraction_version"
            )
            .eq("project_id", projectId)
            .eq("run_id", latestCompletedRun.id)
            .eq("status", "completed"),
          // No .limit(3) here: the plan's joint "potential points" ceiling
          // (RECS-POTENTIAL-1) needs EVERY active recommendation's
          // affected_prompt_ids, not just the ones shown — otherwise the
          // aggregate would silently ignore whatever's ranked 4th and beyond.
          supabase
            .from("recommendations")
            .select("id, priority_rank, title, impact, effort, confidence, recommendation_type, evidence_json")
            .eq("project_id", projectId)
            .eq("run_id", latestCompletedRun.id)
            .eq("status", "active")
            .order("priority_rank", { ascending: true }),
          supabase
            .from("run_scores")
            .select("run_id, visibility_score, citation_score, competitor_gap_score, created_at, details_json")
            .eq("project_id", projectId)
            .order("created_at", { ascending: false })
            .limit(7),
          // SEARCH-SEO-1 Fase 1 (log §271): the same snapshot Recomendaciones
          // reads for its citation blockers, so both screens name the same
          // blockers from the same data.
          supabase
            .from("web_audit_snapshots")
            .select("bots, pages, created_at")
            .eq("project_id", projectId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        ])
      : [{ data: null }, { data: null }, { data: null }, { data: null }, { data: null }];

  // A blocker makes every citation impossible, so it outranks everything else
  // on this screen. Only blockers, never the softer SEO checks: speed or
  // titles matter for Google but do not decide whether an AI names the brand.
  const auditSnapshotForBlockers = latestAuditSnapshot as {
    bots: BotAccessReport | null;
    pages: PageAuditEntry[] | null;
    created_at: string | null;
  } | null;
  const citationBlockers = findCitationBlockers({
    bots: auditSnapshotForBlockers?.bots ?? null,
    pages: auditSnapshotForBlockers?.pages ?? null
  });

  // Auditoría SEO card (log §271): the same snapshot, through the same
  // aggregation as the Auditoría SEO screen.
  const seoSummary = buildOverviewSeoSummary(auditSnapshotForBlockers);
  const seoAuditedAt = auditSnapshotForBlockers?.created_at
    ? new Date(auditSnapshotForBlockers.created_at).toLocaleDateString("es-ES", {
        day: "numeric",
        month: "short",
        timeZone: "Europe/Madrid"
      })
    : null;

  // RECS-ALREADY-DONE-1 (log §339): what Recomendaciones shows under
  // «Resueltas» because its page already exists is not an opportunity here.
  const coverageOverlays = activeRecommendationsRaw
    ? await loadCoverageOverlays(supabase, {
        projectId,
        runId: latestCompletedRun?.id ?? null,
        projectDomain: project.domain,
        recs: activeRecommendationsRaw
      })
    : null;
  // RECS-HEADLINES-1 (log §354): retired types have no task to offer.
  const activeRecommendations = activeRecommendationsRaw
    ? activeRecommendationsRaw.filter(
        (r) =>
          !isRetiredRecommendationType(r.recommendation_type) &&
          !isAlreadyCovered(r.recommendation_type, coverageOverlays?.get(r.id))
      )
    : null;

  // The trend window is the LAST 7 scored runs; the query fetches them
  // newest-first (descending + limit) and this reversal restores chronological
  // order for sparklines and "vs. previous scan" deltas. Ascending + limit
  // would instead pin the window to the project's 7 OLDEST runs forever
  // (docs/geo-methodology-audit-2026-07.md, finding 1).
  const trendHistory = [...(trendHistoryDesc ?? [])].reverse();

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

  /* ---- composite GEO score (ADR 0008) ---- */
  const geoScore = scoreDetails.geo_score;
  // Fallback to legacy visibility_score for runs scored before geo-score-v1
  // existed (no backfill, per ADR 0008).
  /** This scan's own composite — kept as the detail figure under the gauge. */
  const perRunScore = Math.round(geoScore?.score ?? visibilityScore);

  const computedMentionRate = allPromptResults?.length
    ? Math.round((allPromptResults.filter((r) => r.brand_mentioned).length / allPromptResults.length) * 100)
    : Math.round((totalResults > 0 ? (brandMentions / totalResults) * 100 : visibilityScore));

  /* ---- distribución por motor de IA: vista comparativa real por motor ----
   * (ENGINES-VALUE-1) mention, citación y sentimiento por motor, computados
   * en tiempo de lectura sobre las mismas filas de scan_prompt_results que
   * ya trae esta página — cero queries nuevas.
   */
  const { engines: engineBreakdown } = computeEngineBreakdown(allPromptResults ?? []);

  /* ---- citation share (computed at read time — no persisted column) ----
   * own_citation_share = own_citations / total_resolved_citations × 100
   * Only grounding citations with a non-null domain are counted.
   * If total_resolved_citations === 0 → null ("Sin datos").
   */
  const citationShareResult: { share: number | null; ownCitations: number; totalCitations: number } = (() => {
    if (!allPromptResults?.length) return { share: null, ownCitations: 0, totalCitations: 0 };

    let totalResolved = 0;
    let ownCitations = 0;

    for (const result of allPromptResults) {
      const ext = parseExt(result.extracted_json);
      for (const cit of ext.citations ?? []) {
        if (cit.source !== "grounding") continue;
        if (!cit.domain) continue;
        totalResolved += 1;
        if (isOwnDomain(cit.domain, project.domain)) {
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

  // GEO Score history for the gauge (audit phase B, finding 10). Pre-composite
  // runs fall back to visibility_score inside getEffectiveGeoScore — the same
  // fallback the gauge itself applies (ADR 0008, no backfill).
  const perRunTrend = trendHistory.map((r) => Math.round(getEffectiveGeoScore(r)));

  /* ---- SCORE-WINDOW-1 — the headline is a window, not one scan ----------
   *
   * The engines run live retrieval, and `temperature: 0` does not control
   * what Google Search or web_search return on any given call, so two
   * identical scans genuinely see a different internet. That residual
   * variance is the one Fases A–C could not remove
   * (docs/geo-score-variability-2026-08.md §2), and the only honest
   * instrument against per-observation noise is to stop treating one
   * observation as the answer.
   *
   * `computeWindowedScore` refuses to mix runs that `compareRuns` would
   * refuse to compare, so when it publishes nothing we fall back to the
   * latest run's own score — never to a median of incomparable things.
   */
  const windowRuns = trendHistory
    .map((r) => readWindowRun(r as { run_id?: string | null; created_at?: string | null; details_json?: unknown }))
    .filter((r): r is NonNullable<typeof r> => r !== null);
  const scoreWindow = computeWindowedScore(windowRuns);
  const windowPublished = scoreWindow.verdict === "published" && scoreWindow.value !== null;

  /** The number the gauge shows: the window when it exists, the run otherwise. */
  const gaugeScore = windowPublished ? Math.round(scoreWindow.value as number) : perRunScore;

  // The sparkline must plot the same quantity as the gauge above it, or the
  // two read as different metrics and the user cannot tell which the headline
  // belongs to. Gaps (null) stay gaps — never zeroes.
  const windowedSeries = computeWindowedSeries(windowRuns);
  const geoTrend = windowPublished
    ? windowedSeries.filter((v): v is number => v !== null).map((v) => Math.round(v))
    : perRunTrend;

  const prevScore = trendHistory.length >= 2 ? trendHistory[trendHistory.length - 2] : null;
  const visDelta = prevScore ? visibilityScore - n(prevScore.visibility_score) : 0;
  const gapDelta = prevScore ? competitorPressureScore - n(prevScore.competitor_gap_score) : 0;

  // Window-over-window, not window-minus-run: subtracting last scan's raw
  // score from this window's median would compare two different quantities
  // and call the difference a change.
  const previousWindow = computeWindowedScore(windowRuns.slice(0, -1));
  const gaugeDelta = windowPublished
    ? previousWindow.verdict === "published" && previousWindow.value !== null
      ? Math.round(scoreWindow.value as number) - Math.round(previousWindow.value)
      : 0
    : perRunTrend.length >= 2
      ? gaugeScore - perRunTrend[perRunTrend.length - 2]
      : 0;

  /* ---- GEO-SCORE-RELIABILITY-1 — precision and comparability ----
   * Every "vs. escaneo anterior" number above is a raw subtraction of two
   * persisted rows. Whether it means anything depends on two things the page
   * previously never checked: whether this run carries enough AI responses to
   * support the claim, and whether the two runs measured the same thing at
   * all (same methodology version, same surviving components, same engines,
   * same sample size). `resolveDelta` is the single decision point for both,
   * so the gauge and the KPI cards cannot disagree about what is assertable.
   *
   * When there is no previous run the verdict is null and nothing is
   * rendered — that is the pre-existing "≥2 escaneos" behavior, unchanged.
   */
  const currentRun = readComparableRun(latestScore?.details_json);
  const previousRun = prevScore ? readComparableRun(prevScore.details_json) : null;
  const mentionInterval = computeMentionInterval(brandMentions, totalResults);
  const sampleSufficient = hasSufficientSample(totalResults);
  const resolve = (value: number): DeltaVerdict | null =>
    previousRun ? resolveDelta(value, currentRun, previousRun) : null;
  const gaugeDeltaVerdict = geoTrend.length >= 2 ? resolve(gaugeDelta) : null;
  const visDeltaVerdict = resolve(visDelta);
  const gapDeltaVerdict = resolve(gapDelta);

  /**
   * The ONE line that explains why the band, the delta and the trend are
   * absent — everywhere else the withheld state renders as nothing at all
   * (founder decision, 2026-08-03: four "sin comparación" notices on one
   * screen read as a broken product, not a careful one).
   *
   * Deliberately phrased as what unlocks them, not as what is missing: the
   * user can act on "add prompts or engines", and cannot act on "insufficient
   * sample". Returns null when there is nothing to explain.
   *
   * A non-comparable pair of runs gets no line at all: it is not actionable —
   * the next scan resolves it on its own — and naming it would reintroduce
   * exactly the noise this change removes.
   */
  const sampleNudge = (verdict: DeltaVerdict | null): string | null => {
    if (!verdict || verdict.kind !== "insufficient_sample") return null;
    const missing = MIN_RESPONSES_FOR_BAND - verdict.responses;
    return `Con ${missing} ${missing === 1 ? "respuesta" : "respuestas"} de IA más verás franja y evolución. Añade prompts o motores.`;
  };

  /* ---- sentiment KPI (audit phase B, finding 6) ----
   * Distribution of the sentiment the AI expresses ABOUT THE BRAND in the
   * latest scan, computed only over answers where the brand is actually
   * mentioned (rows without a brand mention carry no brand sentiment).
   * Data already extracted and persisted per prompt; this is display only.
   */
  const sentimentCounts = { positive: 0, neutral: 0, mixed: 0, negative: 0 };
  for (const r of allPromptResults ?? []) {
    if (!r.brand_mentioned) continue;
    const s = r.sentiment as keyof typeof sentimentCounts;
    if (s in sentimentCounts) sentimentCounts[s] += 1;
  }
  const sentimentTotal =
    sentimentCounts.positive + sentimentCounts.neutral + sentimentCounts.mixed + sentimentCounts.negative;
  // With the sentiment KPI withheld the desktop KPI grid has three cards and
  // an empty fourth cell. From 1200px the engine bars fill it and the
  // Auditoría SEO card takes their place beside the breakdown (founder,
  // 2026-10-10, log §271). Without an audit the engines stay put, so the
  // breakdown never loses its right-hand column.
  const enginesInKpiGrid = seoSummary !== null && !hasSufficientSample(sentimentTotal);
  const dominantSentiment =
    sentimentTotal > 0
      ? (Object.entries(sentimentCounts).sort((a, b) => b[1] - a[1])[0][0] as keyof typeof sentimentCounts)
      : null;
  const sentimentBreakdown = [
    sentimentCounts.positive > 0 ? `${sentimentCounts.positive} positivas` : null,
    sentimentCounts.neutral > 0 ? `${sentimentCounts.neutral} neutras` : null,
    sentimentCounts.mixed > 0 ? `${sentimentCounts.mixed} mixtas` : null,
    sentimentCounts.negative > 0 ? `${sentimentCounts.negative} negativas` : null
  ]
    .filter(Boolean)
    .join(" · ");

  /* ---- competitor breakdown from extracted_json ---- */
  const competitorMentionCounts: Record<string, number> = {};

  for (const result of allPromptResults ?? []) {
    const ext = parseExt(result.extracted_json);

    for (const comp of ext.competitors ?? []) {
      if (comp.name && comp.mentioned) {
        const key = comp.name.toLowerCase().trim();
        competitorMentionCounts[key] = (competitorMentionCounts[key] ?? 0) + 1;
      }
    }
  }

  /* Mention rate — the share of THIS scan's answers that named the entity.
     Share of voice (mentions ÷ all tracked mentions) used to be computed here
     too and published by the panorama; it left the Overview with
     PANORAMA-PARITY-1 because the same brand read 37% here and 48% on
     Competidores under what looked like the same question. SoV still exists
     and is still shown — on the Competidores podium, where it is labelled as
     itself and computed over every completed scan. */
  const competitorRows = (competitors ?? []).map((comp, i) => {
    const key = comp.name.toLowerCase().trim();
    const mentionCount = competitorMentionCounts[key] ?? 0;
    const mentionRate = allPromptResults?.length
      ? Math.round((mentionCount / allPromptResults.length) * 100)
      : 0;
    return {
      name: comp.name,
      domain: comp.domain,
      color: COMPETITOR_COLORS[i % COMPETITOR_COLORS.length],
      initial: comp.name.slice(0, 1).toUpperCase(),
      mentionRate,
      isLeader: false
    };
  });

  const hasData = Boolean(latestCompletedRun && latestScore);

  // The mission (ScanMissionRocket, mounted via FirstScanTakeover below) is a
  // full-bleed, edge-to-edge scene — `.mrk-full`'s own negative top margin
  // already assumes it sits flush against `.page`'s top padding, sticky
  // header or not. Keeping `.ov-sticky-header` mounted alongside it just
  // stacks a second chrome band above a screen that is supposed to read as
  // full screen (founder, 2026-08-25). The condition mirrors exactly when
  // `FirstScanTakeover` renders below: `!hasData` (no completed run yet) with
  // an active run that is this project's first.
  const showMissionTakeover = !hasData && Boolean(activeRun) && isFirstScan;

  /* ---- brand position (Phase A) ---- */
  const brandPosition = scoreDetails.brand_position;
  const brandPositionPromptsWithData = n(brandPosition?.prompts_with_position_data);
  const brandPositionAvailable = Boolean(brandPosition) && brandPositionPromptsWithData > 0;
  // Ordered by rank WHEN MENTIONED, best first; entities the AI never named
  // have no rank at all and sort last rather than being given a fabricated
  // one (geo-score-v3 — see docs/adr/0026). Missing and null both mean "no
  // rank" and are collapsed in one tested place, because readers disagreeing
  // about which was which is what put a numeric rank badge beside a "—"
  // position on the same row.

  const topCompetitor = competitorRows.sort((a, b) => b.mentionRate - a.mentionRate)[0];

  // GS-02 (log §278): leadership is a comparison and is only claimed when
  // there is a competitor, the brand is ahead of it, and the sample holds.
  const competitiveClaim = resolveCompetitiveClaim({
    brandRate: computedMentionRate,
    competitors: competitorRows,
    citationScore,
    sampleSufficient
  });

  /* ---- unified competitive panorama (PANORAMA-PARITY-1, PANORAMA-EMPTY-1) ----
   * Merges the two previously-separate real sections (brand position ranking +
   * competitor table) into one list, per founder request (Task Intake
   * 2026-07-23).
   *
   * The ranking and the state it implies are NOT decided here: they come from
   * `computePanoramaState` (lib/competitors/panorama-state.ts), which the
   * module header explains at length — four real states (empty / unranked /
   * ranked-in-top-5 / ranked-beyond-top-5-or-unmentioned), not the one this
   * block used to assume. It calls `rankLatestPositions`, the same ordering
   * the Competidores page uses: until 2026-08-06 each screen ordered the
   * persisted ranking for itself and disagreed on ties (PANORAMA-PARITY-1).
   *
   * Both screens publish the SAME figure per row: the mention rate of this
   * scan, not cumulative share of voice (which is still real, still shown —
   * on the Competidores podium, labelled as itself).
   */
  const panoramaState = computePanoramaState({
    entities: [
      { key: "brand", name: project.brand, domain: project.domain, isBrand: true, fallbackMentionRate: computedMentionRate },
      ...competitorRows.map((c) => ({
        key: c.name,
        name: c.name,
        domain: c.domain,
        isBrand: false,
        fallbackMentionRate: c.mentionRate
      }))
    ],
    ranking: brandPosition?.ranking,
    hasPositionData: brandPositionAvailable
  });

  const panoramaListRows = panoramaState.kind === "ranked" ? panoramaState.listRows : panoramaState.kind === "unranked" ? panoramaState.rows : [];
  const maxPanoramaMention = Math.max(1, ...panoramaListRows.map((r) => r.mentionRate ?? 0));
  const panoramaRanked = panoramaState.kind === "ranked";
  const brandMeanPosition = panoramaState.kind === "ranked" ? panoramaState.brandPosition : null;
  const brandAppendedBeyondTop5 = panoramaState.kind === "ranked" && panoramaState.brandAppended;

  const categoryByPromptId = new Map((prompts ?? []).map((p) => [p.id, p.category as string | null]));
  const categoryByResultId = new Map<string, string | null>(
    (allPromptResults ?? []).map((r) => [r.id, r.prompt_id ? (categoryByPromptId.get(r.prompt_id) ?? null) : null])
  );

  // The scan's rows in the shape the potential-points counterfactual reads
  // (RECS-POTENTIAL-1, docs/adr/0017).
  const scoreInputRows: ScoreInputRow[] = (allPromptResults ?? []).map((r) => ({
    id: r.id,
    prompt_text_snapshot: r.prompt_text_snapshot,
    brand_mentioned: r.brand_mentioned,
    citation_found: r.citation_found,
    mentioned_competitors_count: r.mentioned_competitors_count ?? 0,
    citations_count: r.citations_count ?? 0,
    sentiment: r.sentiment,
    extracted_json: r.extracted_json,
    extraction_error: r.extraction_error,
    brand_snapshot: r.brand_snapshot,
    provider: r.provider,
    extraction_version: r.extraction_version
  }));

  // «Tu plan de esta semana»: the same actions, order and ceiling as
  // Recomendaciones (log §352).
  const overviewPlan = buildOverviewPlan({
    recs: activeRecommendations ?? [],
    categoryByResultId,
    scoreRows: scoreInputRows,
    domain: project.domain,
    coverageFor: (id) => overlayForHeadline(coverageOverlays?.get(id))
  });

  /* ---- «Instrumento» layout (CONSOLE-INSTRUMENTO-1 F3, log §352) ----
   * Every gate above (sample floor, comparable runs, competitive claim,
   * windowed score) is untouched: the blocks below only lay out what those
   * decided to publish. A figure that was withheld before is withheld now. */
  const madridHour = Number(
    new Intl.DateTimeFormat("es-ES", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Madrid" }).format(new Date())
  );
  const shortDate = (iso: string | null | undefined) =>
    iso
      ? new Date(iso)
          .toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "Europe/Madrid" })
          .replace(".", "")
      : "";
  // The sparkline plots the gauge's own quantity, so its dates follow the same
  // filter: window mode drops the gaps, run mode is one point per scan.
  const trendDates = windowPublished
    ? windowRuns.filter((_, i) => windowedSeries[i] !== null).map((r) => shortDate(r.finished_at))
    : trendHistory.map((r) => shortDate(r.created_at));
  const showTrend = geoTrend.length >= 2 && gaugeDeltaVerdict?.kind === "publish" && trendDates.length === geoTrend.length;
  const gaugeDeltaPoints =
    gaugeDeltaVerdict?.kind === "publish" && gaugeDeltaVerdict.value !== 0 ? Math.round(gaugeDeltaVerdict.value) : null;

  const googleAvailability = hasData ? await readSearchConsoleAvailability(projectId, user.id) : "off";
  const googleConnected = googleAvailability === "active";
  const googleColumn = googleAvailability !== "off";
  const googleProps = { projectId, ownerUserId: user.id, domain: project.domain, supabase };

  const providers = engineBreakdown.length > 0 ? engineBreakdown.map((e) => e.provider) : getLLMScanProviders();
  const scanProviders = getLLMScanProviders();
  const lastScanLabel = latestCompletedRun
    ? new Date(latestCompletedRun.finished_at ?? latestCompletedRun.created_at).toLocaleDateString("es-ES", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Europe/Madrid"
      })
    : null;
  void lastScanLabel;

  const deltaBadge = (verdict: DeltaVerdict | null | undefined, invert = false): KpiView["badge"] => {
    if (!verdict || verdict.kind !== "publish" || verdict.value === 0) return null;
    const rounded = Math.round(verdict.value);
    if (rounded === 0) return null;
    const good = invert ? rounded < 0 : rounded > 0;
    return {
      tone: good ? "pos" : "warm",
      text: `${rounded > 0 ? "+" : "−"}${Math.abs(rounded)} pt`,
      arrow: rounded > 0 ? "up" : "down"
    };
  };

  const citationBadge = (share: number): KpiView["badge"] =>
    !sampleSufficient
      ? null
      : share > 50
        ? { tone: "pos", text: "Muy alto" }
        : share >= 30
          ? { tone: "pos", text: "Alto" }
          : share >= 15
            ? { tone: "line", text: "Medio" }
            : share >= 5
              ? { tone: "warm", text: "Bajo" }
              : { tone: "warm", text: "Muy bajo" };

  const pressureBand = sampleSufficient ? getCompetitivePressureBand(competitorPressureScore) : null;
  const pressureBadge: KpiView["badge"] = pressureBand
    ? { tone: pressureBand.tone === "pos" ? "pos" : pressureBand.tone === "accent" ? "line" : "warm", text: pressureBand.label }
    : deltaBadge(gapDeltaVerdict, true);

  const sentimentPct = (() => {
    if (sentimentTotal === 0) return null;
    const positive = Math.round((sentimentCounts.positive / sentimentTotal) * 100);
    const negative = Math.round((sentimentCounts.negative / sentimentTotal) * 100);
    return { positive, negative, neutral: Math.max(0, 100 - positive - negative) };
  })();

  const kpis: KpiView[] = [
    {
      key: "mention",
      label: "Tasa de mención",
      value: computedMentionRate,
      unit: "%",
      badge: deltaBadge(visDeltaVerdict),
      extra:
        mentionInterval && !sampleSufficient ? (
          <div className="ov-note" style={{ marginTop: 10 }}>
            ±{Math.round(mentionInterval.marginPoints)} pt de margen
          </div>
        ) : null
    },
    citationShareResult.share !== null
      ? {
          key: "citation-share",
          label: "Cuota de citas",
          value: citationShareResult.share,
          unit: "%",
          badge: citationBadge(citationShareResult.share)
        }
      : { key: "citation-share", label: "Cuota de citas", value: "Sin datos" },
    {
      key: "gap",
      label: "Presión competitiva",
      value: competitorPressureScore,
      unit: "%",
      badge: pressureBadge
    }
  ];
  if (hasSufficientSample(sentimentTotal) && dominantSentiment && sentimentPct) {
    kpis.push({
      key: "sentiment",
      label: "Sentimiento de marca",
      value: sentimentLabels[dominantSentiment].charAt(0).toUpperCase() + sentimentLabels[dominantSentiment].slice(1),
      extra: <SentimentBar {...sentimentPct} />
    });
  }

  const breakdownCopy: Record<string, { label: string; hint: string }> = {
    presence: { label: "Presencia", hint: "Cuánto te nombra la IA." },
    prominence: { label: "Prominencia", hint: "En qué puesto sales." },
    standing: { label: "Cuota de voz", hint: "Tú frente a tus rivales." },
    authority: { label: "Autoridad", hint: "Cuánto cita tu web." },
    technical: { label: "Diagnóstico técnico", hint: "Salud técnica de tu web." }
  };
  const breakdownRows: BreakdownRow[] = geoScore?.components
    ? (["presence", "prominence", "standing", "authority", "technical"] as const).flatMap((key) => {
        const component = geoScore.components?.[key];
        // A run scored before GEO-SCORE-V4 has no `technical` key at all. The
        // row still renders, says why, and tells what makes it appear (no
        // silent gap, `.claude/rules/scan.md`, «No mute rows»).
        const isLegacyRun = !component && key === "technical";
        if (!component && !isLegacyRun) return [];
        const dropped = isLegacyRun || component?.value === null || component?.value === undefined;
        return [
          {
            key,
            label: breakdownCopy[key].label,
            hint: isLegacyRun
              ? "Se incluirá en tu próximo escaneo."
              : dropped
                ? translateDroppedComponentReason(component?.reason)
                : breakdownCopy[key].hint,
            value: dropped ? null : Math.round(component?.value as number)
          }
        ];
      })
    : [];

  const rankRows: RankRow[] = panoramaListRows.map((r) => ({
    key: r.key,
    name: r.name,
    domain: r.domain,
    isBrand: r.isBrand,
    mentionRate: r.mentionRate,
    position: r.position,
    qualified: r.qualified
  }));

  const leadParts_ = hasData
    ? leadParts({
        mentionRate: computedMentionRate,
        marginPoints: mentionInterval && !sampleSufficient ? mentionInterval.marginPoints : null,
        claim: competitiveClaim,
        // With Google connected the plan takes a Google card in its second
        // slot, so the exact count is only known after Google answers: say
        // nothing rather than a number that may change.
        planCount: googleConnected ? 0 : overviewPlan.rows.length
      })
    : null;

  const feedbackNotes = (
    <>
      {feedbackErrorMessage ? <p className="ov-fb err">{feedbackErrorMessage}</p> : null}
      {successMessage ? <p className="ov-fb ok">{successMessage}</p> : null}
      {latestFailedRun ? (
        <p className="ov-fb">
          {latestCompletedRun
            ? "El último escaneo no se pudo completar. Se muestran los últimos resultados completados."
            : "El último escaneo no se pudo completar. Vuelve a intentarlo con el botón de abajo."}
        </p>
      ) : null}
      {!prompts?.length ? (
        <p className="ov-fb">
          Añade al menos un prompt activo antes de escanear.{" "}
          <Link href={`/dashboard/projects/${projectId}/prompts`}>Añadir prompts</Link>
        </p>
      ) : null}
    </>
  );

  /* ---- render ---- */

  // The first scan of a domain takes the whole screen (ONBOARDING-ROCKET-1).
  // F3b restyles it; until then it keeps its own full-bleed layout.
  if (showMissionTakeover && activeRun) {
    return (
      <div className="page mrk-fill">
        {ENABLE_SYNC_SCAN_EXECUTION ? <AutoExecuteScan projectId={projectId} runId={activeRun.id} /> : null}
        <FirstScanTakeover projectId={projectId} activeRun={activeRun} domain={project.domain} />
      </div>
    );
  }

  const header = (
    <OvHeader
      projectId={projectId}
      greeting={greeting(madridHour, firstNameFromMetadata(user.user_metadata))}
      lead={leadParts_}
      hasReport={Boolean(latestCompletedRun)}
    />
  );

  return (
    <div className="ins">
      <Motion id={`overview:${projectId}`}>
        <div className="page">
          {/* DOMAINS-REDESIGN-1: the invisible driver that executes a pending
              scan's batches. Mounted while the run is `pending` OR `running`:
              a multi-batch campaign flips to `running` after its first batch
              and unmounting then would strand it. AutoExecuteScan guards
              against double-driving across re-renders. */}
          {ENABLE_SYNC_SCAN_EXECUTION && activeRun ? (
            <AutoExecuteScan projectId={projectId} runId={activeRun.id} />
          ) : null}

          {header}
          {feedbackNotes}

          {/* One poller per screen (VERCEL-COST-1): the card owns the refresh
              when the run ends, on a project with data and on one without. */}
          {activeRun ? <LiveScanCard projectId={projectId} initial={activeRun} providers={providers.length > 0 ? providers : scanProviders} /> : null}

          {hasData ? (
            <>
              {/* SEARCH-SEO-1 Fase 1 (log §271): a citation blocker on the site
                  outranks the summary. Same blockers, titles and copy as
                  Recomendaciones, so the two screens never disagree. */}
              {citationBlockers.length > 0 ? (
                <PriorityAlert
                  title={blockerTitle(citationBlockers[0])}
                  detail={`${blockerDetail(citationBlockers[0])}${
                    citationBlockers.length > 1
                      ? ` Y hay ${citationBlockers.length - 1} ${citationBlockers.length - 1 === 1 ? "freno más" : "frenos más"}.`
                      : ""
                  }`}
                  href={`/dashboard/projects/${projectId}/web-audit`}
                />
              ) : null}

              <ScoreHero
                projectId={projectId}
                score={gaugeScore}
                headline={scoreHeadline(computedMentionRate, competitiveClaim)}
                trend={showTrend ? { vals: geoTrend, dates: trendDates } : null}
                nudge={showTrend ? null : sampleNudge(gaugeDeltaVerdict)}
                delta={gaugeDeltaPoints}
                engines={engineBreakdown.map((e) => ({ provider: e.provider, rate: e.mentionRate }))}
              />

              <Kpis items={kpis} />

              {overviewPlan.rows.length > 0 || googleConnected ? (
                <PlanBlock projectId={projectId} plan={overviewPlan} google={googleConnected ? googleProps : null} />
              ) : (
                <section className="sec" aria-label="Tu plan de esta semana">
                  <QuietCard
                    title="Sin acciones pendientes"
                    text="Cuando un escaneo detecte algo que mejorar, tu plan de la semana aparecerá aquí."
                    href={`/dashboard/projects/${projectId}/recommendations`}
                    cta="Ver recomendaciones"
                  />
                </section>
              )}

              {geoScore?.engine_coverage?.status === "partial" ? (
                <p className="ov-fb">{engineCoverageNotice(parseEngineCoverage(geoScore.engine_coverage))}</p>
              ) : null}

              <section className="sec grid57" style={breakdownRows.length === 0 ? { gridTemplateColumns: "1fr" } : undefined}>
                {breakdownRows.length > 0 ? <Breakdown score={gaugeScore} rows={breakdownRows} /> : null}
                {competitorRows.length === 0 ? (
                  <QuietCard
                    title="Sin datos de competidores"
                    text="Añade competidores para ver cómo se compara tu visibilidad en IA."
                    href={`/dashboard/projects/${projectId}/competitors`}
                    cta="Añadir competidores"
                  />
                ) : panoramaState.kind === "empty" ? (
                  <QuietCard
                    title="Ninguna marca apareció en este escaneo"
                    text={`La IA no nombró a ${project.brand} ni a ninguno de tus ${competitorRows.length} ${competitorRows.length === 1 ? "competidor" : "competidores"} en ${totalResults} ${totalResults === 1 ? "respuesta" : "respuestas"}. Puede pasar en un dominio nuevo o con prompts muy genéricos.`}
                    href={`/dashboard/projects/${projectId}/prompts`}
                    cta="Revisar mis prompts"
                  />
                ) : (
                  <Ranking
                    projectId={projectId}
                    rows={rankRows}
                    secondLabel={panoramaRanked ? MEAN_RANK_COLUMN_LABEL : null}
                    gapBeforeLast={brandAppendedBeyondTop5}
                  />
                )}
              </section>

              {/* AGENTIC-COMMERCE-1 Fase 2b (log §340) and SEARCH-SEO-1 (log §271,
                  §284): streamed apart, so neither holds up the page. */}
              <section className="sec grid2 ov-pair">
                <Suspense fallback={null}>
                  <AgenticOverviewCard projectId={projectId} />
                </Suspense>
                {seoSummary ? (
                  <SeoAuditCard
                    summary={seoSummary}
                    auditedAt={seoAuditedAt}
                    href={`/dashboard/projects/${projectId}/web-audit`}
                    googleHref={`/dashboard/projects/${projectId}/search-console`}
                    googleColumn={googleColumn}
                  >
                    {googleColumn ? (
                      <Suspense fallback={<GscOverviewHalfSkeleton />}>
                        <GscOverviewHalf projectId={projectId} ownerUserId={user.id} domain={project.domain} />
                      </Suspense>
                    ) : null}
                  </SeoAuditCard>
                ) : null}
              </section>
            </>
          ) : !activeRun ? (
            prompts?.length ? (
              <div className="card ov-state">
                <h2>Lanza tu primer escaneo de visibilidad en IA</h2>
                <p>
                  Analiza cómo aparece <b>{project.brand}</b> en los motores de IA con tus <b>{prompts.length} {prompts.length === 1 ? "prompt activo" : "prompts activos"}</b>.
                </p>
                <ScanTriggerButton projectId={projectId} label="Lanzar escaneo" ins />
                <p className="ov-note">
                  Primer escaneo · {prompts.length} {prompts.length === 1 ? "prompt" : "prompts"} · {scanProviders.map((p) => getEngineMeta(p).label).join(" y ")}
                </p>
              </div>
            ) : (
              <div className="card ov-state">
                <h2>Configura tus primeros prompts</h2>
                <p>
                  Añade entre 5 y 10 preguntas de alta intención que tus potenciales clientes hacen a la IA. Son la base de tu análisis de visibilidad.
                </p>
                <Link className="btn line" href={`/dashboard/projects/${projectId}/prompts`}>
                  Ir a Prompts
                  <Ic n="arrowr" sm />
                </Link>
              </div>
            )
          ) : null}
        </div>
      </Motion>
    </div>
  );
}
