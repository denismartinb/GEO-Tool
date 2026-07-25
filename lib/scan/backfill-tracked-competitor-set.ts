import "server-only";

import { reconcileExtractedCompetitors } from "@/lib/scan/extraction";
import { EXTRACTION_VERSION } from "@/lib/scan/constants";
import { computeRunScoresFromResults, getEffectiveGeoScore, type ScoreInputRow } from "@/lib/scoring/run-scoring";
import type { ExtractionOutput } from "@/lib/extraction/schema";
import type { createServiceClient } from "@/lib/supabase/service";

/**
 * SCAN-TRACKED-SET-2 (docs/adr/0018) — deterministic backfill for
 * scan_prompt_results/run_scores rows extracted before SCAN-TRACKED-SET-1
 * (PR #261). Pure logic lives here, fully unit-testable; the thin CLI
 * wrapper (scripts/backfill-tracked-competitor-set.ts) supplies the real
 * Supabase service client and prints the report.
 *
 * Phase 1 (this file, as currently used): DRY-RUN ONLY. runBackfillDryRun
 * performs reads only — no update()/upsert() call exists anywhere in this
 * module yet. The write pass is a deliberately separate, not-yet-built
 * follow-up gated on the founder reviewing this dry-run's real output
 * (Task Intake SCAN-TRACKED-SET-2, approved 2026-07-24 for the dry-run
 * only).
 */

type ServiceClient = ReturnType<typeof createServiceClient>;

export type BackfillSourceRow = {
  id: string;
  run_id: string;
  project_id: string;
  status: string;
  extracted_json: unknown;
  competitors_snapshot: Array<{ name?: string | null }> | null;
  mentioned_competitors_count: number | null;
  extraction_version: string | null;
  brand_snapshot: string | null;
  brand_mentioned: boolean;
  citation_found: boolean;
  citations_count: number | null;
  sentiment: ScoreInputRow["sentiment"];
  extraction_error: string | null;
  provider: string | null;
  prompt_text_snapshot: string;
};

export type RowReconciliation =
  | { touched: false }
  | { touched: true; extracted_json: ExtractionOutput; mentioned_competitors_count: number };

function round2(n: number): number {
  return Number(n.toFixed(2));
}

/**
 * Reconciles a single row's extracted_json against its OWN
 * competitors_snapshot — the tracked list AT SCAN TIME, which is the
 * correct reference (mirrors extraction.ts's real, live pipeline; not
 * today's live project_competitors, which may have changed since). Pure,
 * no I/O.
 *
 * Returns `touched: false` when the row is already current
 * (extraction_version matches), has no extraction to reconcile, or has no
 * snapshot to reconcile against — in every "not touched" case the row's
 * existing data is used as-is for scoring (see toScoreInputRow), it's just
 * not eligible to have its extraction_version bumped by this backfill.
 */
export function reconcileRowForBackfill(
  row: Pick<BackfillSourceRow, "extracted_json" | "competitors_snapshot" | "extraction_version">
): RowReconciliation {
  if (row.extraction_version === EXTRACTION_VERSION) return { touched: false };
  if (!row.extracted_json || typeof row.extracted_json !== "object") return { touched: false };
  if (!Array.isArray(row.competitors_snapshot)) return { touched: false };

  const trackedNames = row.competitors_snapshot
    .map((c) => (c?.name ? String(c.name) : ""))
    .filter((name) => name.length > 0);

  const reconciled = reconcileExtractedCompetitors(row.extracted_json as ExtractionOutput, trackedNames);
  return {
    touched: true,
    extracted_json: reconciled,
    mentioned_competitors_count: reconciled.competitors.filter((c) => c.mentioned).length
  };
}

/** Converts a source row (+ its reconciliation outcome) into the ScoreInputRow shape computeRunScoresFromResults expects. */
export function toScoreInputRow(row: BackfillSourceRow, reconciliation: RowReconciliation): ScoreInputRow {
  return {
    id: row.id,
    prompt_text_snapshot: row.prompt_text_snapshot,
    brand_mentioned: row.brand_mentioned,
    citation_found: row.citation_found,
    mentioned_competitors_count: reconciliation.touched
      ? reconciliation.mentioned_competitors_count
      : (row.mentioned_competitors_count ?? 0),
    citations_count: row.citations_count ?? 0,
    sentiment: row.sentiment,
    extracted_json: reconciliation.touched ? reconciliation.extracted_json : row.extracted_json,
    extraction_error: row.extraction_error,
    brand_snapshot: row.brand_snapshot,
    provider: row.provider,
    extraction_version: reconciliation.touched ? EXTRACTION_VERSION : row.extraction_version
  };
}

