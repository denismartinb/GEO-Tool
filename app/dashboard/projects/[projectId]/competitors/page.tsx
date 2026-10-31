import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { requireActiveProject } from "@/lib/project-workspace";
import { FirstScanTakeover } from "@/components/first-scan-takeover";
import { computeEntityEngineBreakdown, type EntityEngineBreakdown } from "@/lib/competitors/engine-share";
import { citationRate, mentionRateByAnswer } from "@/lib/metrics/run-metrics";
import { computePromptGapSummary } from "@/lib/competitors/prompt-gap";
import { computeTopicComparison } from "@/lib/competitors/topic-comparison";
import { computeSovDeltas } from "@/lib/competitors/sov-delta";
import { MIN_TREND_POINTS, selectTrendWindow } from "@/lib/competitors/trend-window";
import { defaultVisibleSeriesKeys, orderByLatestRank, rankLatestPositions } from "@/lib/competitors/latest-positions";
import { DEFAULT_VISIBLE_SERIES } from "@/lib/competitors/trend-window";
import { getEngineMeta } from "@/lib/scan/engine-meta";
import { readPosition, type PersistedRankingEntry } from "@/lib/scoring/brand-position-ranking";
import { withAnalysisProgress } from "@/lib/scan/active-run-progress";
import { projectScreenMetadata } from "@/lib/seo/console-metadata";
import { getLLMScanProviders } from "@/lib/scan/providers";
import { Motion } from "@/components/ins/kit/motion";
import { LiveScanCard } from "@/components/ins/overview/live-scan-card";
import { InsCompetitors } from "@/components/ins/competitors/ins-competitors";
import type { RankEntry } from "@/lib/ins/competitors-model";
import type { TrendPoint, TrendSeries } from "@/components/ui/position-trend-chart";

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
  return projectScreenMetadata("Competidores", async () => (await requireActiveProject(projectId)).domain);
}

