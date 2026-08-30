import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { requireActiveProject } from "@/lib/project-workspace";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/empty-state";
import { Gauge } from "@/components/ui/gauge";
import { EngineGlyph } from "@/components/ui/engine-glyph";
import { FaviconImg } from "@/components/ui/favicon-img";
import { Sparkline } from "@/components/ui/sparkline";
import { Delta } from "@/components/ui/delta";
import { AutoExecuteScan } from "@/components/auto-execute-scan";
import { ScanInProgressLive } from "@/components/scan-in-progress-live";
import { FirstScanTakeover } from "@/components/first-scan-takeover";
import {
  MEAN_RANK_BRAND_HEADLINE,
  MEAN_RANK_COLUMN_LABEL,
  MEAN_RANK_NOTE
} from "@/lib/competitors/mean-rank-copy";
import { ScanTriggerButton } from "@/components/scan-trigger-button";
import { ScanStatePill } from "@/components/scan-state-pill";
import { feedbackErrorMessages, feedbackSuccessMessages } from "@/lib/projects/feedback-messages";
import {
  computeJointPotentialPoints,
  computeRecommendationPotentialPoints,
  getEffectiveGeoScore,
  isQuantifiableRecommendationType,
  type ScoreInputRow
} from "@/lib/scoring/run-scoring";
import {
  computeMentionInterval,
  hasSufficientSample,
  MIN_RESPONSES_FOR_BAND,
  readComparableRun,
  resolveDelta,
  type DeltaVerdict
} from "@/lib/scoring/score-reliability";
import {
  computeWindowedScore,
  computeWindowedSeries,
  readWindowRun
} from "@/lib/scoring/score-window";
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
import {
  GEO_SCORE_COMPONENT_META,
  parseEngineCoverage,
  translateDroppedComponentReason,
  type GeoScoreEngineCoverage
} from "./geo-score-breakdown";

/**
 * DOMAINS-REDESIGN-1: NOT optional, and not a copy-paste from the page this
 * replaced.
 *
 * `AutoExecuteScan` (mounted below) drives the scan by calling
 * `autoExecutePendingScan`, a Server Action — and Server Actions inherit the
 * `maxDuration` of the page they are invoked from (docs/adr/0003). Overview
 * previously exported none, so it ran on Vercel's default budget. Mounting the
 * driver here without this line would kill every batch window mid-flight, in
 * production only, with no error the user or the logs would attribute to it:
 * the run would simply stop advancing and be failed later by
 * `reconcileStuckScanRuns` as a timeout.
 *
 * 60s matches the window `AUTO_EXECUTE_TIME_BUDGET_MS` (~40s) is sized against.
 */
export const maxDuration = 60;

/* ---- constants & helpers ---- */

const COMPETITOR_COLORS = ["#0e9488", "#d9772b", "#9333a8", "#3b6fd6", "#e54563"];