export type RunBackfillReport = {
  run_id: string;
  project_id: string;
  rows_total: number;
  rows_touched: number;
  previous_geo_score: number | null;
  new_geo_score: number;
  geo_score_delta: number | null;
  prominence_flip: "value_to_null" | "null_to_value" | "unchanged";
  standing_flip: "value_to_null" | "null_to_value" | "unchanged";
};

function componentValue(detailsJson: unknown, key: "prominence" | "standing"): number | null | undefined {
  if (!detailsJson || typeof detailsJson !== "object") return undefined;
  const geoScore = (detailsJson as Record<string, unknown>).geo_score;
  if (!geoScore || typeof geoScore !== "object") return undefined;
  const components = (geoScore as Record<string, unknown>).components;
  if (!components || typeof components !== "object") return undefined;
  const component = (components as Record<string, unknown>)[key];
  if (!component || typeof component !== "object") return undefined;
  return (component as Record<string, unknown>).value as number | null;
}

function flipDirection(
  before: number | null | undefined,
  after: number | null | undefined
): RunBackfillReport["prominence_flip"] {
  const beforeNull = before === null || before === undefined;
  const afterNull = after === null || after === undefined;
  if (beforeNull === afterNull) return "unchanged";
  return beforeNull ? "null_to_value" : "value_to_null";
}

/**
 * Computes the reconciliation + rescoring outcome for one run, given
 * ALREADY-FETCHED rows and the previous run_scores row — no I/O. Returns
 * `null` when the run needs no backfill (every completed row is already
 * on the current extraction_version).
 */
export function computeRunBackfill(input: {
  run_id: string;
  project_id: string;
  project_domain: string;
  rows: BackfillSourceRow[]; // all rows for this run, any status
  previous: { visibility_score: number | null; details_json: unknown } | null;
}): {
  report: RunBackfillReport;
  touchedRowUpdates: Array<{ id: string; extracted_json: unknown; mentioned_competitors_count: number; extraction_version: string }>;
  newScores: ReturnType<typeof computeRunScoresFromResults>;
} | null {
  const completedRows = input.rows.filter((r) => r.status === "completed");
  const reconciliations = completedRows.map((row) => reconcileRowForBackfill(row));
  const touchedCount = reconciliations.filter((r) => r.touched).length;

  if (touchedCount === 0) return null;

  const scoreInputRows = completedRows.map((row, i) => toScoreInputRow(row, reconciliations[i]));
  const newScores = computeRunScoresFromResults(scoreInputRows, input.project_domain);

  const previousGeoScore = input.previous
    ? getEffectiveGeoScore({ visibility_score: input.previous.visibility_score ?? 0, details_json: input.previous.details_json })
    : null;
  const newGeoScore = getEffectiveGeoScore({ visibility_score: newScores.visibility_score, details_json: newScores.details_json });

  const touchedRowUpdates = completedRows
    .map((row, i) => ({ row, reconciliation: reconciliations[i] }))
    .filter((entry): entry is { row: BackfillSourceRow; reconciliation: Extract<RowReconciliation, { touched: true }> } => entry.reconciliation.touched)
    .map(({ row, reconciliation }) => ({
      id: row.id,
      extracted_json: reconciliation.extracted_json,
      mentioned_competitors_count: reconciliation.mentioned_competitors_count,
      extraction_version: EXTRACTION_VERSION
    }));

  const report: RunBackfillReport = {
    run_id: input.run_id,
    project_id: input.project_id,
    rows_total: completedRows.length,
    rows_touched: touchedCount,
    previous_geo_score: previousGeoScore,
    new_geo_score: newGeoScore,
    geo_score_delta: previousGeoScore === null ? null : round2(newGeoScore - previousGeoScore),
    prominence_flip: flipDirection(componentValue(input.previous?.details_json, "prominence"), componentValue(newScores.details_json, "prominence")),
    standing_flip: flipDirection(componentValue(input.previous?.details_json, "standing"), componentValue(newScores.details_json, "standing"))
  };

  return { report, touchedRowUpdates, newScores };
}

const FETCH_PAGE_SIZE = 1000;
const RUN_SCORES_CHUNK_SIZE = 200;

async function fetchAllScanPromptResults(service: ServiceClient): Promise<BackfillSourceRow[]> {
  const rows: BackfillSourceRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await service
      .from("scan_prompt_results")
      .select(
        "id, run_id, project_id, status, extracted_json, competitors_snapshot, mentioned_competitors_count, extraction_version, brand_snapshot, brand_mentioned, citation_found, citations_count, sentiment, extraction_error, provider, prompt_text_snapshot"
      )
      .range(from, from + FETCH_PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to fetch scan_prompt_results: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...(data as unknown as BackfillSourceRow[]));
    if (data.length < FETCH_PAGE_SIZE) break;
    from += FETCH_PAGE_SIZE;
  }
  return rows;
}

