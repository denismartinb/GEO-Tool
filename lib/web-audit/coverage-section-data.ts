import "server-only";

import { parseCoverageMap, type DomainCoverageMap } from "@/lib/web-audit/coverage-map";
import { isProOrAbove, resolveEffectivePlanId } from "@/lib/billing";
import {
  buildWebAuditSummary,
  buildCitationWindowCandidates,
  type PromptResultLite,
  type ClassifiedTopic,
  type TopicOutcome,
  type WebAuditSummary
} from "@/lib/web-audit/opportunity-matrix";
import { buildCoverageTrend, type CoverageTrendPoint } from "@/lib/web-audit/trend";
import { isDeltaTrustworthy } from "@/lib/web-audit/sample-confidence";
import { WEB_AUDIT_JOB_TYPE } from "@/lib/web-audit/audit-job";
import { deriveAuditPillState, type AuditPillState } from "@/lib/web-audit/audit-liveness";

/**
 * The coverage map («¿tu web publica algo sobre cada tema, y la IA lo cita?»)
 * as Páginas citadas shows it (SEARCH-SEO-1 Fase 1b, log §271).
 *
 * It lived inside the Auditoría web loader (`page-data.ts`) until the screen
 * became Auditoría SEO. Coverage is about AI answers, not about how Google
 * sees the site, so it moved next to the citations it is cross-checked
 * against. The calculations are unchanged; they were cut out of
 * `loadWebAuditPageData`, not rewritten.
 *
 * Same contract as that loader: it receives an authenticated client and
 * returns data, and it never dispatches anything.
 */

export type CoverageSectionProject = { id: string; domain: string };

export type CoverageSectionData = {
  /** Pro gate, read raw from `profiles.current_plan` (`.claude/rules/web-audit.md`). */
  canAuditCoverage: boolean;
  summary: WebAuditSummary | null;
  grouped: Record<TopicOutcome, ClassifiedTopic[]>;
  trend: CoverageTrendPoint[];
  latestMap: DomainCoverageMap | null;
  /** The scan the latest map audited, when it is the latest completed scan. */
  auditedScanDate: string | null;
  coverageDelta: number | null;
  surfacingDelta: number | null;
  /** A coverage campaign still running for the latest scan. */
  activeCampaignProgress: { covered: number; total: number } | null;
  auditPillState: AuditPillState;
};

type SupabaseLike = {
  // Same deliberate `any` as `page-data.ts`: the PostgREST builder is
  // chainable and generic, and this module only ever calls `from`.
  from: (table: string) => any;
};

export async function loadCoverageSectionData({
  supabase,
  userId,
  project
}: {
  supabase: SupabaseLike;
  userId: string;
  project: CoverageSectionProject;
}): Promise<CoverageSectionData> {
  const projectId = project.id;

  const [{ data: profileRow }, { data: latestRunRow }, { data: historyRows }, { data: activeCampaignRow }] =
    await Promise.all([
      supabase.from("profiles").select("current_plan, email").eq("id", userId).maybeSingle(),
      supabase
        .from("scan_runs")
        .select("id, finished_at, created_at")
        .eq("project_id", projectId)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("generated_solutions")
        .select("sanitized_content, created_at")
        .eq("project_id", projectId)
        .eq("generation_type", "domain_coverage")
        .is("recommendation_id", null)
        .eq("status", "completed")
        .eq("is_sanitized", true)
        .order("created_at", { ascending: false })
        .limit(12),
      // WEB-AUDIT-CHAIN: a campaign left "running" for the current scan, read
      // server-side (not from client-only state) so it survives a full reload.
      supabase
        .from("generated_solutions")
        .select("sanitized_content, updated_at")
        .eq("project_id", projectId)
        .eq("generation_type", "domain_coverage")
        .is("recommendation_id", null)
        .eq("status", "running")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ]);

  const profile = profileRow as { current_plan?: string; email?: string } | null;
  const canAuditCoverage = isProOrAbove(resolveEffectivePlanId(profile?.current_plan, profile?.email));

  const activeCampaignMap = parseCoverageMap(activeCampaignRow?.sanitized_content ?? null);
  const hasActiveCampaign = Boolean(activeCampaignMap && latestRunRow && activeCampaignMap.scanId === latestRunRow.id);

  // WEB-AUDIT-DRIVE-1: the audit job for this run, read through RLS
  // (`jobs_select_owner`). The pill may only claim the audit is moving when
  // both the campaign row and the job say so (`deriveAuditPillState`).
  const { data: auditJobRow } = latestRunRow
    ? await supabase
        .from("jobs")
        .select("status")
        .eq("project_id", projectId)
        .eq("run_id", latestRunRow.id)
        .eq("job_type", WEB_AUDIT_JOB_TYPE)
        .maybeSingle()
    : { data: null };

  const auditPillState = deriveAuditPillState({
    campaignUpdatedAt: hasActiveCampaign ? activeCampaignRow?.updated_at : null,
    jobStatus: auditJobRow?.status
  });

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

  // WEB-AUDIT-R6 phase 2: citation is classified over a fixed window of recent
  // scans, not just the latest one (see `opportunity-matrix.ts`) — the same
  // deduped candidates list drives both this summary and every trend point.
  const citationWindowCandidates = buildCitationWindowCandidates(maps, resultsByScanId);
  const summary = latestMap
    ? buildWebAuditSummary({ coverage: latestMap, citationWindowCandidates, projectDomain: project.domain })
    : null;
  const trend = buildCoverageTrend({ maps, resultsByScanId, projectDomain: project.domain });

  const auditedScanDate =
    latestMap && latestMap.scanId === latestRunRow?.id
      ? (latestRunRow?.finished_at ?? latestRunRow?.created_at ?? null)
      : null;

  // WEB-AUDIT-R6 phase 1: coverage is sampled from a noisy sensor, so a delta
  // is only shown when BOTH points clear SMALL_SAMPLE_THRESHOLD
  // (`isDeltaTrustworthy`). The tile always shows the real fraction.
  const previousPoint = trend.length >= 2 ? trend[trend.length - 2] : null;

  const previousCoveragePct = previousPoint?.coveragePct ?? null;
  const coverageDelta =
    previousPoint !== null &&
    isDeltaTrustworthy(summary?.conclusiveCount ?? 0, previousPoint.conclusiveCount) &&
    summary?.coveragePct != null &&
    previousCoveragePct !== null
      ? summary.coveragePct - previousCoveragePct
      : null;

  const previousSurfacingPct = previousPoint?.surfacingPct ?? null;
  const surfacingDelta =
    previousPoint !== null &&
    isDeltaTrustworthy(summary?.coveredCount ?? 0, previousPoint.coveredCount) &&
    summary?.surfacingPct != null &&
    previousSurfacingPct !== null
      ? summary.surfacingPct - previousSurfacingPct
      : null;

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

  return {
    canAuditCoverage,
    summary,
    grouped,
    trend,
    latestMap,
    auditedScanDate,
    coverageDelta,
    surfacingDelta,
    activeCampaignProgress,
    auditPillState
  };
}
