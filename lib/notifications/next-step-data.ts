import "server-only";

import { computeRecommendationPotentialPoints, type ScoreInputRow } from "@/lib/scoring/run-scoring";
import { selectPlan } from "@/lib/recommendations/plan";
import { isAlreadyCovered } from "@/lib/recommendations/coverage-overlay";
import { loadCoverageOverlays } from "@/lib/recommendations/coverage-overlay-data";
import type { AuthenticatedContext } from "@/lib/auth";
import type { NextStepNotice } from "@/lib/notifications/next-step";

type RecRow = {
  id: string;
  title: string;
  recommendation_type: string;
  impact: string;
  effort: string;
  priority_rank: number;
  confidence: string;
  consecutive_runs_open?: number;
  evidence_json: { affected_prompt_ids?: unknown } | null;
};

function affectedIds(evidence: RecRow["evidence_json"]): string[] {
  const ids = evidence?.affected_prompt_ids;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

/**
 * The first action of the project's Recomendaciones plan (NOTIF-LANES-1, log
 * §297). Same rows and same owners as the screen
 * (`recommendations/page.tsx`) and the report (`lib/report/report-data.ts`):
 * active recommendations of the latest completed scan, potential points from
 * `computeRecommendationPotentialPoints`, order from `selectPlan`. Nothing is
 * recomputed here, so the bell can never name an action the screen does not
 * put first.
 *
 * The project comes from the caller, already one of the user's own (RLS scopes
 * every read too). Any failure means no notice: the bell must never break the
 * console.
 */
export async function getNextStepNotice(
  supabase: AuthenticatedContext["supabase"],
  project: { id: string; domain: string }
): Promise<NextStepNotice | null> {
  try {
    const { data: run } = await supabase
      .from("scan_runs")
      .select("id")
      .eq("project_id", project.id)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!run) return null;

    const [{ data: recRows }, { data: resultRows }] = await Promise.all([
      supabase
        .from("recommendations")
        .select("id, title, recommendation_type, impact, effort, confidence, priority_rank, consecutive_runs_open, evidence_json")
        .eq("project_id", project.id)
        .eq("run_id", run.id)
        .eq("status", "active")
        .order("priority_rank", { ascending: true }),
      supabase
        .from("scan_prompt_results")
        .select(
          "id, prompt_text_snapshot, brand_mentioned, citation_found, mentioned_competitors_count, citations_count, sentiment, extracted_json, extraction_error, brand_snapshot, provider, extraction_version"
        )
        .eq("project_id", project.id)
        .eq("run_id", run.id)
    ]);

    // RECS-ALREADY-DONE-1 (log §339): a card whose page already exists is
    // under «Resueltas» on the screen, so it is never the next step either.
    const activeRecs = (recRows ?? []) as RecRow[];
    const overlays = await loadCoverageOverlays(supabase, {
      projectId: project.id,
      runId: run.id,
      projectDomain: project.domain,
      recs: activeRecs
    });
    const recs = activeRecs.filter((r) => !isAlreadyCovered(r.recommendation_type, overlays.get(r.id)));
    if (recs.length === 0) return null;

    const results = ((resultRows ?? []) as ScoreInputRow[]).map((r) => ({
      ...r,
      mentioned_competitors_count: r.mentioned_competitors_count ?? 0,
      citations_count: r.citations_count ?? 0
    }));
    const ranked = recs.map((r) => ({
      ...r,
      potentialPoints:
        results.length > 0
          ? (computeRecommendationPotentialPoints(results, project.domain, r.recommendation_type, affectedIds(r.evidence_json))
              ?.deltaPoints ?? null)
          : null
    }));

    const first = selectPlan(ranked)[0];
    if (!first) return null;
    return {
      projectId: project.id,
      domain: project.domain,
      recommendationId: first.id,
      title: first.title,
      potentialPoints: first.potentialPoints
    };
  } catch (error) {
    console.error("getNextStepNotice failed", error instanceof Error ? error.message : "unknown");
    return null;
  }
}