export type BackfillDryRunResult = {
  rows_scanned: number;
  runs_scanned: number;
  runs_needing_backfill: number;
  runs_skipped_no_project_domain: number;
  reports: RunBackfillReport[];
};

/**
 * Read-only. Scans every scan_prompt_results row, groups by run, and
 * computes what SCAN-TRACKED-SET-2's write pass WOULD change — without
 * changing anything. No update()/upsert() call exists in this function.
 */
export async function runBackfillDryRun(service: ServiceClient): Promise<BackfillDryRunResult> {
  const allRows = await fetchAllScanPromptResults(service);

  const rowsByRun = new Map<string, BackfillSourceRow[]>();
  for (const row of allRows) {
    const list = rowsByRun.get(row.run_id) ?? [];
    list.push(row);
    rowsByRun.set(row.run_id, list);
  }

  const projectIds = Array.from(new Set(allRows.map((r) => r.project_id)));
  const domainByProject = new Map<string, string>();
  if (projectIds.length > 0) {
    const { data: projects, error: projectsError } = await service.from("projects").select("id, domain").in("id", projectIds);
    if (projectsError) throw new Error(`Failed to fetch projects: ${projectsError.message}`);
    for (const project of projects ?? []) {
      domainByProject.set(project.id as string, project.domain as string);
    }
  }

  const runIds = Array.from(rowsByRun.keys());
  const previousByRun = new Map<string, { visibility_score: number | null; details_json: unknown }>();
  for (let i = 0; i < runIds.length; i += RUN_SCORES_CHUNK_SIZE) {
    const chunk = runIds.slice(i, i + RUN_SCORES_CHUNK_SIZE);
    const { data, error } = await service.from("run_scores").select("run_id, visibility_score, details_json").in("run_id", chunk);
    if (error) throw new Error(`Failed to fetch run_scores: ${error.message}`);
    for (const row of data ?? []) {
      previousByRun.set(row.run_id as string, { visibility_score: row.visibility_score as number | null, details_json: row.details_json });
    }
  }

  const reports: RunBackfillReport[] = [];
  let runsSkippedNoDomain = 0;

  for (const [runId, rows] of rowsByRun) {
    const projectId = rows[0].project_id;
    const domain = domainByProject.get(projectId);
    if (!domain) {
      runsSkippedNoDomain += 1;
      continue;
    }
    const outcome = computeRunBackfill({
      run_id: runId,
      project_id: projectId,
      project_domain: domain,
      rows,
      previous: previousByRun.get(runId) ?? null
    });
    if (outcome) reports.push(outcome.report);
  }

  return {
    rows_scanned: allRows.length,
    runs_scanned: rowsByRun.size,
    runs_needing_backfill: reports.length,
    runs_skipped_no_project_domain: runsSkippedNoDomain,
    reports
  };
}

export type BackfillDrySummary = {
  rows_scanned: number;
  runs_scanned: number;
  runs_needing_backfill: number;
  runs_skipped_no_project_domain: number;
  avg_geo_score_delta: number | null;
  median_geo_score_delta: number | null;
  min_geo_score_delta: number | null;
  max_geo_score_delta: number | null;
  prominence_flip_count: number;
  standing_flip_count: number;
};

export function summarizeDryRun(result: BackfillDryRunResult): BackfillDrySummary {
  const deltas = result.reports.map((r) => r.geo_score_delta).filter((d): d is number => d !== null);
  const sorted = [...deltas].sort((a, b) => a - b);
  const avg = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null;
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;

  return {
    rows_scanned: result.rows_scanned,
    runs_scanned: result.runs_scanned,
    runs_needing_backfill: result.runs_needing_backfill,
    runs_skipped_no_project_domain: result.runs_skipped_no_project_domain,
    avg_geo_score_delta: avg === null ? null : round2(avg),
    median_geo_score_delta: median === null ? null : round2(median),
    min_geo_score_delta: sorted.length ? round2(sorted[0]) : null,
    max_geo_score_delta: sorted.length ? round2(sorted[sorted.length - 1]) : null,
    prominence_flip_count: result.reports.filter((r) => r.prominence_flip !== "unchanged").length,
    standing_flip_count: result.reports.filter((r) => r.standing_flip !== "unchanged").length
  };
}
