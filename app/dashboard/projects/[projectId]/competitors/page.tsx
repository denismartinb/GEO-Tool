import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { InfoTip } from "@/components/ui/info-tip";
import { requireUser } from "@/lib/auth";
import { requireActiveProject } from "@/lib/project-workspace";
import { ScanInProgress } from "@/components/scan-in-progress";
import { PodiumRow } from "./podium-row";
import { ManageCompetitorsPanel } from "./manage-competitors-panel";
import { PromptGapSection } from "./prompt-gap-section";
import { SuggestedCompetitorsSection } from "./suggested-competitors-section";
import { PositionTrendChart, type TrendPoint, type TrendSeries } from "@/components/ui/position-trend-chart";
import {
  computeEntityEngineBreakdown,
  filterComparableEngines,
  type EntityEngineBreakdown
} from "@/lib/competitors/engine-share";
import { computePromptGapSummary } from "@/lib/competitors/prompt-gap";
import { computeTopicComparison } from "@/lib/competitors/topic-comparison";
import { computeSovDeltas } from "@/lib/competitors/sov-delta";
import { getEngineMeta } from "@/lib/scan/engine-meta";
import { faviconUrl } from "@/lib/domains/favicon";
import { readPosition, type PersistedRankingEntry } from "@/lib/scoring/brand-position-ranking";

/* ---- Helpers ---- */

// Two-scale ranking palette by rank, replacing the old rainbow
// COMPETITOR_COLORS (docs/brand/brand-guidelines.md §1: the brand blue is
// reserved for "you"). Matches the approved design proposal exactly: the
// favicon uses a richer, more saturated step that fades to neutral gray
// past the top 2 rivals (keeps attention on the real threats), while the
// SoV bar uses a separate, lighter step of the same scale so bars read as
// a secondary signal, never competing visually with the brand's own bar.
const RANK_FAV_COLORS = ["#0f2f6e", "#1a4494", "#5b6b82", "#5b6b82", "#98a2b3"];
const RANK_BAR_COLORS = ["#4f8bef", "#8fb6f6", "#c3d8fb", "#c3d8fb", "#e3ecfd"];

/**
 * Series identity for the position trend chart. Deliberately NOT
 * RANK_BAR_COLORS: that is a sequential blue ramp, correct for rank bars where
 * lightness encodes order, and wrong as categorical identity — reused on the
 * trend chart it produced eight lines in eight shades of one hue, which is
 * what made the chart unreadable (founder, 2026-08-03).
 *
 * Distinct hues, validated for colour-vision deficiency: worst adjacent pair
 * separates by ΔE 11.4 under protanopia against the light surface. Direct
 * end-of-line labels carry identity as well, so colour is never the only cue.
 */
const TREND_SERIES_COLORS = ["#2563eb", "#0e9488", "#d9772b", "#9333a8", "#3b6fd6", "#e54563"];

export type CompetitorRowData = {
  id: string;
  name: string;
  domain: string;
  favColor: string;
  barColor: string;
  initial: string;
  mentions: number;
  sov: number;
  mentionRate: number;
  citationRate: number;
  promptCount: number; // unique runs where seen
  deltaPoints: number | null;
  // ENGINES-VALUE-3: per-engine mention breakdown, only rendered when it
  // has >= 2 entries (see docs/specs/engines-value-3.md Paso C).
  engineBreakdown: EntityEngineBreakdown[];
};

type ExtractedJson = {
  brand?: { mentioned?: boolean };
  competitors?: Array<{ name?: string; mentioned?: boolean }>;
  citations?: Array<{ url?: string | null; domain?: string | null }>;
};

function parseExt(raw: unknown): ExtractedJson {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as ExtractedJson;
}

type BrandPositionRankingEntry = PersistedRankingEntry & {
  name: string;
  is_brand: boolean;
  mention_count: number;
};

function parseBrandPositionRanking(raw: unknown): BrandPositionRankingEntry[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const bp = (raw as { brand_position?: unknown }).brand_position;
  if (!bp || typeof bp !== "object") return [];
  const ranking = (bp as { ranking?: unknown }).ranking;
  return Array.isArray(ranking) ? (ranking as BrandPositionRankingEntry[]) : [];
}

function getInitial(name: string): string {
  return (name ?? "?").slice(0, 1).toUpperCase();
}

function normKey(name: string): string {
  return name.trim().toLowerCase();
}

function normalizeDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

function isSameOrSubdomain(domain: string, root: string): boolean {
  if (!domain || !root) return false;
  return domain === root || domain.endsWith(`.${root}`);
}

/* ---- Page ---- */

