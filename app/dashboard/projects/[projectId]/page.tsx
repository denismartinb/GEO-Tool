import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/empty-state";
import { Gauge } from "@/components/ui/gauge";
import { Sparkline } from "@/components/ui/sparkline";
import { Delta } from "@/components/ui/delta";
import { ScanInProgressLive } from "@/components/scan-in-progress-live";
import { ScanProgressPoller } from "@/components/scan-progress-poller";
import { ScanTriggerButton } from "@/components/scan-trigger-button";
import { feedbackErrorMessages, feedbackSuccessMessages } from "@/lib/projects/feedback-messages";
import {
  computeJointPotentialPoints,
  computeRecommendationPotentialPoints,
  getEffectiveGeoScore,
  isQuantifiableRecommendationType,
  type ScoreInputRow
} from "@/lib/scoring/run-scoring";
import { reconcileStuckScanRuns, scanRunsNeedReconciliation } from "@/lib/scan/scan-runner";
import { getLLMScanProviders } from "@/lib/scan/executor";
import { computeEngineBreakdown } from "@/lib/scan/engine-breakdown";
import { getEngineMeta } from "@/lib/scan/engine-meta";
import { createServiceClient } from "@/lib/supabase/service";

/* ---- constants & helpers ---- */

const COMPETITOR_COLORS = ["#0e9488", "#d9772b", "#9333a8", "#3b6fd6", "#e54563"];

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

/**
 * Real favicon via an external favicon service — pure frontend <img>, no
 * crawler and no new schema (Task Intake, 2026-07-23: founder-approved
 * "recuperando favicons"). Sends the domain to Google on every page load;
 * disclosed in that Task Intake report.
 */
