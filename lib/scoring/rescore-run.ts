import "server-only";

import type { EngineCoverage } from "@/lib/scan/engine-coverage";
import {
  resolveTechnicalComponent,
  TECHNICAL_SNAPSHOT_LOOKUP_LIMIT
} from "@/lib/scoring/geo-score-technical";
import { computeRunScoresFromResults, SCORING_VERSION } from "@/lib/scoring/run-scoring";
import type { createServiceClient } from "@/lib/supabase/service";

type ServiceClient = ReturnType<typeof createServiceClient>;

/**
 * GEO-SCORE-V4 (docs/adr/0033) — re-score a completed run once its OWN
 * technical audit exists.
 *
 * Why this exists at all: the web audit runs after the scan (docs/adr/0027),
 * so when a run is first scored the audit belonging to it does not exist yet
 * and `technical` resolves to the project's previous snapshot (or is dropped
 * entirely on a first-ever scan). This closes that loop exactly once, when
 * the run's own snapshot lands.
 *
 * Why it is safe to move a published number: in the normal case it does not
 * move. A site's technical readiness does not change in the minutes between
 * a scan finishing and its audit completing, so the run's own snapshot
 * almost always carries the same readiness score the previous one did, and
 * the recomputed composite is identical. When it DOES move, the site
 * genuinely changed between the two audits and the movement is the signal
 * this component was added to capture.
 *
 * Deliberately NOT done here:
 *
 *  - **No score-drop alert.** `checkAndSendScoreDropAlert` fires once, from
 *    the scan's own finalize path. Re-running it here would let one scan send
 *    two alerts about the same run (`.claude/rules/scan.md`: an alert that
 *    fires twice is one that gets ignored).
 *  - **No recommendation regeneration.** Recommendations are generated from
 *    the scan's data, not from the composite, and regenerating them out of
 *    band would rewrite the user's recommendation history after the fact.
 *  - **No touching of scan_runs.** The run is already terminal. Its status,
 *    timestamps and counters describe the scan, which has not changed.
 */
export async function rescoreRunWithTechnicalSnapshot(input: {
  service: ServiceClient;
  projectId: string;
  runId: string;
}): Promise<"rescored" | "unchanged" | "skipped"> {
  const { service, projectId, runId } = input;

  const { data: run } = await service
    .from("scan_runs")
    .select("id, status, finished_at")
    .eq("id", runId)
    .eq("project_id", projectId)
    .maybeSingle();

  // Only completed runs carry a published score to correct. A failed or
  // still-running run has nothing to re-score, and writing one would
  // manufacture a score for a scan that never produced one.
  if (!run || run.status !== "completed") return "skipped";

  const { data: project } = await service
    .from("projects")
    .select("id, domain")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) return "skipped";

  const { data: existingScore } = await service
    .from("run_scores")
    .select("details_json")
    .eq("run_id", runId)
    .maybeSingle();

  const { data: auditSnapshots } = await service
    .from("web_audit_snapshots")
    .select("id, scan_id, readiness_score, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(TECHNICAL_SNAPSHOT_LOOKUP_LIMIT);

  const technicalResolution = resolveTechnicalComponent({
    runId,
    runFinishedAt: run.finished_at ?? new Date(),
    snapshots: auditSnapshots ?? []
  });

  // Nothing to correct unless this run's OWN audit is now available. Falling
  // back to a neighbouring snapshot here would re-run the same resolution the
  // scan already did and rewrite the row for no reason.
  if (technicalResolution.component?.source !== "this_run") return "skipped";

  const previousSnapshotId = readTechnicalSnapshotId(existingScore?.details_json);
  if (previousSnapshotId === technicalResolution.component.snapshot_id) return "unchanged";

  const { data: promptResults } = await service
    .from("scan_prompt_results")
    .select(
      "id, prompt_text_snapshot, brand_mentioned, citation_found, mentioned_competitors_count, citations_count, sentiment, extracted_json, extraction_error, status, brand_snapshot, provider, extraction_version"
    )
    .eq("project_id", projectId)
    .eq("run_id", runId);

  const completed = (promptResults ?? []).filter((row) => row.status === "completed");
  if (completed.length === 0) return "skipped";

  // Preserve the coverage verdict the scan itself recorded, and when there is
  // none, carry null rather than recomputing.
  //
  // Recomputing is not available here even in principle: the EXPECTED engine
  // set comes from the owner's plan at scan time, which this path cannot
  // reconstruct — the plan may have changed since. Deriving "expected" from
  // the observed rows would make every run trivially complete, publishing a
  // verdict nothing verified. An absent verdict is a fact; a fabricated
  // "complete" is a claim (`.claude/rules/scoring.md`: never fill in rows, or
  // conclusions, that were not measured).
  const engineCoverage = readEngineCoverage(existingScore?.details_json);

  const scores = computeRunScoresFromResults(
    completed.map((row) => ({
      id: row.id,
      prompt_text_snapshot: row.prompt_text_snapshot,
      brand_mentioned: row.brand_mentioned,
      citation_found: row.citation_found,
      mentioned_competitors_count: row.mentioned_competitors_count,
      citations_count: row.citations_count,
      sentiment: row.sentiment,
      extracted_json: row.extracted_json,
      extraction_error: row.extraction_error,
      brand_snapshot: row.brand_snapshot,
      provider: row.provider,
      extraction_version: row.extraction_version
    })),
    project.domain as string,
    {
      technical: technicalResolution.component,
      technicalReason: technicalResolution.reason,
      engineCoverage
    }
  );

  await service.from("run_scores").upsert(
    {
      run_id: runId,
      project_id: projectId,
      scoring_version: SCORING_VERSION,
      visibility_score: scores.visibility_score,
      citation_score: scores.citation_score,
      competitor_gap_score: scores.competitor_gap_score,
      confidence: scores.confidence,
      details_json: scores.details_json
    },
    { onConflict: "run_id" }
  );

  return "rescored";
}

function readTechnicalSnapshotId(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  const geoScore = (details as Record<string, unknown>).geo_score;
  if (!geoScore || typeof geoScore !== "object") return null;
  const snapshot = (geoScore as Record<string, unknown>).technical_snapshot;
  if (!snapshot || typeof snapshot !== "object") return null;
  const id = (snapshot as Record<string, unknown>).snapshot_id;
  return typeof id === "string" ? id : null;
}

function readEngineCoverage(details: unknown): EngineCoverage | null {
  if (!details || typeof details !== "object") return null;
  const geoScore = (details as Record<string, unknown>).geo_score;
  if (!geoScore || typeof geoScore !== "object") return null;
  const coverage = (geoScore as Record<string, unknown>).engine_coverage;
  if (!coverage || typeof coverage !== "object") return null;
  return coverage as EngineCoverage;
}
