import "server-only";

import type { AuthenticatedContext } from "@/lib/auth";
import {
  COVERAGE_OVERLAY_TYPES,
  comparisonFieldsFromEvidence,
  computeComparisonOverlay,
  computeCoverageOverlay,
  type CoverageOverlayEntry
} from "@/lib/recommendations/coverage-overlay";
import { COMPARISON_REC_TYPES, sitemapLocsFromBots } from "@/lib/recommendations/own-comparison-pages";
import { parseCoverageMap } from "@/lib/web-audit/coverage-map";

type OverlayRec = {
  id: string;
  recommendation_type: string;
  confidence: string;
  evidence_json: unknown;
};

function firstResultId(evidence: unknown): string | null {
  const details = (evidence as { affected_prompt_details?: Array<{ id?: unknown }> } | null)?.affected_prompt_details;
  const id = Array.isArray(details) ? details[0]?.id : null;
  return typeof id === "string" ? id : null;
}

function asConfidence(value: string): "low" | "medium" | "high" {
  return value === "low" || value === "high" ? value : "medium";
}

/**
 * The coverage overlay of every card of one run, read the same way by every
 * screen that lists cards (RECS-ALREADY-DONE-1, log §339): Recomendaciones,
 * Visión general and the bell's next step. Prompt cards join the coverage map
 * of THIS run; comparison cards join the sitemap the technical audit keeps
 * plus the pages coverage found. No fetch, only rows we already hold.
 * Any read failure yields fewer entries, never a wrong one.
 */
export async function loadCoverageOverlays(
  supabase: AuthenticatedContext["supabase"],
  params: { projectId: string; runId: string | null; projectDomain: string; recs: readonly OverlayRec[] }
): Promise<Map<string, CoverageOverlayEntry>> {
  const overlay = new Map<string, CoverageOverlayEntry>();
  const { projectId, runId, projectDomain, recs } = params;
  if (!runId || recs.length === 0) return overlay;

  const promptRecs = recs.filter((r) => COVERAGE_OVERLAY_TYPES.has(r.recommendation_type));
  const comparisonRecs = recs.filter((r) => COMPARISON_REC_TYPES.has(r.recommendation_type));
  if (promptRecs.length === 0 && comparisonRecs.length === 0) return overlay;

  const resultIds = promptRecs.map((r) => firstResultId(r.evidence_json)).filter((id): id is string => Boolean(id));

  const [{ data: resultRows }, { data: coverageRow }, { data: snapshotRow }] = await Promise.all([
    resultIds.length > 0
      ? supabase.from("scan_prompt_results").select("id, prompt_id").eq("project_id", projectId).eq("run_id", runId).in("id", resultIds)
      : Promise.resolve({ data: [] as Array<{ id: string; prompt_id: string | null }> }),
    supabase
      .from("generated_solutions")
      .select("sanitized_content")
      .eq("project_id", projectId)
      .eq("generation_type", "domain_coverage")
      .is("recommendation_id", null)
      .eq("status", "completed")
      .eq("is_sanitized", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    comparisonRecs.length > 0
      ? supabase
          .from("web_audit_snapshots")
          .select("bots")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null })
  ]);

  const resultIdToPromptId = new Map(
    ((resultRows ?? []) as Array<{ id: string; prompt_id: string | null }>)
      .filter((row): row is { id: string; prompt_id: string } => Boolean(row.prompt_id))
      .map((row) => [row.id, row.prompt_id])
  );

  const coverage = parseCoverageMap((coverageRow as { sanitized_content: string | null } | null)?.sanitized_content ?? null);
  // Only a coverage map derived from THIS scan counts.
  const coverageTopics = coverage && coverage.scanId === runId ? coverage.topics : [];

  for (const [recId, entry] of computeCoverageOverlay({
    recommendations: promptRecs.map((r) => ({
      id: r.id,
      recommendationType: r.recommendation_type,
      resultId: firstResultId(r.evidence_json),
      confidence: asConfidence(r.confidence)
    })),
    resultIdToPromptId,
    coverageTopics
  })) {
    overlay.set(recId, entry);
  }

  if (comparisonRecs.length > 0) {
    const coveragePageUrls = coverageTopics.flatMap((t) => t.pages.map((p) => p.url));
    for (const [recId, entry] of computeComparisonOverlay({
      recommendations: comparisonRecs.map((r) => ({
        id: r.id,
        recommendationType: r.recommendation_type,
        confidence: asConfidence(r.confidence),
        ...comparisonFieldsFromEvidence(r.evidence_json)
      })),
      siteUrls: [...sitemapLocsFromBots((snapshotRow as { bots?: unknown } | null)?.bots), ...coveragePageUrls],
      projectDomain
    })) {
      overlay.set(recId, entry);
    }
  }

  return overlay;
}