const statusLabels: Record<string, string> = {
  pending: "pendiente",
  running: "en curso",
  completed: "completado",
  failed: "fallido",
  cancelled: "cancelado"
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
 * Icon/meter colors for the GEO Score breakdown rows — keyed by the same
 * "pos" / "accent" / "warn" tone `getBandTone` already uses for the gauge's
 * own band, so a component scoring e.g. 85 reads with the same color
 * language as the overall score badge instead of inventing a second scale.
 */
const GEO_SCORE_TONE_COLORS: Record<string, { soft: string; ink: string }> = {
  pos: { soft: "var(--pos-soft)", ink: "var(--pos-ink)" },
  accent: { soft: "var(--accent-soft)", ink: "var(--accent-ink)" },
  warn: { soft: "var(--warn-soft)", ink: "var(--warn-ink)" }
};

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

/**
 * Reads the real, already-persisted affected_prompt_ids off a
 * recommendation's evidence_json (buildEvidenceJson,
 * lib/recommendations/recommendation-engine.ts) — the same list RECS-
 * POTENTIAL-1 (docs/adr/0017) recomputes the real score over.
 */
function affectedPromptIds(evidenceJson: unknown): string[] {
  if (!evidenceJson || typeof evidenceJson !== "object") return [];
  const ids = (evidenceJson as Record<string, unknown>).affected_prompt_ids;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

/* ---- page ---- */

// ROOT-METADATA-1: el dominio va en la pestaña. Sin esto las pantallas de
// consola heredaban `title: "GenScore"` del layout raíz y eran indistinguibles
// entre sí y entre proyectos. `requireActiveProject` está memoizada por
// petición, así que esto no añade ninguna consulta.
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
  const { supabase } = await requireUser();

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
  const [{ data: latestScore }, { data: allPromptResults }, { data: activeRecommendations }, { data: trendHistoryDesc }] =
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
              "id, prompt_text_snapshot, brand_mentioned, citation_found, sentiment, extracted_json, provider, mentioned_competitors_count, citations_count, extraction_error, brand_snapshot, extraction_version"
            )
            .eq("project_id", projectId)
            .eq("run_id", latestCompletedRun.id)
            .eq("status", "completed"),
          // No .limit(3) here: the Oportunidades card's joint "potential
          // points" ceiling (RECS-POTENTIAL-1) needs EVERY active
          // recommendation's affected_prompt_ids, not just the top 3 shown
          // as cards — otherwise the aggregate would silently ignore
          // whatever's ranked 4th and beyond. latestRecommendations (the
          // top-3 display slice) and activeRecommendationsCount are both
          // derived from this same array below.
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
            .limit(7)
        ])
      : [{ data: null }, { data: null }, { data: null }, { data: null }];

  const latestRecommendations = activeRecommendations?.slice(0, 3) ?? null;
  const activeRecommendationsCount = activeRecommendations?.length ?? null;

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
  const brandPositionLowConfidence = brandPositionPromptsWithData > 0 && brandPositionPromptsWithData <= 2;

  const topCompetitor = competitorRows.sort((a, b) => b.mentionRate - a.mentionRate)[0];

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
  const brandRank = panoramaState.kind === "ranked" ? panoramaState.brandRank : null;
  const totalRanked = panoramaState.kind === "ranked" ? panoramaState.totalRanked : 0;
  const brandAppendedBeyondTop5 = panoramaState.kind === "ranked" && panoramaState.brandAppended;

  const posbarsData = (() => {
    if (panoramaState.kind !== "ranked") return [];
    // Every ranked row has a position by construction; the guard stays because
    // coercing a missing one to 0 would draw it as the best-placed brand on
    // the chart, the exact inversion of the truth.
    const ranked = panoramaState.topRows.filter(
      (r): r is typeof r & { position: number } => r.position !== null
    );
    if (ranked.length === 0) return [];
    const positions = ranked.map((r) => r.position);
    const maxPos = Math.max(...positions);
    const minPos = Math.min(...positions);
    const range = maxPos - minPos;
    return ranked.map((r) => {
      // Lower rank-when-mentioned (better) → taller bar. Flat range → uniform.
      const height = range > 0 ? 20 + ((maxPos - r.position) / range) * 40 : 40;
      return { name: r.name, isBrand: r.isBrand, height };
    });
  })();

  // Real, honest content for the Oportunidades summary card (Task Intake
  // 2026-07-23, Option A): total active recommendations + how many are
  // high priority.
  const highPriorityCount = (latestRecommendations ?? []).filter(
    (r) => (r.priority_rank ?? 99) <= 2
  ).length;

  /* ---- RECS-POTENTIAL-1: real "potential score points" ----
   * docs/adr/0017-recommendation-potential-points.md. Every number here is
   * a real counterfactual recomputation of the same composite score over
   * the real per-prompt rows of this scan — computeRecommendationPotentialPoints
   * returns null (render a qualitative badge, never a number) for
   * non-quantifiable types, missing evidence, or a low-confidence run.
   */
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

  const potentialPointsByRecId = new Map<string, number | null>();
  for (const rec of latestRecommendations ?? []) {
    const points = computeRecommendationPotentialPoints(
      scoreInputRows,
      project.domain,
      rec.recommendation_type,
      affectedPromptIds(rec.evidence_json)
    );
    potentialPointsByRecId.set(rec.id, points?.deltaPoints ?? null);
  }

  // Joint ceiling over EVERY active recommendation (not just the top 3
  // shown as cards) — summing standalone deltas would double-count any
  // prompt shared by more than one recommendation (docs/adr/0017 §3).
  const jointPotentialPoints = computeJointPotentialPoints(
    scoreInputRows,
    project.domain,
    (activeRecommendations ?? []).map((rec) => ({
      recommendationType: rec.recommendation_type,
      affectedPromptIds: affectedPromptIds(rec.evidence_json)
    }))
  );
  // Rounded for display (the mockup's "+14" is a clean integer, not
  // "+13.87") — a delta that rounds down to 0 isn't worth headlining, so
  // that case falls back to the real recommendation count instead.
  const roundedJointPoints =
    jointPotentialPoints && Math.round(jointPotentialPoints.deltaPoints) > 0
      ? Math.round(jointPotentialPoints.deltaPoints)
      : null;

  /* ---- render ---- */
  return (
    <div className={`page${showMissionTakeover ? " mrk-fill" : ""}`}>
      {/* DOMAINS-REDESIGN-1 — the invisible driver that actually executes a
          pending scan's batches, moved here from the Escaneos page it used to
          be the ONLY mount of. Onboarding now lands on this page, so this is
          where a freshly created project's first run gets driven; leaving it
          behind would have stranded every new customer's first scan in
          `pending` until the cron rescued it.

          Mounted while the run is `pending` OR `running`, not just `pending`:
          a multi-batch campaign (SCAN-CHAIN-1) flips to `running` after its
          first batch, and unmounting then would strand the campaign after
          batch 1. AutoExecuteScan guards against double-driving across
          re-renders. */}
      {ENABLE_SYNC_SCAN_EXECUTION && activeRun ? (
        <AutoExecuteScan projectId={projectId} runId={activeRun.id} />
      ) : null}
      {/* Sticky page header — hidden while the first-scan mission takeover
          (below) owns the screen, so the rocket animation reads as full
          screen instead of sitting under a second chrome band. */}
      {!showMissionTakeover && (
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
            <ScanStatePill
              activeRun={activeRun}
              lastScanLabel={
                latestCompletedRun
                  ? new Date(latestCompletedRun.finished_at ?? latestCompletedRun.created_at)
                      .toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid" })
                  : null
              }
            />
          </div>
        </div>
      )}

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
        <div className="ov2-scope">
          {/* 1 · Executive summary / insight banner */}
          <div className="ov2-insight">
            <div className="ov2-insight-ico">
              <Icon name="sparkles" size={18} />
            </div>
            <p className="ov2-insight-txt">
              {/* "prompts" here counted prompt × engine rows, not prompts: a
                  project with 1 prompt scanned on 3 engines read "3 de 3
                  prompts". The unit is an AI response (GEO-SCORE-RELIABILITY-1).

                  TRUST-METRICS-1 (docs/external-audit-2026-08.md, Fase 1):
                  this sentence used to close with "con una puntuación GEO de
                  {perRunScore}/100" — this scan's own composite, a different
                  number from the windowed gaugeScore the gauge two inches
                  above shows under the same literal label. Caught in review
                  (geo-strategy, Human Gate pass): two "puntuación GEO" on one
                  screen is the audit's P0-01 exactly, just moved from
                  cross-screen to same-screen. The founder's rule is that only
                  the windowed figure may carry that label anywhere — so this
                  sentence stops claiming a score at all; the gauge already
                  states it once, correctly, and doesn't need a second,
                  differently-sourced echo. */}
              GenScore detectó que <b>{project.brand}</b> aparece en{" "}
              <b>{brandMentions} de {totalResults} {totalResults === 1 ? "respuesta" : "respuestas"} de IA</b>{" "}
              ({computedMentionRate}%{mentionInterval && !sampleSufficient ? ` ±${Math.round(mentionInterval.marginPoints)}` : ""}).
              {topCompetitor && topCompetitor.mentionRate > computedMentionRate ? (
                <>
                  {" "}Tu rival más visible,{" "}
                  <b>{topCompetitor.name}</b>, te saca ventaja:{" "}
                  <span className="hl-neg">{topCompetitor.mentionRate}% de presencia</span> frente a
                  tu {computedMentionRate}%.
                </>
              ) : citationScore === 0 ? (
                <>
                  {" "}Tu mayor freno son las citas:{" "}
                  <span className="hl-neg">ninguna de las fuentes que usa la IA es tuya todavía</span>.
                </>
              ) : (
                <>
                  {" "}Hoy mantienes la{" "}
                  <span className="hl-pos">mayor visibilidad</span> frente a tus competidores.
                </>
              )}
              {highPriorityCount > 0 ? (
                <>
                  {" "}GenScore ha priorizado{" "}
                  <b>{highPriorityCount} {highPriorityCount === 1 ? "acción" : "acciones"} de alta prioridad</b>{" "}
                  para mejorar tu presencia en las respuestas de IA.
                </>
              ) : null}
              {completedRunsCount < 2 && (
                <span style={{ color: "var(--ink-4)", fontStyle: "italic", fontSize: 13 }}>
                  {" "}(Muestra inicial — la tendencia estará disponible con ≥2 escaneos.)
                </span>
              )}
            </p>
          </div>

          {/* Hero band (OV-DESKTOP-1): score card + KPI block. `.ov2-hero` is
              `display: contents` below 1200px, so this wrapper has no effect
              on the mobile stacked flow — it only becomes a 2-col grid on
              desktop (app/globals.css). */}
          <div className="ov2-hero">
          {/* 2 · Compact gauge card (score + trend). `.ov2-gauge-block` wraps
              the card together with an external "Puntuación GEO" label so the
              two hero columns share the same section-label pattern and start
              flush at the top on desktop (OV-DESKTOP-2) — below 1200px this
              label stays hidden and the card keeps its original inline one,
              so the mobile/tablet layout is unchanged. */}
          <div className="ov2-gauge-block">
          <div className="ov2-sec-lbl ov2-gauge-sec-lbl">Puntuación GEO</div>
          <div className="ov2-gauge-card">
            <div className="ov2-gauge-ring">
              <Gauge value={gaugeScore} size={96} stroke={10} />
            </div>
            <div className="ov2-gauge-info">
              <div className="ov2-gauge-lbl">Puntuación GEO</div>
              <div className="ov2-gauge-badges">
                {/* The qualitative band asserts where the brand sits on a
                    70/40 scale. Below MIN_RESPONSES_FOR_BAND responses a
                    single AI answer moves the score by more than 7 points, so
                    the band is not a claim the sample can support — the score
                    itself is still shown, only its interpretation is withheld.
                    Withheld means ABSENT, not labelled: a screen carrying four
                    "sin comparación"/"muestra insuficiente" notices reads as
                    broken rather than as careful (founder decision,
                    2026-08-03). The single actionable line under the gauge
                    below is what keeps the absence explainable. */}
                {sampleSufficient ? (
                  <span className={`badge badge-${getBandTone(gaugeScore)}`}>{getBandLabel(gaugeScore)}</span>
                ) : null}
                {gaugeDeltaVerdict?.kind === "publish" && gaugeDeltaVerdict.value !== 0 && (
                  <Delta value={gaugeDeltaVerdict.value} suffix=" pt" />
                )}
              </div>
              {/* The sparkline is the delta in graphical form: a line joining
                  the last N scores asserts a trend between them just as
                  literally as "+44 pt" does. Drawing a rising line directly
                  under the words "sin comparación" would contradict them in
                  the more persuasive medium — the founder's original report
                  was a screenshot of exactly that rise. So the line is
                  withheld under the same condition as the number, and the
                  caption says why instead. */}
              {geoTrend.length >= 2 && gaugeDeltaVerdict?.kind === "publish" ? (
                <>
                  <Sparkline data={geoTrend} w={200} h={30} color="var(--brand-blue)" />
                  <div className="ov2-gauge-trend-cap">Últimos {geoTrend.length} escaneos</div>
                </>
              ) : sampleNudge(gaugeDeltaVerdict) ? (
                <div className="ov2-gauge-trend-cap">{sampleNudge(gaugeDeltaVerdict)}</div>
              ) : geoTrend.length >= 2 ? null : (
                <div className="ov2-gauge-trend-cap">La tendencia estará disponible con ≥2 escaneos.</div>
              )}
            </div>
          </div>
          </div>

          {/* 3 · Indicadores clave — KPI carousel */}
          <div className="ov2-hero-kpis">
          <div className="ov2-sec-lbl">Indicadores clave</div>
          <div className="ov2-kpi-car">
            {[
              {
                key: "mention",
                label: "Tasa de mención",
                value: computedMentionRate,
                unit: "%",
                deltaVerdict: visDeltaVerdict,
                hint: mentionInterval
                  ? `${brandMentions} de ${totalResults} ${totalResults === 1 ? "respuesta" : "respuestas"} de IA · margen ±${Math.round(mentionInterval.marginPoints)} pt (95%).`
                  : "Respuestas de IA donde aparece tu marca.",
                tip: "Porcentaje de respuestas de IA en las que tu marca aparece mencionada, sobre el total de respuestas del escaneo (prompts × motores). El margen es el intervalo de confianza de Wilson al 95%: con pocas respuestas, el valor real puede estar en cualquier punto de ese rango. Se estrecha añadiendo prompts o motores.",
                isShare: false as const
              },
              {
                key: "citation-share",
                label: "Cuota de Citas",
                value: citationShareResult.share,
                unit: "%",
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
                deltaVerdict: gapDeltaVerdict,
                hint: "Respuestas de IA donde aparece un competidor pero tu marca no.",
                invert: true,
                tip: "Mide en qué porcentaje de las respuestas de IA aparece un competidor pero tu marca no. Cuanto más alto, más te están desplazando tus rivales en las respuestas de la IA.",
                isShare: false as const,
                // Same sample gate as the GEO gauge's band: "Presión
                // competitiva: Baja" is a qualitative claim about the market,
                // and over <10 AI responses it rests on one or two answers.
                // Gating one band and not the other would just move the false
                // precision to the card next door. Falls through to the
                // delta verdict below, which renders the honest absence.
                band: sampleSufficient ? getCompetitivePressureBand(competitorPressureScore) : undefined
              },
              {
                // Sentiment replaces the old "Confianza" card (audit phase B,
                // findings 6+7): confidence is a data-quality meta-metric that
                // already surfaces as a badge on the gauge when degraded, while
                // brand sentiment was extracted and persisted but shown nowhere.
                // No fabricated history: sentiment is only computed for the
                // latest run, so no trend line and no "vs. previous" delta.
                key: "sentiment",
                label: "Sentimiento de marca",
                value: dominantSentiment
                  ? sentimentLabels[dominantSentiment].charAt(0).toUpperCase() + sentimentLabels[dominantSentiment].slice(1)
                  : "Sin datos",
                unit: "",
                hint:
                  sentimentTotal > 0
                    ? `${sentimentBreakdown} · sobre ${sentimentTotal} ${sentimentTotal === 1 ? "respuesta" : "respuestas"} con tu marca.`
                    : "Sin respuestas con tu marca mencionada en este escaneo.",
                tip: "Tono con el que las respuestas de IA hablan de tu marca en el último escaneo, calculado solo sobre las respuestas donde tu marca aparece. Se muestra el tono dominante; el desglose completo está debajo.",
                isShare: false as const,
                hideDelta: true as const
              }
            ]
              // A KPI that cannot support its own claim is hidden, not
              // labelled (founder decision, 2026-08-03). "Sentimiento de
              // marca: Positivo" is a qualitative verdict, and it is computed
              // only over answers that actually mention the brand — 2 of them
              // on the run that surfaced this. Left in, it would have been the
              // only card on the screen still asserting something confident
              // while its three siblings withheld.
              .filter((m) => m.key !== "sentiment" || hasSufficientSample(sentimentTotal))
              .map((m) => (
              <div key={m.key} className="ov2-kpi">
                <div className="ov2-kpi-k">{m.label}</div>

                {m.key === "sentiment" ? (
                  <>
                    <div
                      className="ov2-kpi-v txt"
                      style={{
                        color:
                          dominantSentiment === "positive"
                            ? "var(--pos-ink)"
                            : dominantSentiment === "negative"
                              ? "var(--neg-ink)"
                              : "var(--ink-2)"
                      }}
                    >
                      {m.value}
                    </div>
                    {sentimentTotal > 0 && (
                      <>
                        <div className="ov2-senti-bar">
                          {sentimentCounts.positive > 0 && (
                            <i style={{ flexGrow: sentimentCounts.positive, background: "var(--pos)" }} />
                          )}
                          {sentimentCounts.neutral + sentimentCounts.mixed > 0 && (
                            <i style={{ flexGrow: sentimentCounts.neutral + sentimentCounts.mixed, background: "var(--line)" }} />
                          )}
                          {sentimentCounts.negative > 0 && (
                            <i style={{ flexGrow: sentimentCounts.negative, background: "var(--neg)" }} />
                          )}
                        </div>
                        <div className="ov2-senti-cap">
                          {Math.round((sentimentCounts.positive / sentimentTotal) * 100)}% · {sentimentTotal} resp.
                        </div>
                      </>
                    )}
                  </>
                ) : m.isShare ? (
                  m.value !== null ? (
                    <>
                      <div className="ov2-kpi-v">{m.value}<small>%</small></div>
                      <div className="ov2-kpi-foot">
                        {/* Same sample gate as the GEO band and the
                            competitive-pressure band: "Muy bajo" is a
                            qualitative verdict, and over <10 responses it
                            rests on one or two cited pages. Gating three
                            bands on this screen and leaving the fourth would
                            just be arbitrary. */}
                        {/* Hidden, not labelled — same rule as the gauge band. */}
                        {!sampleSufficient ? null : (
                        <span className={`badge ${
                          m.value > 50 ? "badge-pos" :
                          m.value >= 30 ? "badge-accent" :
                          m.value >= 15 ? "badge-neutral" :
                          m.value >= 5  ? "badge-warn" :
                          "badge-neg"
                        }`} style={{ fontSize: 10 }}>
                          {m.value > 50 ? "Muy alto" :
                           m.value >= 30 ? "Alto" :
                           m.value >= 15 ? "Medio" :
                           m.value >= 5  ? "Bajo" :
                           "Muy bajo"}
                        </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="ov2-kpi-v txt" style={{ color: "var(--ink-4)" }}>Sin datos</div>
                  )
                ) : (
                  <>
                    <div className="ov2-kpi-v">{m.value}<small>{m.unit}</small></div>
                    <div className="ov2-kpi-foot">
                      {"band" in m && m.band ? (
                        <span className={`badge badge-${m.band.tone}`} style={{ fontSize: 10 }}>
                          {m.band.label}
                        </span>
                      ) : "hideDelta" in m && m.hideDelta ? null : !("deltaVerdict" in m) || m.deltaVerdict === null ? null : m.deltaVerdict.kind !== "publish" ? (
                        // Withheld -> render NOTHING. Never "— sin cambio",
                        // which would assert measured stability we do not
                        // have; and no "— sin comparación" label either, since
                        // repeating that across every card reads as a broken
                        // screen rather than a careful one (founder decision,
                        // 2026-08-03). The absence is explained once, under
                        // the gauge.
                        null
                      ) : m.deltaVerdict.value !== 0 ? (
                        <Delta value={m.deltaVerdict.value} suffix=" pt" invert={"invert" in m ? m.invert : undefined} />
                      ) : (
                        <span className="delta flat">— sin cambio</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
          </div>
          </div>

          {/* Desglose del GEO Score (GEO-SCORE-V4, ADR 0033 §7) + Posicionamiento
              por motores de IA, side by side (OV-DESKTOP-2). Stated
              obligation, not polish — "wherever the GEO Score is shown, its
              component breakdown must be visible", so "subió porque
              arreglaste la web" and "subió porque las IAs te citan más" son
              distinguibles. `.ov2-score-row` is `display: contents` below
              1200px, so mobile/tablet keep the exact stacked order these two
              sections already had (Posicionamiento immediately followed
              Desglose in the DOM before this change) — only desktop gets the
              2/3 + 1/3 layout. Desglose is only rendered once there is a real
              score to explain; Posicionamiento always renders, same as
              before. */}
          <div className="ov2-score-row">
          <div className="ov2-score-main">
          {geoScore?.components ? (
            <>
              {geoScore.engine_coverage?.status === "partial" ? (
                <div
                  className="feedback"
                  style={{ background: "var(--warn-soft)", color: "var(--warn-ink)", borderColor: "#f3d086", marginTop: 14 }}
                >
                  <p style={{ fontWeight: 650 }}>{engineCoverageNotice(parseEngineCoverage(geoScore.engine_coverage))}</p>
                </div>
              ) : null}

              <div className="ov2-sec-lbl">
                Desglose del GEO Score
                <span style={{ fontWeight: 600, color: "var(--ink-4)", textTransform: "none", letterSpacing: 0 }}>
                  {gaugeScore}/100
                </span>
              </div>
              <div className="card" style={{ padding: "4px 18px" }}>
                {(["presence", "prominence", "standing", "authority", "technical"] as const).map((key) => {
                  const component = geoScore.components?.[key];
                  // A run scored before GEO-SCORE-V4 has no `technical` key at
                  // all — not a null value, the key simply does not exist.
                  // Returning null there made the row VANISH, so the breakdown
                  // silently had four rows on older scans and five on new ones,
                  // with nothing saying why. That is the "no silent gap" failure
                  // this codebase keeps paying for (.claude/rules/scan.md, "No
                  // mute rows"). The row now always renders; a pre-v4 run says
                  // so and tells the user what makes it appear.
                  const isLegacyRun = !component && key === "technical";
                  if (!component && !isLegacyRun) return null;
                  const meta = GEO_SCORE_COMPONENT_META[key];
                  const isDropped = isLegacyRun || component?.value === null || component?.value === undefined;
                  // Same 3-tier tone the gauge's own band uses (getBandTone),
                  // so a component scoring e.g. 85 reads with the same color
                  // language as the overall score badge — never a fourth,
                  // unrelated color scale invented just for this row.
                  const tone = isDropped ? null : GEO_SCORE_TONE_COLORS[getBandTone(component?.value as number)];
                  return (
                    <div key={key} className="ov2-brow">
                      <span
                        className="ov2-brow-ico"
                        style={{ background: tone?.soft ?? "var(--line-soft)", color: tone?.ink ?? "var(--ink-4)" }}
                      >
                        <Icon name={meta.icon} size={16} />
                      </span>
                      <div className="ov2-brow-txt">
                        <div className="ov2-brow-l">{meta.label}</div>
                        <div className="ov2-brow-h">
                          {isLegacyRun
                            ? "Este escaneo es anterior a que la salud técnica entrara en el GEO Score. Se incluirá en tu próximo escaneo."
                            : isDropped
                              ? translateDroppedComponentReason(component?.reason)
                              : meta.hint}
                        </div>
                      </div>
                      <div className="ov2-brow-meter">
                        {isDropped ? (
                          <>
                            <div className="track dashed"><i /></div>
                            <div className="cap"><span className="na">No disponible</span></div>
                          </>
                        ) : (
                          <>
                            <div className="track">
                              <i style={{ width: `${component?.value}%`, background: tone?.ink }} />
                            </div>
                            <div className="cap">
                              <span className="v">
                                {Math.round(component?.value as number)}
                                <small>/100</small>
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>

          ) : null}
          </div>

          <div className="ov2-score-side">
          {/* 4 · Posicionamiento por motores de IA */}
          <div className="ov2-sec-lbl">Posicionamiento por motores de IA</div>
          <div className="card" style={{ padding: 18 }}>
            {engineBreakdown.length > 0 ? (
              engineBreakdown.map((e) => {
                const meta = getEngineMeta(e.provider);
                return (
                  <div key={e.provider} className="ov2-engbar">
                    <span className="nm">
                      <span className="ov2-eng-ico" style={{ color: meta.color }}>
                        <EngineGlyph provider={e.provider} />
                      </span>
                      {meta.label}
                    </span>
                    <div className="track">
                      <i style={{ width: `${e.mentionRate}%`, background: meta.color }} />
                    </div>
                    <span className="v">{e.mentionRate}%</span>
                  </div>
                );
              })
            ) : (
              <div style={{ fontSize: 12.5, color: "var(--ink-4)", textAlign: "center", padding: "6px 0" }}>
                Aparecerá aquí después de completar un escaneo.
              </div>
            )}
          </div>
          </div>
          </div>

          {/* Analysis column + sticky action rail (OV-DESKTOP-1). Same
              `display: contents` default as `.ov2-hero` above — no effect on
              mobile, becomes a 2-col grid with `.ov2-rail` following the
              analysis column on desktop. */}
          <div className="ov2-cols">
          <div className="ov2-main">
          {/* 5 · Panorámica competitiva */}
          <div className="ov2-sec-lbl">
            Panorámica competitiva
            {competitors?.length ? (
              <Link href={`/dashboard/projects/${projectId}/competitors`}>Ver todo</Link>
            ) : null}
          </div>
          {competitorRows.length > 0 ? (
            panoramaState.kind === "empty" ? (
              /* PANORAMA-EMPTY-1. Six rows of "0%" answered a question nobody
                 asked — a live customer's first scan (genscore.es, zero
                 mentions across the board, 2026-08-07) rendered exactly that,
                 with no explanation. Nobody named is real, reportable
                 information; it reads better as a sentence than as a table
                 that happens to be all zeros. */
              <div className="card" style={{ padding: "16px 18px" }}>
                <EmptyState
                  title="Ninguna marca apareció en este escaneo"
                  description={`La IA no nombró a ${project.brand} ni a ninguno de tus ${competitorRows.length} ${competitorRows.length === 1 ? "competidor" : "competidores"} en ${totalResults} ${totalResults === 1 ? "respuesta" : "respuestas"}. Puede pasar en un dominio nuevo o con prompts muy genéricos.`}
                />
                <Link
                  href={`/dashboard/projects/${projectId}/prompts`}
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 10, fontSize: 13, fontWeight: 650, color: "var(--brand-blue)" }}
                >
                  Revisar mis prompts <Icon name="arrRight" size={13} />
                </Link>
              </div>
            ) : (
              <>
                {posbarsData.length > 0 && (
                  <div className="card" style={{ padding: "17px 16px 6px" }}>
                    <div className="ov2-pm-lbl">{MEAN_RANK_BRAND_HEADLINE}</div>
                    <div className="ov2-pm-val">
                      {brandRank !== null ? (
                        <>{brandRank}<small> / {totalRanked}</small></>
                      ) : (
                        // The brand itself was never named this scan, even though
                        // others were — a real state (dormant or newly-tracked
                        // domain next to established competitors), not the "—"
                        // this used to render with the actual reason buried in a
                        // tooltip nobody on mobile ever opens.
                        <span className="ov2-pm-val-text">No apareciste en este escaneo</span>
                      )}
                    </div>
                    {/* The bars are always the real top 5, never padded with the
                        brand's own row — forcing "your" bars to include you when
                        you're 6th is the inversion of what a leaderboard means
                        (founder, 2026-08-07). Labelled so the headline number
                        above (your standing) and the bars below (who's actually
                        top 5) are never read as the same claim. */}
                    <div className="ov2-pm-bars-lbl">Top 5 posiciones</div>
                    <div className="ov2-posbars">
                      {posbarsData.map((b, i) => (
                        <div key={`${b.name}-${i}`} className={`b ${b.isBrand ? "you" : ""}`} style={{ height: b.height }}>
                          <span>{b.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="card" style={{ marginTop: posbarsData.length > 0 ? 11 : 0 }}>
                  {/* One label per column, over the data it names — the rule that
                      the Competidores list arrived at the hard way (log §15): a
                      single heading ends up naming the wrong column the moment
                      the layout changes under it. The panorama had NO headers at
                      all, which is how a share-of-voice percentage passed for the
                      mention rate shown on the other screen. */}
                  {/* MEAN-RANK-READS-TRUE-1 (log §177): misma frase, mismo
                      fichero, que en Competidores. Sólo cuando hay columna de
                      puesto — sin ella no hay nada que explicar, y una nota
                      sobre una columna ausente es ruido. */}
                  {panoramaRanked ? <p className="ov2-cmp-note">{MEAN_RANK_NOTE}</p> : null}
                  <div className="ov2-cmp-hd">
                    <span className="ov2-cmp-hd-nm">Último escaneo</span>
                    <span className="ov2-cmp-sov">Mención</span>
                    {/* No column at all when this scan has no position data,
                        rather than a "Puesto" heading over five dashes: a labelled
                        empty column reads as a broken screen, an absent one reads
                        as what it is (log §15, "ni etiqueta ni tarjeta si no hay
                        nada debajo"). */}
                    {panoramaRanked ? <span className="ov2-cmp-sc">{MEAN_RANK_COLUMN_LABEL}</span> : null}
                  </div>
                  {panoramaListRows.flatMap((row, i) => {
                    const barColor = row.isBrand ? "var(--brand-blue)" : "var(--ink-3)";
                    const nodes = [];
                    // A gap between the top 5 and your own row must LOOK like a
                    // skip, not like a missing row — an unexplained hole at rank
                    // 6 reads as a bug (founder, 2026-08-07).
                    if (brandAppendedBeyondTop5 && i === panoramaListRows.length - 1) {
                      nodes.push(
                        <div className="ov2-cmp-gap" key="gap" aria-hidden="true">
                          <span />
                          <span />
                          <span />
                        </div>
                      );
                    }
                    nodes.push(
                      <div key={row.key} className={`ov2-cmp-row ${row.isBrand ? "you" : ""}`}>
                        {/* 26 px por defecto, 30 px a partir del breakpoint de la
                            columna de análisis (globals.css) — se pide para 30. */}
                        <FaviconImg
                          domain={row.domain}
                          cssSize={30}
                          className="ov2-cmp-fav"
                          fallback={
                            <span className="fav" style={{ background: barColor, width: 26, height: 26, fontSize: 11 }}>
                              {row.name.slice(0, 1).toUpperCase()}
                            </span>
                          }
                        />
                        <div className="ov2-cmp-nm">
                          <div className="t">
                            {row.name}
                            {row.isBrand && <span className="ov2-cmp-tag">Tú</span>}
                            {/* SAMPLE-FLOOR-1: last because its mean rests on
                                too few answers to compare, not because the AI
                                ranked it last. An unexplained demotion is as
                                misleading as the 1º it replaces. */}
                            {!row.qualified && <span className="ov2-cmp-thin">pocas menciones</span>}
                          </div>
                        </div>
                        <div className="ov2-cmp-sov">
                          <div className="track">
                            <i
                              style={{
                                width: `${((row.mentionRate ?? 0) / maxPanoramaMention) * 100}%`,
                                background: barColor
                              }}
                            />
                          </div>
                          <div className="pct">{row.mentionRate !== null ? `${Math.round(row.mentionRate)}%` : "—"}</div>
                        </div>
                        {/* Ordinal, and the heaviest figure of the row: "5º" is a
                            standing, "5" is a bullet, and on the left it gets read
                            as one (log §15, twice). Same shape as Competidores.
                            Absent, not dashed, when the scan has no positions —
                            every row would carry the same "—". */}
                        {row.rank !== null ? (
                          <span className="ov2-cmp-sc">{row.rank}º</span>
                        ) : null}
                      </div>
                    );
                    return nodes;
                  })}
                </div>
              </>
            )
          ) : (
            <div className="card" style={{ padding: "16px 18px" }}>
              <EmptyState
                title="Sin datos de competidores"
                description="Añade competidores para ver cómo se compara tu visibilidad en IA."
              />
              <Link
                href={`/dashboard/projects/${projectId}/competitors`}
                style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 10, fontSize: 13, fontWeight: 650, color: "var(--brand-blue)" }}
              >
                Añadir competidores <Icon name="arrRight" size={13} />
              </Link>
            </div>
          )}
          </div>

          <div className="ov2-rail">
          {/* 6 · Oportunidades — resumen visual de Recomendaciones.
              Cabecera: "hasta +Y pt" real (RECS-POTENTIAL-1, docs/adr/0017)
              cuando hay recomendaciones cuantificables y confianza
              suficiente; si no, cae al conteo real de recomendaciones
              activas — nunca un número inventado. Cada tarjeta muestra su
              propio "hasta +Xpt" cuando es cuantificable, o el impacto
              cualitativo cuando no lo es. */}
          {latestRecommendations?.length ? (
            <>
              <div className="ov2-sec-lbl">
                Oportunidades
                <Link href={`/dashboard/projects/${projectId}/recommendations`}>
                  Ver todo <Icon name="arrRight" size={13} />
                </Link>
              </div>
              <div className="card ov2-opps">
                <div className="ov2-opps-hero">
                  <div className="ov2-opps-gain">
                    {roundedJointPoints !== null ? (
                      <>
                        <div className="ov2-opps-gain-n">+{roundedJointPoints}</div>
                        <div className="ov2-opps-gain-l">Puntos potenciales</div>
                      </>
                    ) : (
                      <>
                        <div className="ov2-opps-gain-n">{activeRecommendationsCount ?? latestRecommendations.length}</div>
                        <div className="ov2-opps-gain-l">
                          {(activeRecommendationsCount ?? latestRecommendations.length) === 1 ? "Recomendación" : "Recomendaciones"}
                        </div>
                      </>
                    )}
                  </div>
                  <div>
                    <div className="ov2-opps-h">
                      {highPriorityCount > 0
                        ? `${highPriorityCount} ${highPriorityCount === 1 ? "acción" : "acciones"} de alta prioridad`
                        : "Acciones priorizadas para ti"}
                    </div>
                    <div className="ov2-opps-s">
                      {roundedJointPoints !== null
                        ? "Techo optimista si resuelves estas acciones — tu próximo escaneo lo confirma."
                        : topCompetitor && topCompetitor.mentionRate > computedMentionRate
                          ? `Ejecútalas para recuperar visibilidad frente a ${topCompetitor.name}.`
                          : "Ordenadas por impacto en tu visibilidad en las respuestas de IA."}
                    </div>
                  </div>
                </div>
                <div className="ov2-opps-list">
                  {latestRecommendations.map((rec) => {
                    const effort = (rec.effort ?? "medium").toLowerCase();
                    const isQuick = effort === "low";
                    const impact = (rec.impact ?? "low").toLowerCase();
                    const impactLabel = impact === "high" ? "Alto" : impact === "medium" || impact === "med" ? "Medio" : "Bajo";
                    const rawPoints = potentialPointsByRecId.get(rec.id);
                    const displayPoints = rawPoints !== null && rawPoints !== undefined ? Math.round(rawPoints) : null;
                    return (
                      <div key={rec.id} className="ov2-opp">
                        <span className="ov2-opp-dot" style={{ background: isQuick ? "var(--pos)" : "var(--brand-neg)" }} />
                        <span className="ov2-opp-t">
                          <span>{rec.title}</span>
                          {isQuick && <span className="ov2-opp-quick">rápida</span>}
                        </span>
                        <span className="ov2-opp-r">
                          {displayPoints !== null && displayPoints > 0 ? (
                            <>
                              <span className="n">+{displayPoints}</span>
                              <span className="u">pt</span>
                            </>
                          ) : (
                            <span className="impact-lbl">Impacto {impactLabel.toLowerCase()}</span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <Link href={`/dashboard/projects/${projectId}/recommendations`} className="ov2-opps-cta">
                  Ver todas las recomendaciones <Icon name="arrRight" size={13} />
                </Link>
              </div>
            </>
          ) : null}
          </div>
          </div>
        </div>
      ) : (
        /* ===== EMPTY STATE ===== */
        activeRun ? (
          isFirstScan ? (
            /* ONBOARDING-ROCKET-1 — spent once per domain; every scan after
               this project's first falls to the plain shared bar below.
               SCAN-STATES-2 routes it through FirstScanTakeover so the rail's
               figures are resolved the same way here as in every section. */
            <FirstScanTakeover projectId={projectId} activeRun={activeRun} domain={project.domain} />
          ) : (
            /* Estado A — Escaneo en curso (componente compartido pixel-perfect) */
            <ScanInProgressLive projectId={projectId} initial={activeRun} />
          )
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
                Primer escaneo · {prompts.length} prompts · {getLLMScanProviders().map((p) => getEngineMeta(p).label).join(" y ")}
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

    </div>
  );
}