export default async function CompetitorsPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await requireActiveProject(projectId);
  const { supabase } = await requireUser();

  /* 1. Configured competitors + all completed runs + recent runs (for activeRun detection) + active prompts (for topic map) + the project's own brand-identity alias list (Fase −1c) */
  const [{ data: competitors }, { data: allRuns }, { data: recentRuns }, { data: projectPrompts }, { data: brandAliasesRow }] =
    await Promise.all([
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
      supabase.from("project_prompts").select("id, category").eq("project_id", projectId).eq("is_active", true),
      // requireActiveProject doesn't select brand_aliases (docs/geo-score-
      // variability-2026-08.md §3, Fase −1c), so it's fetched separately here
      // rather than widening that shared helper's select outside this
      // phase's ownership. RLS already scopes this to the owner
      // (projects_select_owner, supabase/migrations/0002_v0_rls.sql).
      supabase.from("projects").select("brand_aliases").eq("id", projectId).maybeSingle()
    ]);
  const brandAliases = (brandAliasesRow?.brand_aliases as string[] | null) ?? [];

  const configuredCompetitors = competitors ?? [];
  const activeCompetitors = configuredCompetitors.filter((c) => c.is_active);
  const inactiveCompetitors = configuredCompetitors.filter((c) => !c.is_active);
  const completedRuns = allRuns ?? [];
  const completedRunIds = completedRuns.map((r) => r.id);
  const rawActiveRun = recentRuns?.find((r) => r.status === "pending" || r.status === "running");
  // EXTRACTION-RELIABILITY-1 Fase C: carries the analysis-stage counters, so
  // the progress bar keeps moving once generation is done instead of pinning
  // at 100% while extraction is still working.
  const activeRun = rawActiveRun ? await withAnalysisProgress(supabase, projectId, rawActiveRun) : rawActiveRun;
  const latestCompletedRun = completedRuns[0] ?? null;
  const previousCompletedRun = completedRuns[1] ?? null;

  const promptCategoryMap = new Map((projectPrompts ?? []).map((p) => [p.id, p.category as string | null]));

  /* 2. Prompt results across ALL completed runs + per-run brand position scores */
  const [{ data: allResults }, { data: runScores }] =
    completedRunIds.length > 0
      ? await Promise.all([
          supabase
            .from("scan_prompt_results")
            .select("extracted_json, run_id, provider, prompt_id, prompt_text_snapshot")
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

  const results = allResults ?? [];

  /* 3. Compute SoV correctly:
       SoV(X) = mentions(X) / (brandMentions + Σ competitorMentions) * 100
  */
  let brandMentions = 0;
  const competitorMentionMap = new Map<string, number>();
  const competitorPromptSet = new Map<string, Set<string>>(); // key → Set<run_id>
  const competitorCitationMap = new Map<string, number>(); // key → count of results citing that competitor's domain
  let brandCitations = 0; // prompts where project domain appears in citations
  let totalResultsCount = results.length;
  // The ranking's «N respuestas · M prompts en K motores» line was removed at
  // Denis's request (log §395); if it comes back, compose it with answerCountLabel.
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

  // TRUST-METRICS-1: routed through lib/metrics/run-metrics.ts instead of
  // computed inline — the module owns both the percentage AND the
  // denominator that produced it, so a rendering site can't silently drop
  // the "de cuántas respuestas" half the way this screen's headline number
  // did before the audit.
  const brandMentionRateMetric = mentionRateByAnswer(brandMentions, totalResultsCount);
  const brandMentionRate = brandMentionRateMetric.percent;
  const brandCitationRateMetric = citationRate(brandCitations, totalResultsCount);
  const brandCitationRate = brandCitationRateMetric.percent;

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

  /* Summary text */
  const hasData = completedRuns.length > 0 && totalResultsCount > 0;

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

  /* What the chart actually draws: informative scans only, most recent window.
     See lib/competitors/trend-window.ts for both defects this fixes. Kept
     separate from `trendData` on purpose — the "último escaneo" list below
     must stay anchored to the real latest run, not to the last point that
     happened to survive this window, or its heading would be a lie. */
  const chartTrendData = selectTrendWindow({ points: trendData });

  // Counted over the visible window, so the countdown copy and the chart can
  // never disagree about how much position data there is.
  const validTrendPoints = chartTrendData.filter((d) => d.values.brand != null).length;
  const hasTrendData = validTrendPoints >= MIN_TREND_POINTS;

  const hasCompetitiveData = activeCompetitors.length > 0 && completedRuns.length > 0;

  // P1-03 (docs/external-audit-2026-08.md, Fase 1): this used to be
  // `filterComparableEngines({ brandBreakdown, competitorBreakdowns })`, which
  // drops an engine when NEITHER the brand NOR any tracked competitor was
  // mentioned on it — so a motor that genuinely ran and answered every prompt
  // vanished from the table entirely if its mention rate was a real zero. The
  // audit caught it directly: Claude was part of the scan and missing from
  // this table. `brandEngineBreakdown` already lists every engine that
  // produced at least one row (`computeEntityEngineBreakdown` never invents a
  // row-less engine — see that function's own header), mentioned or not, so
  // it IS the full column set with no extra filtering. `filterComparableEngines`
  // stays in lib/competitors/engine-share.ts, tested, for the day a screen
  // legitimately needs "engines where SOMEONE scored" rather than "engines
  // that ran" — just not this one.
  const matrixEngines = brandEngineBreakdown;

  // Latest standing per entity, read from the same run_scores ranking the
  // trend chart plots — surfaced as a compact ranked list beside the chart so
  // the current standing is legible without reading a line's endpoint.
  //
  // The ordering and the 1..N ranking live in `rankLatestPositions`
  // (PANORAMA-PARITY-1): the Overview's panorama shows this same list, and
  // when each screen ordered it for itself they disagreed on ties. Everything
  // this block used to explain about ties, means and mention rate now lives in
  // that module's header, next to the code it justifies.
  const latestRunRanking = latestCompletedRun ? (rankingByRun.get(latestCompletedRun.id) ?? []) : [];
  const latestPositions = rankLatestPositions({
    entities: [
      { key: "brand", label: project.brand, isBrand: true },
      ...competitorRows.map((c) => ({ key: c.id, label: c.name, isBrand: false }))
    ],
    ranking: latestRunRanking
  });

  // MEAN-RANK-READS-TRUE-1 (log §177). El gráfico y la tabla comparten tarjeta y
  // hasta ahora no compartían conjunto: `trendSeries` va ordenado por cuota de
  // voz acumulada y el gráfico sólo enciende las cuatro primeras, así que en el
  // proyecto del fundador la tabla encabezaba con Amazon/Chrome/Brave y el
  // gráfico dibujaba Mozilla/Chrome/Safari/Edge. Mismo bloque, dos conjuntos, y
  // nada que lo dijera. Reordenar aquí —no en `trendSeries`— porque el orden que
  // manda es el de la tabla que está justo debajo.
  // El color se asigna DESPUÉS de reordenar, no antes. La paleta está ordenada
  // de más a menos distinguible entre sí (y bajo daltonismo), y el gráfico sólo
  // enciende las cuatro primeras series: asignarla por el orden viejo dejaría a
  // las cuatro visibles con los tonos 0, 3, 5 y 7 en vez de con los cuatro que
  // se eligieron precisamente para verse juntos.
  const chartSeries: TrendSeries[] = orderByLatestRank({
    items: trendSeries,
    rankedKeys: latestPositions.map((entry) => entry.key)
  }).map((series, i) => ({
    ...series,
    color: TREND_SERIES_COLORS[i % TREND_SERIES_COLORS.length]
  }));

  // Cuáles nacen encendidas es OTRA pregunta que en qué orden se listan, y la
  // primera pasada las confundió: con la marca propia siempre primera, encender
  // «las cuatro primeras» dejaba fuera al 4º de la clasificación cuando tu marca
  // era 5ª — o sea, escondía a alguien que te gana (fundador, 2026-08-27; §177).
  //
  // El tope se importa de `trend-window.ts`, NO del componente del gráfico:
  // aquél es `"use client"` y Next convierte sus exports en referencias de
  // cliente al importarlos desde el servidor. Traído de allí, `cap` no era 4,
  // `slice(0, cap)` salía vacío y el gráfico se quedaba con una sola línea.
  const chartVisibleKeys = defaultVisibleSeriesKeys({
    rankedKeys: latestPositions.map((entry) => entry.key),
    brandKey: "brand",
    cap: DEFAULT_VISIBLE_SERIES
  });

  // Mirrors the FirstScanTakeover condition: the mission owns the whole screen
  // (ANIMATION-PARITY-1, log §168), hanging directly off `.page.mrk-fill`.
  const showMissionTakeover = Boolean(activeRun) && completedRuns.length === 0;
  if (activeRun && showMissionTakeover) {
    return (
      <div className="page mrk-fill">
        <FirstScanTakeover projectId={projectId} activeRun={activeRun} domain={project.domain} />
      </div>
    );
  }

  /* ---- «Instrumento» (CONSOLE-INSTRUMENTO-1 F5b, log §374): every figure below
     was already computed above; this only shapes it for the new screen. ---- */
  const positionByKey = new Map(latestPositions.map((e) => [e.key, e]));
  const rankingEntries: RankEntry[] = [
    {
      key: "brand",
      name: project.brand,
      domain: project.domain,
      you: true,
      mentionRate: brandMentionRate,
      citationRate: brandCitationRate,
      meanRank: positionByKey.get("brand")?.position ?? null,
      qualified: positionByKey.get("brand")?.qualified ?? false
    },
    ...competitorRows.map((c) => ({
      key: c.id,
      name: c.name,
      domain: c.domain,
      you: false,
      mentionRate: c.mentionRate,
      citationRate: c.citationRate,
      meanRank: positionByKey.get(c.id)?.position ?? null,
      qualified: positionByKey.get(c.id)?.qualified ?? false
    }))
  ];

  // The rival the AI names most, and the engine where the brand beats it by the widest margin.
  const topByMention = [...competitorRows].sort((a, b) => b.mentionRate - a.mentionRate)[0] ?? null;
  const winsOn = (() => {
    if (!topByMention) return null;
    let best: { provider: string; margin: number } | null = null;
    for (const be of brandEngineBreakdown) {
      const rival = topByMention.engineBreakdown.find((e) => e.provider === be.provider);
      const margin = be.mentionRate - (rival?.mentionRate ?? 0);
      if (margin > 0 && (!best || margin > best.margin)) best = { provider: be.provider, margin };
    }
    return best ? getEngineMeta(best.provider).label : null;
  })();

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "Europe/Madrid" }).replace(".", "");
  const evo =
    hasTrendData && chartTrendData.length > 0
      ? {
          dates: chartTrendData.map((d) => fmtDate(d.date)),
          visibleKeys: chartVisibleKeys,
          series: chartSeries.map((s) => ({
            key: s.key,
            label: s.label,
            isBrand: s.isBrand,
            values: chartTrendData.map((d) => d.values[s.key] ?? null)
          }))
        }
      : null;

  const heat =
    matrixEngines.length >= 2
      ? {
          engines: matrixEngines.map((e) => e.provider),
          rows: [
            {
              key: "brand",
              name: project.brand,
              you: true,
              cells: matrixEngines.map((e) => ({ rate: e.mentionRate, title: `${e.mentions} de ${e.total} respuestas` }))
            },
            ...competitorRows.map((c) => ({
              key: c.id,
              name: c.name,
              you: false,
              cells: matrixEngines.map((brandE) => {
                const match = c.engineBreakdown.find((e) => e.provider === brandE.provider);
                return {
                  rate: match?.mentionRate ?? 0,
                  title: match ? `${match.mentions} de ${match.total} respuestas` : "sin datos en este motor"
                };
              })
            }))
          ]
        }
      : null;

  return (
    <div className="ins">
      <Motion id={`competitors:${projectId}`}>
        <div className="page sc-comp">
          {/* One poller per screen: the card owns the refresh when the run ends. */}
          {activeRun ? (
            <LiveScanCard projectId={projectId} initial={activeRun} providers={getLLMScanProviders()} />
          ) : null}
          <InsCompetitors
            projectId={projectId}
            domain={project.domain}
            brand={project.brand}
            hasData={hasCompetitiveData && hasData}
            hasCompetitors={activeCompetitors.length > 0}
            lead={{
              brand: project.brand,
              hasData: hasCompetitiveData && hasData,
              brandMentionRate,
              top: topByMention ? { name: topByMention.name, mentionRate: topByMention.mentionRate } : null,
              winsOn
            }}
            ranking={rankingEntries}
            aliases={brandAliases}
            evo={evo}
            heat={heat}
            terrain={topicComparison.slice(0, 8)}
            gap={promptGapSummary}
            manage={{
              active: activeCompetitors.map((c) => ({ id: c.id, name: c.name, domain: c.domain })),
              inactive: inactiveCompetitors.map((c) => ({ id: c.id, name: c.name, domain: c.domain }))
            }}
          />
        </div>
      </Motion>
    </div>
  );
}
