import "server-only";

import { parseCoverageMap, COULD_NOT_VERIFY_NOTE } from "@/lib/web-audit/coverage-map";
import { buildTechnicalIssuesReport } from "@/lib/web-audit/issues";
import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";
import type { BotAccessReport } from "@/lib/web-audit/robots";
import { computeRecommendationPotentialPoints, type ScoreInputRow } from "@/lib/scoring/run-scoring";
import { selectPlan } from "@/lib/recommendations/plan";
import { computeCoverageOverlay, isSiteRoot, overlayCopy } from "@/lib/recommendations/coverage-overlay";
import { GEO_SCORE_LOOKBACK_ROWS, resolveGeoScore, type GeoScoreRunRow } from "@/lib/metrics/run-metrics";
import { buildReportTechChecks } from "@/lib/report/report-tech";
import type { ReportAnswer, ReportCoverage, ReportInput, ReportPlanItem } from "@/lib/report/report-model";

/**
 * GEO-REPORT-1 Fase 2 — reads the rows `buildReportModel` needs, for the
 * project's latest completed scan. Same shape as `lib/web-audit/page-data.ts`:
 * the authenticated client comes in already resolved (RLS scopes every read
 * to the owner), and this module only decides which rows.
 *
 * Every figure it hands over is read from the owner of that figure, never
 * recomputed here (`.claude/rules/report.md`):
 *  - the Puntuación GEO through `resolveGeoScore` with the same lookback as
 *    every other screen (TRUST-METRICS-1);
 *  - the technical score and checks through `buildTechnicalIssuesReport`, as
 *    Auditoría web shows them;
 *  - the plan through `selectPlan` over the same potential points the
 *    Recomendaciones page computes, so the report's three actions are the
 *    screen's three actions.
 */

type SupabaseLike = {
  // Same bounded `any` as page-data.ts: the PostgREST builder is chainable and
  // generic, and all this module does is call `from`.
  from: (table: string) => any;
};

export type ReportProject = { id: string; name: string; brand: string | null; domain: string };

type ResultRow = ScoreInputRow & {
  prompt_id: string | null;
  raw_response_text: string | null;
};

type RecRow = {
  id: string;
  title: string;
  description: string;
  recommendation_type: string;
  impact: string;
  effort: string;
  priority_rank: number;
  confidence?: string | null;
  consecutive_runs_open?: number;
  evidence_json: {
    first_step?: string | null;
    affected_prompt_ids?: unknown;
    affected_prompt_details?: Array<{ id?: string | null; provider?: string | null }> | null;
  } | null;
};

