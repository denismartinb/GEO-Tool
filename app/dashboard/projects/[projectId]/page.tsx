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
import { getEffectiveGeoScore } from "@/lib/scoring/run-scoring";
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
 * Simplified, non-literal glyphs for each engine (Overview "Posicionamiento
 * por motores de IA") — not a pixel copy of any provider's mark, just a
 * recognizable stand-in per engine so the block reads at a glance.
 */
function EngineGlyph({ provider }: { provider: string }) {
  switch (provider) {
    case "gemini":
      return (
        <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
          <path d="M12 2c.9 4.2 2.9 7.1 7 8-4.1.9-6.1 3.8-7 8-.9-4.2-2.9-7.1-7-8 4.1-.9 6.1-3.8 7-8Z" />
        </svg>
      );
    case "openai":
      return (
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="12" cy="6" r="3" />
          <circle cx="17.2" cy="9" r="3" />
          <circle cx="17.2" cy="15" r="3" />
          <circle cx="12" cy="18" r="3" />
          <circle cx="6.8" cy="15" r="3" />
          <circle cx="6.8" cy="9" r="3" />
        </svg>
      );
    case "claude":
      return (
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 3v18M4.5 7.5l15 9M4.5 16.5l15-9" />
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
    { data: trendHistoryDesc },
    { count: activeRecommendationsCount }
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
          .select("prompt_text_snapshot, brand_mentioned, citation_found, sentiment, extracted_json, provider")
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
          .select("visibility_score, citation_score, competitor_gap_score, created_at, details_json")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false })
          .limit(7),
        // Real total (not just the top-3 fetched above) for the Oportunidades
        // summary card's headline number — Task Intake 2026-07-23, Option A:
        // ship without any invented "potential points", real counts only.
        supabase
          .from("recommendations")
          .select("id", { count: "exact", head: true })
          .eq("project_id", projectId)
          .eq("run_id", latestCompletedRun.id)
          .eq("status", "active")
      ])
    : [{ data: null }, { data: null }, { data: null }, { data: null }, { count: null }];

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

  const computedCitationRate = allPromptResults?.length
    ? Math.round((allPromptResults.filter((r) => r.citation_found).length / allPromptResults.length) * 100)
    : citationScore;

  /* ---- distribución por motor de IA: vista comparativa real por motor ----
   * (ENGINES-VALUE-1) mention, citación y sentimiento por motor, computados
   * en tiempo de lectura sobre las mismas filas de scan_prompt_results que
   * ya trae esta página — cero queries nuevas.
   */
  const { engines: engineBreakdown, gap: engineGap } = computeEngineBreakdown(allPromptResults ?? []);

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

  /* ---- prompt opportunities (audit phase D, finding 3) ----
   * Prompts where at least one competitor is mentioned in the AI answer and
   * the brand is not — the "where you're losing today" list. Built entirely
   * from the extracted_json already fetched for this run (the same signal the
   * recommendation engine's competitor rules use); display only. With
   * multiple engines, a prompt qualifies if ANY engine's answer shows the
   * gap, and the winning competitors are aggregated across those answers.
   */
  const promptOpportunities = (() => {
    const byPrompt = new Map<string, { prompt: string; competitors: Set<string> }>();
    for (const result of allPromptResults ?? []) {
      if (result.brand_mentioned) continue;
      const promptText = (result.prompt_text_snapshot as string | null)?.trim();
      if (!promptText) continue;
      const ext = parseExt(result.extracted_json);
      const winners = (ext.competitors ?? [])
        .filter((c) => c.mentioned && c.name)
        .map((c) => c.name as string);
      if (!winners.length) continue;
      const entry = byPrompt.get(promptText) ?? { prompt: promptText, competitors: new Set<string>() };
      winners.forEach((name) => entry.competitors.add(name));
      byPrompt.set(promptText, entry);
    }
    return Array.from(byPrompt.values())
      .sort((a, b) => b.competitors.size - a.competitors.size)
      .slice(0, 5)
      .map((entry) => ({ prompt: entry.prompt, competitors: Array.from(entry.competitors).slice(0, 3) }));
  })();

  const citedPages = Object.values(citedUrlCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((p) => ({
      ...p,
      isYours: isOwnDomain(p.domain, project.domain)
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
  };
  const panoramaRows: PanoramaRow[] = brandPositionAvailable
    ? brandPositionRanking.map((entry, i) => {
        if (entry.is_brand) {
          return {
            key: "brand",
            name: project.brand,
            domain: project.domain,
            isBrand: true,
            avgPosition: n(entry.avg_position),
            sov: brandSov
          };
        }
        const match = competitorRows.find(
          (c) => c.name.toLowerCase().trim() === (entry.name ?? "").toLowerCase().trim()
        );
        return {
          key: entry.name ?? `pos-${i}`,
          name: entry.name ?? "—",
          domain: match?.domain ?? null,
          isBrand: false,
          avgPosition: n(entry.avg_position),
          sov: match?.sov ?? 0
        };
      })
    : [
        { key: "brand", name: project.brand, domain: project.domain, isBrand: true, avgPosition: null, sov: brandSov },
        ...competitorRows
          .slice()
          .sort((a, b) => b.mentionRate - a.mentionRate)
          .map((c) => ({ key: c.name, name: c.name, domain: c.domain, isBrand: false, avgPosition: null, sov: c.sov }))
      ];
  const maxPanoramaSov = Math.max(1, ...panoramaRows.map((r) => r.sov));

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
                {geoTrend.length >= 2 && (
                  <div style={{ marginTop: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <Sparkline data={geoTrend} w={120} h={30} color="var(--brand-blue)" />
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {gaugeDelta !== 0 ? (
                        <Delta value={gaugeDelta} suffix=" pt" />
                      ) : (
                        <span className="delta flat">— sin cambio</span>
                      )}
                      <span className="stat-hint">vs. escaneo anterior</span>
                    </div>
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
                  {
                    l: "Presencia (mención)",
                    c: geoScore.components.presence,
                    color: "var(--brand-blue)",
                    info: "Cuántas respuestas de la IA nombran tu marca. Puede venir de lo que el modelo ya sabe de ti por su entrenamiento — no implica que tenga tu web como fuente."
                  },
                  { l: "Prominencia (posición)", c: geoScore.components.prominence, color: "#7c3aed" },
                  // Label follows the stored composite's semantics: v2 runs
                  // score standing as real share of voice (ADR 0015), while
                  // legacy v1 runs stored 100 - presión competitiva — showing
                  // the v2 label over a v1 value would misdescribe the number.
                  geoScore.composite_version === "geo-score-v2"
                    ? {
                        l: "Cuota de voz",
                        c: geoScore.components.standing,
                        color: "#0d9488",
                        info: "Qué parte de las menciones en las respuestas de IA son tuyas, frente a los competidores que monitorizas. Si ni tu marca ni tus competidores aparecen, este componente no puntúa (no hay voz que repartir)."
                      }
                    : { l: "Posición competitiva", c: geoScore.components.standing, color: "#0d9488" },
                  {
                    l: "Autoridad (citas)",
                    c: geoScore.components.authority,
                    color: "#e54563",
                    info: "Cuántas respuestas incluyen una cita verificada (grounding) a tu propio dominio. A diferencia de la mención, esta señal sí depende de contenido real que publiques y puedas mejorar."
                  }
                ].map((row) => {
                  const unavailable = row.c?.value === null || row.c?.value === undefined;
                  const v = Math.min(100, Math.round(n(row.c?.value)));
                  return (
                    <div className="compose-row" key={row.l}>
                      <div className="compose-top">
                        <span className="compose-l">
                          {row.l}
                          {row.info && <InfoTip text={row.info} />}
                        </span>
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
                  {
                    l: "Tasa de mención",
                    v: computedMentionRate,
                    color: "var(--brand-blue)",
                    info: "Cuántas respuestas de la IA nombran tu marca. Puede venir de lo que el modelo ya sabe de ti por su entrenamiento — no implica que tenga tu web como fuente."
                  },
                  {
                    l: "Tasa de cita",
                    v: computedCitationRate,
                    // computedCitationRate counts rows with ANY citation
                    // (citation_found), not own-domain citations — this legacy
                    // fallback only renders for runs scored before geo-score-v1,
                    // whose data predates the own-domain distinction
                    // (docs/adr/0013). The tooltip must describe that broader
                    // measure, not the stricter authority definition
                    // (docs/geo-methodology-audit-2026-07.md, finding 8).
                    color: "#7c3aed",
                    info: "Cuántas respuestas incluyen al menos una cita verificada (grounding) a alguna fuente, propia o de terceros. Este escaneo es anterior a la métrica actual de autoridad, que solo cuenta citas a tu propio dominio."
                  },
                  { l: "Presión competitiva", v: Math.min(100, competitorPressureScore), color: "#0d9488" }
                ].map((c) => (
                  <div className="compose-row" key={c.l}>
                    <div className="compose-top">
                      <span className="compose-l">
                        {c.l}
                        {c.info && <InfoTip text={c.info} />}
                      </span>
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

          {/* 3 · Compact KPI carousel */}
          <div className="ov2-kpi-car" style={{ marginTop: 12 }}>
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
                <div className="ov2-kpi-label">
                  {m.label}
                  <InfoTip text={m.tip} />
                </div>

                {m.key === "sentiment" ? (
                  <>
                    <div className="ov2-kpi-value" style={{ fontSize: 18 }}>{m.value}</div>
                    {sentimentTotal > 0 ? (
                      <>
                        <div className="ov2-senti-bar">
                          {sentimentCounts.positive > 0 && (
                            <span style={{ width: `${(sentimentCounts.positive / sentimentTotal) * 100}%`, background: "var(--pos)" }} />
                          )}
                          {sentimentCounts.neutral > 0 && (
                            <span style={{ width: `${(sentimentCounts.neutral / sentimentTotal) * 100}%`, background: "var(--ink-4)" }} />
                          )}
                          {sentimentCounts.mixed > 0 && (
                            <span style={{ width: `${(sentimentCounts.mixed / sentimentTotal) * 100}%`, background: "var(--warn-ink)" }} />
                          )}
                          {sentimentCounts.negative > 0 && (
                            <span style={{ width: `${(sentimentCounts.negative / sentimentTotal) * 100}%`, background: "var(--neg-ink)" }} />
                          )}
                        </div>
                        <div className="ov2-senti-legend">
                          {sentimentCounts.positive > 0 && <span><i style={{ background: "var(--pos)" }} />{sentimentCounts.positive} pos.</span>}
                          {sentimentCounts.neutral > 0 && <span><i style={{ background: "var(--ink-4)" }} />{sentimentCounts.neutral} neu.</span>}
                          {sentimentCounts.mixed > 0 && <span><i style={{ background: "var(--warn-ink)" }} />{sentimentCounts.mixed} mix.</span>}
                          {sentimentCounts.negative > 0 && <span><i style={{ background: "var(--neg-ink)" }} />{sentimentCounts.negative} neg.</span>}
                        </div>
                      </>
                    ) : null}
                  </>
                ) : m.isShare ? (
                  m.value !== null ? (
                    <>
                      <div className="ov2-kpi-value">
                        {m.value}<span className="unit">%</span>
                      </div>
                      <div className="ov2-kpi-foot">
                        <span className={`badge ${
                          m.value > 50 ? "badge-pos" :
                          m.value >= 30 ? "badge-accent" :
                          m.value >= 15 ? "badge-neutral" :
                          m.value >= 5  ? "badge-warn" :
                          "badge-neg"
                        }`} style={{ fontSize: 10.5 }}>
                          {m.value > 50 ? "Muy alto" :
                           m.value >= 30 ? "Alto" :
                           m.value >= 15 ? "Medio" :
                           m.value >= 5  ? "Bajo" :
                           "Muy bajo"}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="ov2-kpi-value" style={{ color: "var(--ink-4)", fontSize: 16 }}>Sin datos</div>
                  )
                ) : (
                  <>
                    <div className="ov2-kpi-value">
                      {m.value}<span className="unit">{m.unit}</span>
                    </div>
                    <div className="ov2-kpi-foot">
                      {"band" in m && m.band ? (
                        <span className={`badge badge-${m.band.tone}`} style={{ fontSize: 10.5 }}>
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

                {(m.key !== "sentiment" || sentimentTotal === 0) && (
                  <div className="ov2-kpi-hint">{m.hint}</div>
                )}
              </div>
            ))}
          </div>

          {/* 4 · Dónde estás */}
          <div className="section-head" style={{ marginTop: 28 }}>
            <div className="section-title">Dónde estás</div>
            <div className="section-desc">Cuota de voz en IA en tus prompts monitorizados</div>
          </div>

          <div className="grid-2-1">
            {/* Unified competitive panorama: position + share of voice
                (merges the previously-separate "Posición media de marca" and
                competitor table sections — founder request, Task Intake
                2026-07-23) with real favicons via faviconUrl(). */}
            <div className="card">
              <div className="card-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div className="card-title" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  Panorámica competitiva
                  <InfoTip text="Posición media (según orden de aparición en las respuestas de IA) y cuota de voz de cada marca en tus prompts monitorizados. Las marcas no mencionadas en un prompt penalizan con la última posición posible." />
                </div>
                {competitors?.length ? (
                  <span className="badge badge-neutral">{competitors.length} competidores</span>
                ) : null}
              </div>
              {competitorRows.length > 0 ? (
                <div style={{ padding: "10px 10px 12px" }}>
                  {!brandPositionAvailable && (
                    <div style={{ fontSize: 11.5, color: "var(--ink-4)", padding: "0 6px 10px" }}>
                      Posición media no disponible para este escaneo — disponible a partir del próximo.
                    </div>
                  )}
                  {brandPositionLowConfidence && (
                    <span className="badge badge-warn" style={{ margin: "0 6px 10px", width: "fit-content" }}>
                      Pocos datos de posición — basado en {brandPositionPromptsWithData} prompt{brandPositionPromptsWithData === 1 ? "" : "s"}
                    </span>
                  )}
                  {panoramaRows.map((row, i) => {
                    const favicon = faviconUrl(row.domain);
                    const barColor = row.isBrand ? "var(--brand-blue)" : COMPETITOR_COLORS[i % COMPETITOR_COLORS.length];
                    return (
                      <div key={row.key} className={`ov2-cmp-row ${row.isBrand ? "you" : ""}`}>
                        <span className="ov2-cmp-rank">{i + 1}</span>
                        {favicon ? (
                          // eslint-disable-next-line @next/next/no-img-element -- external favicon service, not a static asset
                          <img src={favicon} alt="" className="ov2-cmp-fav" width={24} height={24} loading="lazy" />
                        ) : (
                          <span className="fav" style={{ background: barColor, width: 24, height: 24, fontSize: 10 }}>
                            {row.name.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <span className="ov2-cmp-name">
                          {row.name}
                          {row.isBrand && <span className="ov2-cmp-you-tag">Tú</span>}
                        </span>
                        {row.avgPosition !== null && (
                          <span className="ov2-cmp-pos tnum">{row.avgPosition.toFixed(2)} pos.</span>
                        )}
                        <div className="ov2-cmp-bar">
                          <span style={{ width: `${(row.sov / maxPanoramaSov) * 100}%`, background: barColor }} />
                        </div>
                        <span className="ov2-cmp-sov tnum">{row.sov}%</span>
                      </div>
                    );
                  })}
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

            {/* Engine positioning */}
            <div className="card">
              <div className="card-head">
                <div className="card-title">Posicionamiento por motores de IA</div>
                <InfoTip text="Mención, citación y sentimiento de tu marca en cada motor de IA ejecutado en el último escaneo. Cada motor responde distinto — las brechas de cobertura en uno son una oportunidad." />
              </div>
              {engineBreakdown.length > 0 ? (
                <>
                  <div style={{ padding: "18px" }}>
                    {engineBreakdown.map((e) => {
                      const meta = getEngineMeta(e.provider);
                      return (
                        <div key={e.provider} className="ov2-eng-row">
                          <span className="ov2-eng-ico" style={{ background: `${meta.color}1f`, color: meta.color }}>
                            <EngineGlyph provider={e.provider} />
                          </span>
                          <div className="ov2-eng-body">
                            <div className="ov2-eng-top">
                              <span className="ov2-eng-name">{meta.label}</span>
                              <span className="ov2-eng-pct tnum">{e.mentionRate}% mención</span>
                            </div>
                            <div className="sov-bar" style={{ height: 8 }}>
                              <div className="sov-fill" style={{ width: `${e.mentionRate}%`, background: meta.color }} />
                            </div>
                            <div className="ov2-eng-meta">
                              {/* Ungrounded engines (no web search) show no citation
                                  text at all — founder decision on review; the
                                  grounded/ungrounded distinction stays honest via
                                  citationRate: null, it's just not verbalized here. */}
                              {e.citationRate !== null && <span>{e.citationRate}% citación</span>}
                              <span style={{ marginLeft: "auto" }}>
                                {e.dominantSentiment ? (
                                  <span
                                    className={`badge ${
                                      e.dominantSentiment === "positive"
                                        ? "badge-pos"
                                        : e.dominantSentiment === "negative"
                                          ? "badge-neg"
                                          : "badge-neutral"
                                    }`}
                                    style={{ fontSize: 10.5 }}
                                  >
                                    {sentimentLabels[e.dominantSentiment] ?? e.dominantSentiment}
                                  </span>
                                ) : (
                                  <span style={{ color: "var(--ink-4)" }}>—</span>
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {engineGap && engineGap.points >= 15 && (
                    <div
                      style={{
                        borderTop: "1px solid var(--line-soft)",
                        padding: "12px 18px",
                        fontSize: 12.5,
                        color: "var(--ink-3)",
                        lineHeight: 1.5
                      }}
                    >
                      Brecha de {engineGap.points} pts: tu marca aparece mucho más en{" "}
                      <b style={{ color: "var(--ink)" }}>{getEngineMeta(engineGap.leader).label}</b> que en{" "}
                      <b style={{ color: "var(--ink)" }}>{getEngineMeta(engineGap.laggard).label}</b>. Mejorar tu
                      presencia en las fuentes que usa {getEngineMeta(engineGap.laggard).label} es tu mayor
                      oportunidad multi-motor.
                    </div>
                  )}
                </>
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
              <div className="card-head" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div className="card-title">Oportunidades de prompts</div>
                {promptOpportunities.length > 0 && (
                  <span className="badge badge-neutral">{promptOpportunities.length}</span>
                )}
                <InfoTip text="Prompts de tu último escaneo donde la IA menciona al menos un competidor pero no a tu marca — las consultas concretas donde hoy pierdes la respuesta. Cada una tiene su recomendación asociada en Recomendaciones." />
              </div>
              {promptOpportunities.length > 0 ? (
                <div style={{ padding: "4px 0" }}>
                  {promptOpportunities.map((op, i) => (
                    <div
                      key={op.prompt}
                      style={{
                        padding: "11px 18px",
                        borderBottom: i < promptOpportunities.length - 1 ? "1px solid var(--line-soft)" : "none"
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)", lineHeight: 1.45 }}>
                        {op.prompt}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, color: "var(--ink-4)", fontWeight: 600 }}>
                          {op.competitors.length === 1 ? "Gana" : "Ganan"}
                        </span>
                        {op.competitors.map((name) => (
                          <span key={name} className="badge badge-neg" style={{ fontSize: 11 }}>
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div style={{ padding: "10px 18px 12px" }}>
                    <Link
                      href={`/dashboard/projects/${projectId}/recommendations`}
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12.5, fontWeight: 650, color: "var(--accent)" }}
                    >
                      Ver las acciones para recuperarlos <Icon name="arrRight" size={13} />
                    </Link>
                  </div>
                </div>
              ) : (
                <div style={{ padding: "16px 18px" }}>
                  <div className="section-empty">
                    <div className="section-empty-title">Sin oportunidades abiertas</div>
                    <div className="section-empty-desc">
                      En este escaneo no hay prompts donde un competidor aparezca y tu marca no. Si añades más prompts o competidores, aquí verás dónde te desplazan.
                    </div>
                  </div>
                </div>
              )}
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

          {/* Oportunidades — visual summary of the Recomendaciones section
              (founder request). Headline number is the REAL count of active
              recommendations for this run (activeRecommendationsCount, a
              dedicated count query) — no invented "potential points" (Task
              Intake 2026-07-23, Option A: real score-impact estimation is a
              separate, not-yet-scoped future phase). */}
          {latestRecommendations?.length ? (
            <div className="ov2-opps" style={{ marginTop: 16 }}>
              <div className="ov2-opps-hero">
                <div className="ov2-opps-n">{activeRecommendationsCount ?? latestRecommendations.length}</div>
                <div className="ov2-opps-l">
                  {(activeRecommendationsCount ?? latestRecommendations.length) === 1 ? "acción activa" : "acciones activas"}
                  <br />para mejorar tu puntuación GEO
                </div>
              </div>
              <div className="ov2-opps-list">
                {latestRecommendations.map((rec) => {
                  const priority = (rec.priority_rank ?? 1) <= 2 ? "high" : (rec.priority_rank ?? 1) <= 4 ? "med" : "low";
                  const dotColor = priority === "high" ? "var(--p-high)" : priority === "med" ? "var(--p-med)" : "var(--p-low)";
                  return (
                    <div key={rec.id} className="ov2-opps-item">
                      <span className="ov2-opps-dot" style={{ background: dotColor }} />
                      <span className="ov2-opps-title">{rec.title}</span>
                    </div>
                  );
                })}
              </div>
              <Link href={`/dashboard/projects/${projectId}/recommendations`} className="ov2-opps-cta">
                Ver todas las recomendaciones <Icon name="arrRight" size={13} />
              </Link>
            </div>
          ) : null}

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