function faviconUrl(domain: string | null | undefined): string | null {
  if (!domain) return null;
  const clean = domain.trim().toLowerCase().replace(/^www\./, "");
  if (!clean) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(clean)}&sz=64`;
}

/**
 * Loose entity-name match key for reconciling a per-scan Gemini extraction
 * name (brand_position.ranking entry.name, echoed back by the model rather
 * than copied verbatim — lib/llm/gemini.ts's extraction prompt names but
 * doesn't force it) against the tracked project_competitors row it refers
 * to. A plain toLowerCase().trim() equality silently drops the match (and
 * with it the row's real, always-present domain — see
 * competitors_domain_len_chk in supabase/migrations/0001_v0_schema.sql) on
 * any accent/punctuation drift between the two, e.g. "IKEA" vs "Ikea" is
 * already handled, but "Lazy Bag®" vs "Lazy Bag" is not.
 */
function normalizeEntityName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Simplified, non-literal glyphs for each engine (Overview "Posicionamiento
 * por motores de IA") — not a pixel copy of any provider's mark, just a
 * recognizable stand-in per engine so the block reads at a glance.
 */
function EngineGlyph({ provider }: { provider: string }) {
  switch (provider) {
    case "gemini":
      return (
        <svg viewBox="0 0 24 24" width="100%" height="100%">
          <defs>
            <linearGradient id="ov2-gem" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#4285F4" />
              <stop offset=".5" stopColor="#9B72CB" />
              <stop offset="1" stopColor="#D96570" />
            </linearGradient>
          </defs>
          <path d="M12 1 Q13 11 23 12 Q13 13 12 23 Q11 13 1 12 Q11 11 12 1 Z" fill="url(#ov2-gem)" />
        </svg>
      );
    case "openai":
      // Six-petal rosette (overlapping circles) — evokes the ChatGPT knot
      // without reproducing the trademarked mark 1:1.
      return (
        <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.3">
          <circle cx="12" cy="7.5" r="4.2" />
          <circle cx="15.9" cy="9.75" r="4.2" />
          <circle cx="15.9" cy="14.25" r="4.2" />
          <circle cx="12" cy="16.5" r="4.2" />
          <circle cx="8.1" cy="14.25" r="4.2" />
          <circle cx="8.1" cy="9.75" r="4.2" />
        </svg>
      );
    case "claude":
      return (
        <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round">
          <path d="M12 2.5v19M2.5 12h19M5.4 5.4l13.2 13.2M18.6 5.4L5.4 18.6" />
        </svg>
      );
    default:
      return null;
  }
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
  const [{ data: project }, { data: prompts }, { data: competitors }, { data: runsData }, { data: everTrackedCompetitors }] =
    await Promise.all([
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
        .order("created_at", { ascending: false }),
      // Active-only `competitors` above correctly scopes the "current
      // tracking" table (SOV totals, mention counts, "Ver todo" link) — but
      // brand_position.ranking (below) is a snapshot frozen at the LATEST
      // completed scan's time, which may name competitors since deactivated
      // if the tracked list changed after that scan ran. This separate,
      // unfiltered read exists ONLY to resolve favicon/SOV for those
      // historical entities in the panorama match (panoramaRows below) —
      // never used for any "active competitor" count or total.
      supabase.from("project_competitors").select("name, domain").eq("project_id", projectId)
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
              "id, prompt_text_snapshot, brand_mentioned, citation_found, sentiment, extracted_json, provider, mentioned_competitors_count, citations_count, extraction_error, brand_snapshot"
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
            .select("visibility_score, citation_score, competitor_gap_score, created_at, details_json")
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
  const gaugeScore = Math.round(geoScore?.score ?? visibilityScore);
  const geoScoreLowConfidence = Boolean(geoScore) && geoScore?.confidence !== "high";
  const prominenceComponent = geoScore?.components?.prominence;
  const prominenceUnavailable = Boolean(geoScore) && (prominenceComponent?.value === null || prominenceComponent?.value === undefined);

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
  const geoTrend = trendHistory.map((r) => Math.round(getEffectiveGeoScore(r)));

  const prevScore = trendHistory.length >= 2 ? trendHistory[trendHistory.length - 2] : null;
  const visDelta = prevScore ? visibilityScore - n(prevScore.visibility_score) : 0;
  const gapDelta = prevScore ? competitorPressureScore - n(prevScore.competitor_gap_score) : 0;
  const gaugeDelta = geoTrend.length >= 2 ? gaugeScore - geoTrend[geoTrend.length - 2] : 0;

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

  // Unfiltered (active + inactive) competitor rows, read-only fallback used
  // solely to resolve a real, already-stored domain for panorama entities
  // that fall outside the current active list — see panoramaRows below.
  const everTrackedCompetitorRows = everTrackedCompetitors ?? [];

  const hasData = Boolean(latestCompletedRun && latestScore);

  /* ---- brand position (Phase A) ---- */
  const brandPosition = scoreDetails.brand_position;
  const brandPositionPromptsWithData = n(brandPosition?.prompts_with_position_data);
  const brandPositionAvailable = Boolean(brandPosition) && brandPositionPromptsWithData > 0;
  const brandPositionRanking = [...(brandPosition?.ranking ?? [])].sort(
    (a, b) => n(a.avg_position) - n(b.avg_position)
  );
  const brandPositionLowConfidence = brandPositionPromptsWithData > 0 && brandPositionPromptsWithData <= 2;

  const topCompetitor = competitorRows.sort((a, b) => b.mentionRate - a.mentionRate)[0];

  /* ---- unified competitive panorama (position + share of voice) ----
   * Merges the two previously-separate real sections (brand position
   * ranking + competitor SOV table) into one list, per founder request
   * (Task Intake 2026-07-23). When brand_position isn't available for this
   * scan, falls back to the SOV-only ordering the table already used.
   */
  type PanoramaRow = {
    key: string;
    name: string;
    domain: string | null;
    isBrand: boolean;
    avgPosition: number | null;
    sov: number;
    /** Real rank among ranked entities (1-based), or null when unavailable. */
    rank: number | null;
  };
  // Single source of truth for BOTH the position-bar chart and the ranked
  // list below it — both panels must show the same entities in the same
  // order, or the two numbers ("posición 2" on the bar vs. a different row
  // in the list) read as contradictory (founder-reported confusion,
  // real-data case: 18 competitors made the old "brand pinned + rest by
  // SOV" list diverge completely from the position-ranked bars).
  const panoramaRows: PanoramaRow[] = brandPositionAvailable
    ? brandPositionRanking.map((entry, i) => {
        if (entry.is_brand) {
          return {
            key: "brand",
            name: project.brand,
            domain: project.domain,
            isBrand: true,
            avgPosition: n(entry.avg_position),
            sov: brandSov,
            rank: i + 1
          };
        }
        const entryKey = normalizeEntityName(entry.name);
        const match = competitorRows.find((c) => normalizeEntityName(c.name) === entryKey);
        // Domain resolution falls back to the unfiltered historical read
        // when the entity isn't in the currently active list (e.g. the
        // ranking is a snapshot from a scan that ran before the tracked
        // competitor list changed) — a domain doesn't stop being real just
        // because tracking was later turned off. sov stays 0 for this case:
        // there's no current share-of-voice figure for an untracked entity.
        const historicalMatch = match ? null : everTrackedCompetitorRows.find((c) => normalizeEntityName(c.name) === entryKey);
        return {
          key: entry.name ?? `pos-${i}`,
          name: entry.name ?? "—",
          domain: match?.domain ?? historicalMatch?.domain ?? null,
          isBrand: false,
          avgPosition: n(entry.avg_position),
          sov: match?.sov ?? 0,
          rank: i + 1
        };
      })
    : [
        { key: "brand", name: project.brand, domain: project.domain, isBrand: true, avgPosition: null, sov: brandSov, rank: null },
        ...competitorRows
          .slice()
          .sort((a, b) => b.mentionRate - a.mentionRate)
          .map((c) => ({ key: c.name, name: c.name, domain: c.domain, isBrand: false, avgPosition: null, sov: c.sov, rank: null }))
      ];
  const maxPanoramaSov = Math.max(1, ...panoramaRows.map((r) => r.sov));

  /* ---- stale competitor snapshot detection ----
   * brand_position.ranking is frozen at the LATEST completed scan's time.
   * If every currently active competitor is absent from that ranking, the
   * tracked list was very likely swapped wholesale after that scan ran —
   * the panorama (and the rest of this scan's competitive numbers) reflect
   * a competitor set that no longer matches what's configured today.
   * Gated on a COMPLETE mismatch (not "at least one changed") so adding or
   * retiring a single competitor between scans — the normal case — never
   * triggers a false warning; only a full list swap does.
   */
  const rankingCompetitorKeys = brandPositionAvailable
    ? new Set(brandPositionRanking.filter((entry) => !entry.is_brand).map((entry) => normalizeEntityName(entry.name)))
    : new Set<string>();
  const activeCompetitorKeys = new Set(competitorRows.map((c) => normalizeEntityName(c.name)));
  const staleCompetitorSnapshot =
    brandPositionAvailable &&
    rankingCompetitorKeys.size > 0 &&
    activeCompetitorKeys.size > 0 &&
    ![...activeCompetitorKeys].some((key) => rankingCompetitorKeys.has(key));

  /* ---- position-media summary + bars (real brand_position data) ----
   * "Tu posición media X / N" = brand's rank among the ranked entities.
   * Bars encode avg_position (lower = better = taller). Only when
   * brand_position is available for this scan; otherwise the panorama
   * shows the SOV ranking list alone.
   */
  const brandRankIndex = brandPositionRanking.findIndex((e) => e.is_brand);
  const brandRank = brandRankIndex >= 0 ? brandRankIndex + 1 : null;
  const totalRanked = brandPositionRanking.length;

  // Top 5 by real position — the exact same rows feed both the bars and the
  // list. If the brand falls outside the top 5, its real row is appended so
  // "dónde estoy" never disappears, but the top-5 podium itself stays intact.
  const topPanoramaRows = panoramaRows.slice(0, 5);
  const brandRow = panoramaRows.find((r) => r.isBrand);
  const panoramaListRows =
    brandPositionAvailable && brandRow && !topPanoramaRows.some((r) => r.isBrand)
      ? [...topPanoramaRows, brandRow]
      : topPanoramaRows;

  const posbarsData = (() => {
    if (!brandPositionAvailable || topPanoramaRows.length === 0) return [];
    const positions = topPanoramaRows.map((r) => n(r.avgPosition));
    const maxPos = Math.max(...positions);
    const minPos = Math.min(...positions);
    const range = maxPos - minPos;
    return topPanoramaRows.map((r) => {
      const pos = n(r.avgPosition);
      // Lower avg_position (better) → taller bar. Flat range → uniform height.
      const height = range > 0 ? 20 + ((maxPos - pos) / range) * 40 : 40;
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
    provider: r.provider
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
        <div className="ov2-scope">
          {/* TEMP DEBUG — remove before merge. Diagnosing why favicons/aviso
              don't show on the Ikea preview despite the fix. */}
          <pre style={{ background: "#111", color: "#0f0", fontSize: 11, padding: 12, marginBottom: 16, overflowX: "auto", whiteSpace: "pre-wrap" }}>
            {JSON.stringify(
              {
                brandPositionAvailable,
                competitorRows: competitorRows.map((c) => ({ name: c.name, domain: c.domain })),
                everTrackedCompetitorRows: everTrackedCompetitorRows.map((c) => ({ name: c.name, domain: c.domain })),
                rankingNonBrandNames: brandPositionAvailable
                  ? brandPositionRanking.filter((e) => !e.is_brand).map((e) => e.name)
                  : [],
                activeCompetitorKeysArr: [...activeCompetitorKeys],
                rankingCompetitorKeysArr: [...rankingCompetitorKeys],
                staleCompetitorSnapshot
              },
              null,
              2
            )}
          </pre>
          {staleCompetitorSnapshot && (
            <div
              className="feedback"
              style={{ background: "var(--warn-soft)", color: "var(--warn-ink)", borderColor: "#f3d086", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}
            >
              <p style={{ fontWeight: 650 }}>
                Este análisis usa una lista de competidores distinta a la actual — cambiaste los
                competidores trackeados después de este escaneo. Vuelve a escanear para actualizar
                los datos.
              </p>
              <ScanTriggerButton projectId={projectId} label="Volver a escanear" disabled={Boolean(activeRun)} />
            </div>
          )}
          {/* 1 · Executive summary / insight banner */}
          <div className="ov2-insight">
            <div className="ov2-insight-ico">
              <Icon name="sparkles" size={18} />
            </div>
            <p className="ov2-insight-txt">
              GenScore detectó que <b>{project.brand}</b> aparece en{" "}
              <b>{brandMentions} de {totalResults} prompts</b> ({computedMentionRate}%), con una{" "}
              <b>puntuación GEO de {gaugeScore}/100</b>.
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
              {latestRecommendations?.length ? (
                <>
                  {" "}GenScore ha priorizado{" "}
                  <b>{latestRecommendations.length} {latestRecommendations.length === 1 ? "acción" : "acciones"}</b>{" "}
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

          {/* 2 · Compact gauge card (score + trend) */}
          <div className="ov2-gauge-card">
            <div className="ov2-gauge-ring">
              <Gauge value={gaugeScore} size={96} stroke={10} />
            </div>
            <div className="ov2-gauge-info">
              <div className="ov2-gauge-lbl">Puntuación GEO</div>
              <div className="ov2-gauge-badges">
                <span className={`badge badge-${getBandTone(gaugeScore)}`}>{getBandLabel(gaugeScore)}</span>
                {geoTrend.length >= 2 && gaugeDelta !== 0 && <Delta value={gaugeDelta} suffix=" pt" />}
              </div>
              {geoTrend.length >= 2 ? (
                <>
                  <Sparkline data={geoTrend} w={200} h={30} color="var(--brand-blue)" />
                  <div className="ov2-gauge-trend-cap">Últimos {geoTrend.length} escaneos</div>
                </>
              ) : (
                <div className="ov2-gauge-trend-cap">La tendencia estará disponible con ≥2 escaneos.</div>
              )}
              {geoScoreLowConfidence && (
                <div style={{ marginTop: 7 }}>
                  <span className="badge badge-warn" style={{ fontSize: 10.5 }}>
                    {prominenceUnavailable
                      ? "Confianza media: posición no disponible"
                      : `Confianza ${confidenceLabels[geoScore?.confidence ?? "medium"] ?? geoScore?.confidence}`}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 3 · Indicadores clave — KPI carousel */}
          <div className="ov2-sec-lbl">Indicadores clave</div>
          <div className="ov2-kpi-car">
            {[
              {
                key: "mention",
                label: "Tasa de mención",
                value: computedMentionRate,
                unit: "%",
                delta: visDelta,
                hint: "Prompts donde aparece tu marca.",
                tip: "Porcentaje de prompts en los que tu marca aparece mencionada en la respuesta de la IA, sobre el total de prompts del escaneo.",
                isShare: false as const
              },
              {
                key: "citation-share",
                label: "Cuota de Citas",
                value: citationShareResult.share,
                unit: "%",
                delta: 0,
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
                delta: gapDelta,
                hint: "Prompts donde aparece un competidor pero tu marca no.",
                invert: true,
                tip: "Mide en qué porcentaje de tus prompts aparece un competidor pero tu marca no. Cuanto más alto, más te están desplazando tus rivales en las respuestas de la IA.",
                isShare: false as const,
                band: getCompetitivePressureBand(competitorPressureScore)
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
                delta: 0,
                hint:
                  sentimentTotal > 0
                    ? `${sentimentBreakdown} · sobre ${sentimentTotal} ${sentimentTotal === 1 ? "respuesta" : "respuestas"} con tu marca.`
                    : "Sin respuestas con tu marca mencionada en este escaneo.",
                tip: "Tono con el que las respuestas de IA hablan de tu marca en el último escaneo, calculado solo sobre las respuestas donde tu marca aparece. Se muestra el tono dominante; el desglose completo está debajo.",
                isShare: false as const,
                hideDelta: true as const
              }
            ].map((m) => (
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
                      ) : "hideDelta" in m && m.hideDelta ? null : m.delta !== 0 ? (
                        <Delta value={m.delta} suffix=" pt" invert={"invert" in m ? m.invert : undefined} />
                      ) : (
                        <span className="delta flat">— sin cambio</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

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

          {/* 5 · Panorámica competitiva */}
          <div className="ov2-sec-lbl">
            Panorámica competitiva
            {competitors?.length ? (
              <Link href={`/dashboard/projects/${projectId}/competitors`}>Ver todo</Link>
            ) : null}
          </div>
          {competitorRows.length > 0 ? (
            <>
              {brandPositionAvailable && posbarsData.length > 0 && (
                <div className="card" style={{ padding: "17px 16px 6px" }}>
                  <div className="ov2-pm-lbl">Tu posición media</div>
                  <div className="ov2-pm-val">
                    {brandRank ?? "—"}<small> / {totalRanked}</small>
                  </div>
                  <div className="ov2-posbars">
                    {posbarsData.map((b, i) => (
                      <div key={`${b.name}-${i}`} className={`b ${b.isBrand ? "you" : ""}`} style={{ height: b.height }}>
                        <span>{b.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="card" style={{ marginTop: brandPositionAvailable && posbarsData.length > 0 ? 11 : 0 }}>
                {panoramaListRows.map((row) => {
                  const favicon = faviconUrl(row.domain);
                  const barColor = row.isBrand ? "var(--brand-blue)" : "var(--ink-3)";
                  return (
                    <div key={row.key} className={`ov2-cmp-row ${row.isBrand ? "you" : ""}`}>
                      <span className="ov2-cmp-n">{row.rank ?? "·"}</span>
                      {favicon ? (
                        // eslint-disable-next-line @next/next/no-img-element -- external favicon service, not a static asset
                        <img src={favicon} alt="" className="ov2-cmp-fav" width={26} height={26} loading="lazy" />
                      ) : (
                        <span className="fav" style={{ background: barColor, width: 26, height: 26, fontSize: 11 }}>
                          {row.name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <div className="ov2-cmp-nm">
                        <div className="t">
                          {row.name}
                          {row.isBrand && <span className="ov2-cmp-tag">Tú</span>}
                        </div>
                      </div>
                      <div className="ov2-cmp-sov">
                        <div className="track">
                          <i style={{ width: `${(row.sov / maxPanoramaSov) * 100}%`, background: barColor }} />
                        </div>
                        <div className="pct">{row.sov}%</div>
                      </div>
                      {row.avgPosition !== null ? (
                        <span className="ov2-cmp-sc">{row.avgPosition.toFixed(2)}<small> pos</small></span>
                      ) : (
                        <span className="ov2-cmp-sc" style={{ color: "var(--ink-4)" }}>—</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
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