function affectedIds(evidence: RecRow["evidence_json"]): string[] {
  const ids = evidence?.affected_prompt_ids;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

/** Null when the project has no completed scan with usable answers. */
export async function loadReportInput({
  supabase,
  project
}: {
  supabase: SupabaseLike;
  project: ReportProject;
}): Promise<ReportInput | null> {
  const projectId = project.id;
  const { data: run } = await supabase
    .from("scan_runs")
    .select("id, created_at, finished_at")
    .eq("project_id", projectId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!run) return null;

  const [
    { data: resultRows },
    { data: promptRows },
    { data: competitorRows },
    { data: aliasRow },
    { data: scoreRows },
    { data: coverageRows },
    { data: auditRow },
    { data: recRows }
  ] = await Promise.all([
    supabase
      .from("scan_prompt_results")
      .select(
        "id, prompt_id, prompt_text_snapshot, provider, raw_response_text, brand_mentioned, citation_found, mentioned_competitors_count, citations_count, sentiment, extracted_json, extraction_error, brand_snapshot, extraction_version"
      )
      .eq("project_id", projectId)
      .eq("run_id", run.id),
    supabase.from("project_prompts").select("id, category").eq("project_id", projectId),
    supabase.from("project_competitors").select("name, domain").eq("project_id", projectId).eq("is_active", true),
    // Its own query, like every column added by a later migration: an
    // unapplied 0025 must cost the aliases, not the whole report.
    supabase.from("projects").select("brand_aliases").eq("id", projectId).maybeSingle(),
    supabase
      .from("run_scores")
      .select("run_id, created_at, visibility_score, details_json")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(GEO_SCORE_LOOKBACK_ROWS),
    supabase
      .from("generated_solutions")
      .select("sanitized_content, created_at")
      .eq("project_id", projectId)
      .eq("generation_type", "domain_coverage")
      .is("recommendation_id", null)
      .eq("status", "completed")
      .eq("is_sanitized", true)
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("web_audit_snapshots")
      .select("pages, bots")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("recommendations")
      .select(
        "id, title, description, recommendation_type, impact, effort, confidence, priority_rank, consecutive_runs_open, evidence_json"
      )
      .eq("project_id", projectId)
      .eq("run_id", run.id)
      .eq("status", "active")
      .order("priority_rank", { ascending: true })
  ]);

  const results = (resultRows ?? []) as ResultRow[];
  const categoryByPrompt = new Map(
    ((promptRows ?? []) as Array<{ id: string; category: string | null }>).map((p) => [p.id, p.category])
  );

  // An answer nothing could extract carries no verdict: counting it as "not
  // named" would invent a miss (scan rules, "no mute rows").
  const answers: ReportAnswer[] = results
    .filter((r) => r.prompt_id && r.extracted_json && !r.extraction_error)
    .map((r) => ({
      promptId: r.prompt_id as string,
      promptText: r.prompt_text_snapshot,
      topic: categoryByPrompt.get(r.prompt_id as string) ?? null,
      provider: r.provider ?? null,
      rawText: r.raw_response_text,
      extracted: r.extracted_json
    }));
  if (answers.length === 0) return null;

  const geoScoreRows = (scoreRows ?? []) as GeoScoreRunRow[];
  const geoScore = geoScoreRows.length > 0 ? resolveGeoScore(geoScoreRows).value : null;

  const coverageMap = ((coverageRows ?? []) as Array<{ sanitized_content: string | null }>)
    .map((row) => parseCoverageMap(row.sanitized_content))
    .find((map) => map?.scanId === run.id);
  let coverage: Record<string, ReportCoverage> | null = null;
  if (coverageMap) {
    coverage = {};
    for (const t of coverageMap.topics) {
      // A topic whose only own page is the home is not certified as covered
      // (GS-03, log §276): same verdict as the Recomendaciones overlay.
      const homeOnly = t.found && t.pages.length > 0 && t.pages.every((p) => isSiteRoot(p.url));
      coverage[t.promptId] = homeOnly ? "unknown" : t.found ? "yes" : t.note === COULD_NOT_VERIFY_NOTE ? "unknown" : "no";
    }
  }

  const audit = auditRow as { pages: PageAuditEntry[] | null; bots: BotAccessReport | null } | null;
  let technical: ReportInput["technical"] = null;
  if (audit?.pages && audit.bots) {
    const issuesReport = buildTechnicalIssuesReport(audit.pages, audit.bots);
    technical = { score: issuesReport.actualReadinessScore, checks: buildReportTechChecks(issuesReport) };
  }

  const resultById = new Map(results.map((r) => [r.id, r]));
  const recs = ((recRows ?? []) as RecRow[]).map((r) => ({
    ...r,
    potentialPoints:
      results.length > 0
        ? (computeRecommendationPotentialPoints(results, project.domain, r.recommendation_type, affectedIds(r.evidence_json))
            ?.deltaPoints ?? null)
        : null
  }));
  // GS-03 (log §276): the plan's first step goes through the same coverage
  // overlay as the Recomendaciones card, so the report never says "crea una
  // página" where the screen says "refuerza la que ya tienes".
  const overlayByRecId = computeCoverageOverlay({
    recommendations: recs.map((r) => ({
      id: r.id,
      recommendationType: r.recommendation_type,
      resultId: r.evidence_json?.affected_prompt_details?.[0]?.id ?? null,
      confidence: r.confidence === "high" || r.confidence === "medium" ? r.confidence : "low"
    })),
    resultIdToPromptId: new Map(
      results.filter((r) => r.prompt_id).map((r) => [r.id as string, r.prompt_id as string])
    ),
    coverageTopics: coverageMap?.topics ?? []
  });
  const plan: ReportPlanItem[] = selectPlan(recs).map((r) => {
    const overlay = overlayByRecId.get(r.id);
    const overlayStep = overlay ? overlayCopy(r.recommendation_type, overlay.state)?.firstStep : null;
    const topics = new Set<string>();
    for (const id of affectedIds(r.evidence_json)) {
      const promptId = resultById.get(id)?.prompt_id;
      const topic = promptId ? categoryByPrompt.get(promptId)?.trim() : null;
      if (topic) topics.add(topic);
    }
    return {
      title: r.title,
      description: r.description,
      firstStep: overlayStep ?? r.evidence_json?.first_step ?? null,
      providers: (r.evidence_json?.affected_prompt_details ?? [])
        .map((d) => d?.provider)
        .filter((p): p is string => typeof p === "string" && p.length > 0),
      topics: [...topics]
    };
  });

  const aliases = (aliasRow as { brand_aliases?: unknown } | null)?.brand_aliases;
  return {
    brandName: project.brand?.trim() || project.name,
    brandAliases: Array.isArray(aliases) ? aliases.filter((a): a is string => typeof a === "string") : [],
    domain: project.domain,
    scanDate: (run.finished_at ?? run.created_at) as string,
    geoScore,
    answers,
    competitors: ((competitorRows ?? []) as Array<{ name: string; domain: string | null }>).map((c) => ({
      name: c.name,
      domain: c.domain
    })),
    coverage,
    technical,
    plan
  };
}