export default async function CompetitorsPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await requireActiveProject(projectId);
  const { supabase } = await requireUser();

  /* 1. Configured competitors + all completed runs + recent runs (for activeRun detection) + active prompts (for topic map) */
  const [{ data: competitors }, { data: allRuns }, { data: recentRuns }, { data: projectPrompts }] = await Promise.all([
    supabase
      .from("project_competitors")
      .select("id, name, domain, is_active, created_at")
      .eq("project_id", projectId)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("scan_runs")
      .select("id, status, created_at, finished_at")
      .eq("project_id", projectId)
      .eq("status", "completed")
      .order("created_at", { ascending: false }),
    supabase
      .from("scan_runs")
      .select("id, status, total_prompts, successful_prompts, failed_prompts, started_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("project_prompts").select("id, category").eq("project_id", projectId).eq("is_active", true)
  ]);

  const configuredCompetitors = competitors ?? [];
  const activeCompetitors = configuredCompetitors.filter((c) => c.is_active);
  const inactiveCompetitors = configuredCompetitors.filter((c) => !c.is_active);
  const completedRuns = allRuns ?? [];
  const completedRunIds = completedRuns.map((r) => r.id);
  const activeRun = recentRuns?.find((r) => r.status === "pending" || r.status === "running");
  const latestCompletedRun = completedRuns[0] ?? null;
  const previousCompletedRun = completedRuns[1] ?? null;

  const promptCategoryMap = new Map((projectPrompts ?? []).map((p) => [p.id, p.category as string | null]));

  /* 2. Prompt results across ALL completed runs + per-run brand position scores */
  const [{ data: allResults }, { data: runScores }] =
    completedRunIds.length > 0
      ? await Promise.all([
          supabase
            .from("scan_prompt_results")
            .select("extracted_json, extraction_error, run_id, provider, prompt_id, prompt_text_snapshot")
            .eq("project_id", projectId)
            .eq("status", "completed")
            .in("run_id", completedRunIds),
          supabase
            .from("run_scores")
            .select("run_id, details_json")
            .eq("project_id", projectId)
            .in("run_id", completedRunIds)
        ])
      : [{ data: [] }, { data: [] }];

  /* Same rule as the scoring and the Overview (geo-score-v4, docs/adr/0027):
   * a row whose extraction failed carries no evidence either way. Left in the
   * denominator it converts a provider timeout into "the AI didn't mention
   * you" — and this screen is the one whose disagreement with the Overview
   * started the whole phase, so it must not be the one still doing it.
   * (QA caught this file left un-swept on PR #313.) */
  const results = (allResults ?? []).filter(
    (r) => Boolean(r.extracted_json && typeof r.extracted_json === "object") && !r.extraction_error
  );

  /* 3. Compute SoV correctly:
       SoV(X) = mentions(X) / (brandMentions + Σ competitorMentions) * 100
  */
  let brandMentions = 0;
  const competitorMentionMap = new Map<string, number>();
  const competitorPromptSet = new Map<string, Set<string>>(); // key → Set<run_id>
  const competitorCitationMap = new Map<string, number>(); // key → count of results citing that competitor's domain
  let brandCitations = 0; // prompts where project domain appears in citations
  let totalResultsCount = results.length;

  const projectDomainNorm = normalizeDomain(project.domain ?? "");

  // Map of normalized competitor key → normalized domain, for citation matching
  const competitorDomainMap = new Map<string, string>();
  for (const c of configuredCompetitors) {
    const domain = normalizeDomain(c.domain ?? "");
    if (domain) competitorDomainMap.set(normKey(c.name), domain);
  }

  for (const result of results) {
    const ext = parseExt(result.extracted_json);

    // Brand mentioned
    if (ext.brand?.mentioned) {
      brandMentions += 1;
    }

    // Competitor mentions
    for (const comp of ext.competitors ?? []) {
      if (!comp.name || !comp.mentioned) continue;
      const key = normKey(comp.name);
      competitorMentionMap.set(key, (competitorMentionMap.get(key) ?? 0) + 1);
      if (!competitorPromptSet.has(key)) competitorPromptSet.set(key, new Set());
      competitorPromptSet.get(key)!.add(result.run_id as string);
    }

    // Citation domains for this result. Only `domain` is used: an
    // unresolved grounding citation's `url` is a Google redirect wrapper
    // (vertexaisearch.cloud.google.com/...), not a real domain, and must
    // never be treated as one (docs/adr/0006).
    const citDomains = (ext.citations ?? [])
      .map((c) => normalizeDomain(c.domain ?? ""))
      .filter((d) => d.length > 0);

    // Brand citation rate
    if (citDomains.some((d) => isSameOrSubdomain(d, projectDomainNorm))) {
      brandCitations += 1;
    }

    // Competitor citation rate
    for (const [key, domain] of competitorDomainMap) {
      if (citDomains.some((d) => isSameOrSubdomain(d, domain))) {
        competitorCitationMap.set(key, (competitorCitationMap.get(key) ?? 0) + 1);
      }
    }
  }

  // SoV denominator: brand + all competitor mentions that belong to configured competitors
  const configuredMentionTotal =
    brandMentions +
    configuredCompetitors.reduce((sum, c) => {
      const key = normKey(c.name);
      return sum + (competitorMentionMap.get(key) ?? 0);
    }, 0);

  // Brand SoV
  const brandSov =
    configuredMentionTotal > 0
      ? Math.round((brandMentions / configuredMentionTotal) * 100)
      : 0;

  // Brand mention rate (% of prompts where brand mentioned)
  const brandMentionRate =
    totalResultsCount > 0 ? Math.round((brandMentions / totalResultsCount) * 100) : 0;

  // Brand citation rate
  const brandCitationRate =
    totalResultsCount > 0 ? Math.round((brandCitations / totalResultsCount) * 100) : 0;

  // ENGINES-VALUE-3: per-engine mention breakdown, computed once for the
  // brand and once per active competitor by reusing the same rows with a
  // different mention predicate — see docs/specs/engines-value-3.md Paso A.
  const engineRows = results.map((r) => ({
    provider: r.provider as string | null,
    extracted_json: r.extracted_json
  }));

  const brandEngineBreakdown = computeEntityEngineBreakdown({
    rows: engineRows,
    isEntityMentioned: (ext) => Boolean(ext.brand?.mentioned)
  });

  // COMP-REDESIGN-1: scan-over-scan delta, a deliberately separate metric
  // from the cumulative SoV above — see lib/competitors/sov-delta.ts header.
  const sovDeltas = latestCompletedRun
    ? computeSovDeltas({
        rows: results.map((r) => ({ runId: r.run_id as string, extracted_json: r.extracted_json })),
        latestRunId: latestCompletedRun.id,
        previousRunId: previousCompletedRun?.id ?? null,
        trackedCompetitors: configuredCompetitors
      })
    : null;

  // Build competitor rows
  const competitorRows: CompetitorRowData[] = activeCompetitors
    .map((c, i) => {
      const key = normKey(c.name);
      const mentions = competitorMentionMap.get(key) ?? 0;
      const sov =
        configuredMentionTotal > 0 ? Math.round((mentions / configuredMentionTotal) * 100) : 0;
      const mentionRate =
        totalResultsCount > 0 ? Math.round((mentions / totalResultsCount) * 100) : 0;
      const promptCount = competitorPromptSet.get(key)?.size ?? 0;
      const citations = competitorCitationMap.get(key) ?? 0;
      const citationRate =
        totalResultsCount > 0 ? Math.round((citations / totalResultsCount) * 100) : 0;
      const engineBreakdown = computeEntityEngineBreakdown({
        rows: engineRows,
        isEntityMentioned: (ext) =>
          (ext.competitors ?? []).some((x) => x.mentioned && x.name && normKey(x.name) === key)
      });

      return {
        id: c.id,
        name: c.name,
        domain: c.domain,
        favColor: RANK_FAV_COLORS[i % RANK_FAV_COLORS.length],
        barColor: RANK_BAR_COLORS[i % RANK_BAR_COLORS.length],
        initial: getInitial(c.name),
        mentions,
        sov,
        mentionRate,
        citationRate,
        promptCount,
        deltaPoints: sovDeltas?.competitors.get(key)?.deltaPoints ?? null,
        engineBreakdown
      };
    })
    .sort((a, b) => b.sov - a.sov);

  // Max SoV for bar scaling (brand is reference if highest)
  const allSovValues = [brandSov, ...competitorRows.map((c) => c.sov)];
  const maxSov = Math.max(...allSovValues, 1);

  /* Summary text */
  const topCompetitor = competitorRows[0];
  const hasData = completedRuns.length > 0 && totalResultsCount > 0;

  // ENGINES-VALUE-3 Paso D: gap insight for the leading competitor only —
  // only when it's actually ahead of the brand (already an "amenaza" signal
  // in the summary banner above) and its engine breakdown has >= 2 engines
  // with a >= 20pt spread between the strongest and weakest (higher
  // threshold than Overview's 15pt gap because this dataset is accumulated
  // across all completed runs, not just the latest, and therefore noisier).
  const topCompetitorGap = (() => {
    if (!topCompetitor || topCompetitor.sov <= brandSov) return null;
    const bd = topCompetitor.engineBreakdown;
    if (bd.length < 2) return null;
    const strongest = bd.reduce((a, b) => (b.mentionRate > a.mentionRate ? b : a));
    const weakest = bd.reduce((a, b) => (b.mentionRate < a.mentionRate ? b : a));
    const points = strongest.mentionRate - weakest.mentionRate;
    if (points < 20) return null;
    return { strongest, weakest, points };
  })();

  /* COMP-REDESIGN-1: brecha de prompts (latest completed run only — see
     lib/competitors/prompt-gap.ts header for why). */
  const promptGapSummary =
    latestCompletedRun && activeCompetitors.length > 0
      ? computePromptGapSummary({
          rows: results
            .filter((r) => r.run_id === latestCompletedRun.id)
            .map((r) => ({
              id: `${r.prompt_id}-${r.provider ?? "gemini"}`,
              promptId: r.prompt_id as string | null,
              promptText: (r.prompt_text_snapshot as string | null) ?? "",
              topic: r.prompt_id ? promptCategoryMap.get(r.prompt_id as string) ?? null : null,
              provider: r.provider as string | null,
              extracted_json: r.extracted_json
            })),
          activeCompetitors
        })
      : null;

  /* COMP-REDESIGN-1: terreno por tema (cumulative, same population as the podium/matrix). */
  const topicComparison =
    activeCompetitors.length > 0
      ? computeTopicComparison({
          rows: results.map((r) => ({ promptId: r.prompt_id as string | null, extracted_json: r.extracted_json })),
          promptCategoryMap,
          activeCompetitors
        })
      : [];

  /* Position trend: brand + active competitors' rank WHEN MENTIONED across
     completed runs (geo-score-v3, docs/adr/0026). A scan where an entity was
     never mentioned contributes null, which the chart draws as a gap — the
     pre-v3 field folded those into an N+1 penalty and drew a continuous line
     through positions nobody ever occupied. */
  const rankingByRun = new Map<string, BrandPositionRankingEntry[]>();
  for (const rs of runScores ?? []) {
    rankingByRun.set(rs.run_id as string, parseBrandPositionRanking(rs.details_json));
  }

  const runsAsc = [...completedRuns].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const trendSeries: TrendSeries[] = [
    { key: "brand", label: project.brand, color: TREND_SERIES_COLORS[0], isBrand: true },
    ...competitorRows.map((c, i) => ({
      key: c.id,
      label: c.name,
      color: TREND_SERIES_COLORS[(i + 1) % TREND_SERIES_COLORS.length]
    }))
  ];

  const trendData: TrendPoint[] = runsAsc.map((run) => {
    const ranking = rankingByRun.get(run.id) ?? [];
    const values: Record<string, number | null> = {};
    const brandEntry = ranking.find((r) => r.is_brand);
    values.brand = readPosition(brandEntry);
    for (const c of competitorRows) {
      const entry = ranking.find((r) => !r.is_brand && normKey(r.name) === normKey(c.name));
      values[c.id] = readPosition(entry);
    }
    return { date: run.finished_at ?? run.created_at, values };
  });

  const validTrendPoints = trendData.filter((d) => d.values.brand != null).length;
  const hasTrendData = validTrendPoints >= 2;

  const trendPositionValues = trendData
    .flatMap((d) => Object.values(d.values))
    .filter((v): v is number => v != null);
  const maxTrendPosition = trendPositionValues.length > 0 ? Math.ceil(Math.max(...trendPositionValues)) : 1;

  const hasCompetitiveData = activeCompetitors.length > 0 && completedRuns.length > 0;
  const brandFavicon = faviconUrl(project.domain);

  // Engine columns worth showing — see filterComparableEngines
  // (lib/competitors/engine-share.ts) for the rule and its tests.
  const matrixEngines = filterComparableEngines({
    brandBreakdown: brandEngineBreakdown,
    competitorBreakdowns: competitorRows.map((c) => c.engineBreakdown)
  });

  // Latest avg position per entity, read from the same run_scores ranking the
  // trend chart plots — surfaced as a compact ranked list beside the chart so
  // the current standing is legible without reading a line's endpoint.
  //
  // Two things this number is NOT, both of which read as bugs otherwise
  // (founder caught both on real data):
  //  - It is not a 1..N leaderboard slot. It is a mean over prompts where a
  //    prompt that never mentioned the entity contributes a penalty of
  //    (total entities + 1) — docs/adr/0005 + computeBrandPosition in
  //    lib/scoring/run-scoring.ts. On a project mentioned in few prompts the
  //    best value is legitimately ~4, never 1.
  //  - It is not guaranteed distinct. Several entities genuinely tie, so
  //    ranks use standard competition ranking (1, 2, 2, 2, 5) instead of a
  //    running counter that would print 2/3/4 next to three identical values.
  const latestTrendPoint = trendData.length > 0 ? trendData[trendData.length - 1] : null;
  // Appearance rate for the latest scan, keyed the same way as the trend
  // series. Shown beside the rank because the two answer different questions
  // and one without the other is what made the old single figure misleading
  // (geo-score-v3, docs/adr/0026): a rank of 1.2 means little until you know
  // whether it came from 90% of answers or from one.
  const latestRunRanking = latestCompletedRun ? (rankingByRun.get(latestCompletedRun.id) ?? []) : [];
  const mentionRateFor = (label: string): number | null => {
    const entry = latestRunRanking.find((r) => normKey(r.name) === normKey(label));
    return entry?.mention_rate ?? null;
  };

  const latestPositions = (() => {
    if (!latestTrendPoint) return [];
    const sorted = [
      {
        key: "brand",
        label: project.brand,
        isBrand: true,
        position: latestTrendPoint.values.brand ?? null,
        mentionRate: mentionRateFor(project.brand)
      },
      ...competitorRows.map((c) => ({
        key: c.id,
        label: c.name,
        isBrand: false,
        position: latestTrendPoint.values[c.id] ?? null,
        mentionRate: mentionRateFor(c.name)
      }))
    ]
      .filter((entry): entry is typeof entry & { position: number } => entry.position != null)
      .sort((a, b) => a.position - b.position);

    let lastPosition: number | null = null;
    let lastRank = 0;
    return sorted.map((entry, index) => {
      if (lastPosition === null || entry.position !== lastPosition) {
        lastRank = index + 1;
        lastPosition = entry.position;
      }
      return { ...entry, rank: lastRank };
    });
  })();

  // COMPETITOR-SUGGESTIONS-1: unlike the emerging-brands block it replaced,
  // this is unconditional — it derives from the business profile, not from
  // scan output, so it has something to say even before the first scan and
  // never appears/disappears depending on what the last run happened to
  // extract (founder, 2026-08-03).
  const suggestedCompetitorsBlock = (
    <>
      <div className="cm2-sec-lbl">Competidores sugeridos</div>
      <SuggestedCompetitorsSection projectId={projectId} />
    </>
  );

  return (
    <div className="cm2-scope">
      <div className="page cm2-page">
        {/* Sticky header */}
        <div className="ov-sticky-header">
          <div className="ov-sticky-left">
            <div>
              <p className="kicker" style={{ marginBottom: 2 }}>Competidores</p>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{ fontSize: 15, fontWeight: 750, color: "var(--ink)", letterSpacing: "-.01em" }}
                >
                  {project.name}
                </span>
                <span className="badge badge-neutral">
                  {activeCompetitors.length} {activeCompetitors.length === 1 ? "competidor" : "competidores"}
                </span>
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
            {activeRun && completedRuns.length > 0 ? (
              <span className="scan-status">
                <span className="dot run" />
                Escaneo en curso
              </span>
            ) : null}
          </div>
        </div>

        {activeRun && completedRuns.length === 0 ? (
          <ScanInProgress activeRun={activeRun} />
        ) : (
        <>
        {/* Summary / insight banner */}
        <div className="cm2-insight mt8">
          <div className="cm2-insight-ico" aria-hidden="true">
            <Icon name="users" size={15} />
          </div>
          <div className="cm2-insight-txt">
            {!hasData ? (
              <>
                Sin datos de competencia todavía.{" "}
                <Link href={`/dashboard/projects/${projectId}`} style={{ color: "var(--brand-blue)", fontWeight: 700 }}>
                  Lanza el primer escaneo
                </Link>{" "}
                para ver cómo aparece tu marca frente a la competencia.
              </>
            ) : (
              <>
                <b>{project.brand}</b> aparece en{" "}
                <span className={brandMentionRate >= 50 ? "" : "neg"}>
                  <b>{brandMentionRate}% de los prompts</b>
                </span>
                {" "}analizados
                {totalResultsCount > 0 && <> ({totalResultsCount} prompts en total)</>}.
                {topCompetitor && topCompetitor.sov > brandSov ? (
                  <>
                    {" "}Tu competidor más fuerte es <b>{topCompetitor.name}</b>, con{" "}
                    <span className="neg"><b>{topCompetitor.sov}% de cuota de voz</b></span>
                    {promptGapSummary && promptGapSummary.counts.absent > 0 ? (
                      <>
                        {" "}y te desplaza en{" "}
                        <span className="neg"><b>{promptGapSummary.counts.absent} de {promptGapSummary.totalPrompts} prompts</b></span>
                        {" "}del último escaneo.
                      </>
                    ) : (
                      "."
                    )}
                    {topCompetitorGap && (
                      <>
                        {" "}Su punto débil es <b>{getEngineMeta(topCompetitorGap.weakest.provider).label}</b>
                        {" "}({topCompetitorGap.weakest.mentionRate}% frente a tu{" "}
                        {brandEngineBreakdown.find((e) => e.provider === topCompetitorGap.weakest.provider)?.mentionRate ?? 0}%).
                      </>
                    )}
                  </>
                ) : topCompetitor ? (
                  <>
                    {" "}Lideras con <span style={{ color: "var(--pos)", fontWeight: 700 }}>{brandSov}% de cuota de voz</span>.
                  </>
                ) : null}
              </>
            )}
          </div>
        </div>

        {/* Empty: no competitors configured */}
        {activeCompetitors.length === 0 ? (
          <div style={{ marginTop: 14 }}>
            <div className="cm2-sec-lbl">Panorámica competitiva</div>
            <div className="card" style={{ padding: "48px 40px", textAlign: "center" }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "999px",
                  background: "var(--surface-sunk)",
                  display: "grid",
                  placeItems: "center",
                  color: "var(--ink-3)",
                  margin: "0 auto 16px"
                }}
              >
                <Icon name="competitors" size={22} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 750, color: "var(--ink)", marginBottom: 8 }}>
                No hay competidores configurados
              </div>
              <div
                style={{ fontSize: 13.5, color: "var(--ink-3)", maxWidth: 380, margin: "0 auto 20px", lineHeight: 1.6 }}
              >
                Usa &ldquo;Gestionar&rdquo; arriba para añadir el primer competidor y ver el análisis
                comparativo de cuota de voz en IA.
              </div>
            </div>
          </div>
        ) : null}

        {/* Empty: competitors configured but no completed runs */}
        {activeCompetitors.length > 0 && completedRuns.length === 0 ? (
          <div style={{ marginTop: 14 }}>
            {/* Scope in the label, not in a tooltip. The same brand shows a
                different mention rate here and on the Overview because this
                pools every completed scan and that one reads the latest —
                both correct, and unreadable side by side without saying so
                (pilot finding, 2026-08-03). */}
            <div className="cm2-sec-lbl">Panorámica competitiva · cuota de voz en IA · histórico</div>
            <div className="card" style={{ padding: "48px 40px", textAlign: "center" }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "999px",
                  background: "var(--surface-sunk)",
                  display: "grid",
                  placeItems: "center",
                  color: "var(--ink-3)",
                  margin: "0 auto 16px"
                }}
              >
                <Icon name="resonance" size={22} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 750, color: "var(--ink)", marginBottom: 8 }}>
                Sin datos de competencia todavía
              </div>
              <div
                style={{ fontSize: 13.5, color: "var(--ink-3)", maxWidth: 380, margin: "0 auto 20px", lineHeight: 1.6 }}
              >
                Las menciones y la cuota de voz de tus competidores aparecerán aquí tras completar el
                primer escaneo real con Gemini.
              </div>
              <Link
                href={`/dashboard/projects/${projectId}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 13,
                  fontWeight: 650,
                  color: "var(--brand-blue)"
                }}
              >
                <Icon name="play" size={13} />
                Lanzar escaneo desde visión general
              </Link>
            </div>
          </div>
        ) : null}

        {/* Suggestions stand alone whenever there is no full competitive
            picture yet — the case where "who should I even be tracking?" is
            the most useful thing this screen can answer. */}
        {!hasCompetitiveData ? (
          <div style={{ marginTop: 20 }}>{suggestedCompetitorsBlock}</div>
        ) : null}

        {hasCompetitiveData ? (
          <div className="cm2-cols">
            <div className="cm2-main">
              {/* Podium. "Gestionar" lives here, NOT in the sticky header —
                  docs/brand/design-decisions-log.md §3.2 fixes that header as
                  título + fecha + marca/dominio only, identical across every
                  console screen; hanging a page-specific action off it broke
                  that contract (founder feedback). */}
              {/* Scope in the label, not in a tooltip. The same brand shows a
                  different mention rate here and on the Overview because this
                  pools EVERY completed scan and that one reads the latest —
                  both correct, and unreadable side by side without saying so.
                  This is the header that actually renders once a project has
                  data; the empty-state copy above carries the same suffix.
                  (I first labelled only that one, which no account with a
                  completed scan ever sees — pilot, PR #313.) */}
              <div className="cm2-sec-lbl">
                Cuota de voz en IA · histórico
                <ManageCompetitorsPanel
                  projectId={projectId}
                  activeCompetitors={activeCompetitors.map((c) => ({ id: c.id, name: c.name, domain: c.domain }))}
                  inactiveCompetitors={inactiveCompetitors.map((c) => ({ id: c.id, name: c.name, domain: c.domain }))}
                />
              </div>
              <div className="card">
                <div className="cm2-rank you">
                  <span className="cm2-rank-n">1</span>
                  {brandFavicon ? (
                    // eslint-disable-next-line @next/next/no-img-element -- external favicon service, not a static asset (same pattern as Overview's panorama)
                    <img src={brandFavicon} alt="" className="cm2-rank-fav-img" width={26} height={26} loading="lazy" />
                  ) : (
                    <span className="cm2-rank-fav" style={{ background: "var(--brand-blue)" }}>
                      {getInitial(project.brand)}
                    </span>
                  )}
                  <div className="cm2-rank-main">
                    <div className="cm2-rank-nm">
                      <span className="cm2-rank-nm-txt">{project.brand}</span>
                      <span className="cm2-rank-you-tag">Tú</span>
                    </div>
                    <div className="cm2-rank-dm">{project.domain}</div>
                  </div>
                  <div className="cm2-rank-extra men">
                    <div className="v">{brandMentionRate}%</div>
                    <div className="l">Mención</div>
                  </div>
                  <div className="cm2-rank-extra cit">
                    <div className="v">{brandCitationRate}%</div>
                    <div className="l">Cita</div>
                  </div>
                  <div className="cm2-rank-bar-wrap">
                    <div className="cm2-rank-bar">
                      <div style={{ width: `${(brandSov / maxSov) * 100}%`, background: "var(--brand-blue)", height: "100%", borderRadius: 99 }} />
                    </div>
                  </div>
                  <div className="cm2-rank-r">
                    <div className="cm2-rank-sov">
                      {brandSov}
                      <small>%</small>
                    </div>
                    {sovDeltas?.brand.deltaPoints != null ? (
                      <div className={`cm2-delta ${sovDeltas.brand.deltaPoints > 0 ? "up" : sovDeltas.brand.deltaPoints < 0 ? "dn" : "fl"}`}>
                        {sovDeltas.brand.deltaPoints > 0 ? "▲" : sovDeltas.brand.deltaPoints < 0 ? "▼" : "—"}{" "}
                        {Math.abs(sovDeltas.brand.deltaPoints)} pt{Math.abs(sovDeltas.brand.deltaPoints) === 1 ? "" : "s"}
                      </div>
                    ) : null}
                  </div>
                </div>

                {competitorRows.map((c, i) => (
                  <PodiumRow key={c.id} projectId={projectId} row={c} rank={i + 2} maxSov={maxSov} />
                ))}
              </div>

              {/* No detections */}
              {competitorRows.every((c) => c.mentions === 0) && (
                <div className="section-empty" style={{ marginTop: 14 }}>
                  <div className="section-empty-title">
                    Ningún competidor fue mencionado en los escaneos analizados
                  </div>
                  <div className="section-empty-desc">
                    Revisa si los prompts son suficientemente comparativos o ajusta la lista de
                    competidores con &ldquo;Gestionar&rdquo;.
                  </div>
                </div>
              )}

              {/* Evolución de la posición media — sits directly under the
                  share-of-voice podium (founder feedback: it was buried at the
                  bottom of the desktop rail). The ranked list repeats the
                  chart's endpoint as a readable number, so "who is ahead right
                  now" doesn't require tracing a line. */}
              <div className="cm2-sec-lbl">Evolución del puesto cuando apareces</div>
              <div className="card cm2-pos-card">
                {hasTrendData ? (
                  <>
                    <div className="cm2-pos-chart">
                      <PositionTrendChart series={trendSeries} data={trendData} maxPosition={maxTrendPosition} />
                    </div>
                    {latestPositions.length > 0 ? (
                      <div className="cm2-pos-list">
                        <div className="cm2-pos-list-hd">
                          Puesto medio · último escaneo
                          {/* Kept short on purpose: InfoTip renders its text as the
                              element's aria-label, and a screen reader announces that
                              in one breath. */}
                          <InfoTip text="Puesto medio en que la IA nombra cada marca, contando solo las respuestas donde aparece. 1,0 es salir siempre la primera. Al lado, en cuántas respuestas aparece." />
                        </div>
                        {latestPositions.map((entry) => (
                          <div className={`cm2-pos-row${entry.isBrand ? " you" : ""}`} key={entry.key}>
                            <span className="cm2-pos-n">{entry.rank}</span>
                            <span className="cm2-pos-nm">{entry.label}</span>
                            {entry.mentionRate != null ? (
                              <span style={{ fontSize: 11.5, color: "var(--ink-4)", fontVariantNumeric: "tabular-nums" }}>
                                {Math.round(entry.mentionRate)}%
                              </span>
                            ) : null}
                            <span className="cm2-pos-v">{entry.position.toFixed(2)}º</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div style={{ padding: "32px 20px", textAlign: "center" }}>
                    <div style={{ fontSize: 13.5, color: "var(--ink-3)" }}>
                      {/* Show progress, not just a gate. A flat "available from
                          2 scans" is a dead end; the count turns it into a
                          countdown the user can act on — and, right after a
                          scoring change, it is also the honest explanation for
                          why a project with plenty of scans still shows zero
                          here (pilot proposal, 2026-08-03). */}
                      Disponible a partir de 2 escaneos con datos de posición.{" "}
                      <b className="tnum">
                        {validTrendPoints} de 2
                      </b>{" "}
                      por ahora.
                    </div>
                  </div>
                )}
              </div>

              {/* Brecha de prompts */}
              {promptGapSummary && (
                <>
                  <div className="cm2-sec-lbl">
                    Brecha de prompts
                    <span style={{ fontWeight: 600, color: "var(--ink-4)" }}>{promptGapSummary.totalPrompts} prompts</span>
                  </div>
                  <PromptGapSection projectId={projectId} summary={promptGapSummary} />
                </>
              )}

              {/* Presencia por motor. Columns come from `matrixEngines`, which
                  drops any engine nobody was mentioned in — an all-zero column
                  is dead space, not a comparison (founder feedback). Needs >= 2
                  surviving columns to still be a comparison at all. */}
              {matrixEngines.length >= 2 ? (
                <>
                  <div className="cm2-sec-lbl">Presencia por motor · tasa de mención</div>
                  <div className="card" style={{ paddingBottom: 6, overflowX: "auto" }}>
                    <table className="cm2-mx">
                      <thead>
                        <tr>
                          <th>Marca</th>
                          {matrixEngines.map((e) => (
                            <th key={e.provider}>{getEngineMeta(e.provider).label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="you">
                          <td>{project.brand}</td>
                          {matrixEngines.map((e) => (
                            <td key={e.provider}>
                              <span className={`cm2-mxc h${Math.min(5, Math.floor(e.mentionRate / 17))}`}>{e.mentionRate}</span>
                            </td>
                          ))}
                        </tr>
                        {competitorRows.map((c) => (
                          <tr key={c.id}>
                            <td>{c.name}</td>
                            {matrixEngines.map((brandE) => {
                              const match = c.engineBreakdown.find((e) => e.provider === brandE.provider);
                              const rate = match?.mentionRate ?? 0;
                              return (
                                <td key={brandE.provider}>
                                  <span className={`cm2-mxc h${Math.min(5, Math.floor(rate / 17))}`}>{rate}</span>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </div>

            <div className="cm2-rail">
              {/* Terreno por tema */}
              {topicComparison.length > 0 && (
                <>
                  <div className="cm2-sec-lbl">Terreno por tema</div>
                  <div className="card">
                    {topicComparison.slice(0, 8).map((t) => (
                      <div className="cm2-tp" key={t.topic}>
                        <div className="cm2-tp-nm">
                          {t.topic}
                          {/* gap < 0 only happens when leaderRate > 0, which only happens when
                              leaderName is set (lib/competitors/topic-comparison.ts) — safe to
                              interpolate leaderName directly in that branch. */}
                          <i>{t.gap > 0 ? "Lideras tú" : t.gap < 0 ? `Lidera ${t.leaderName}` : "Empate"}</i>
                        </div>
                        <div className="cm2-tp-bars">
                          <div className="cm2-tp-b">
                            <div style={{ width: `${t.brandRate}%`, background: "var(--brand-blue)", height: "100%", borderRadius: 99 }} />
                          </div>
                          <div className="cm2-tp-b">
                            <div style={{ width: `${t.leaderRate}%`, background: "var(--ink-4)", height: "100%", borderRadius: 99 }} />
                          </div>
                        </div>
                        <div className={`cm2-tp-v ${t.gap > 0 ? "up" : t.gap < 0 ? "dn" : ""}`}>
                          {t.gap > 0 ? "+" : ""}
                          {t.gap}
                        </div>
                      </div>
                    ))}
                    <div className="cm2-gaplegend">
                      <span>
                        <span className="d" style={{ background: "var(--brand-blue)" }} />
                        Tu marca
                      </span>
                      <span>
                        <span className="d" style={{ background: "var(--ink-4)" }} />
                        Competidor
                      </span>
                    </div>
                  </div>
                </>
              )}

              {/* Competidores sugeridos */}
              {suggestedCompetitorsBlock}
            </div>
          </div>
        ) : null}
        </>
        )}
      </div>
    </div>
  );
}
