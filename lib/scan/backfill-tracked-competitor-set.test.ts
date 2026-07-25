import { describe, expect, it, vi } from "vitest";
import {
  computeRunBackfill,
  reconcileRowForBackfill,
  runBackfillDryRun,
  summarizeDryRun,
  toScoreInputRow,
  type BackfillSourceRow
} from "./backfill-tracked-competitor-set";
import { EXTRACTION_VERSION } from "./constants";

function baseRow(overrides: Partial<BackfillSourceRow> = {}): BackfillSourceRow {
  return {
    id: "row-1",
    run_id: "run-1",
    project_id: "project-1",
    status: "completed",
    extracted_json: {
      brand: { mentioned: true, display_name_found: "Acme", evidence: [], position: 1 },
      competitors: [{ name: "Globex", mentioned: false, evidence: [], position: null }],
      citations: [],
      sentiment: "neutral",
      sentiment_drivers: [],
      other_brands_mentioned: [],
      summary: "",
      confidence: "high",
      notes: []
    },
    competitors_snapshot: [{ name: "Globex" }],
    mentioned_competitors_count: 0,
    extraction_version: "negative-drivers-v1",
    brand_snapshot: "Acme",
    brand_mentioned: true,
    citation_found: false,
    citations_count: 0,
    sentiment: "neutral",
    extraction_error: null,
    provider: "gemini",
    prompt_text_snapshot: "best widgets",
    ...overrides
  };
}

describe("reconcileRowForBackfill", () => {
  it("does not touch a row already on the current EXTRACTION_VERSION", () => {
    const result = reconcileRowForBackfill(baseRow({ extraction_version: EXTRACTION_VERSION }));
    expect(result).toEqual({ touched: false });
  });

  it("does not touch a row with no extracted_json", () => {
    const result = reconcileRowForBackfill(baseRow({ extracted_json: null }));
    expect(result).toEqual({ touched: false });
  });

  it("does not touch a row with no competitors_snapshot array", () => {
    const result = reconcileRowForBackfill(baseRow({ competitors_snapshot: null }));
    expect(result).toEqual({ touched: false });
  });

  it("reconciles an outdated row, moving an untracked entity to other_brands_mentioned", () => {
    const result = reconcileRowForBackfill(
      baseRow({
        competitors_snapshot: [{ name: "Globex" }],
        extracted_json: {
          brand: { mentioned: true, display_name_found: "Acme", evidence: [], position: 1 },
          competitors: [
            { name: "Globex", mentioned: true, evidence: [], position: 2 },
            { name: "Initech", mentioned: true, evidence: [], position: 3 } // untracked
          ],
          citations: [],
          sentiment: "neutral",
          sentiment_drivers: [],
          other_brands_mentioned: [],
          summary: "",
          confidence: "high",
          notes: []
        }
      })
    );

    expect(result.touched).toBe(true);
    if (!result.touched) throw new Error("expected touched result");
    expect(result.extracted_json.competitors.map((c) => c.name)).toEqual(["Globex"]);
    expect(result.extracted_json.other_brands_mentioned).toContain("Initech");
    expect(result.mentioned_competitors_count).toBe(1);
  });
});

describe("toScoreInputRow", () => {
  it("uses the reconciled data when touched", () => {
    const row = baseRow();
    const reconciliation = reconcileRowForBackfill(row);
    expect(reconciliation.touched).toBe(true);
    const scoreInput = toScoreInputRow(row, reconciliation);
    expect(scoreInput.extraction_version).toBe(EXTRACTION_VERSION);
    if (reconciliation.touched) {
      expect(scoreInput.mentioned_competitors_count).toBe(reconciliation.mentioned_competitors_count);
    }
  });

  it("passes the row through unchanged when not touched", () => {
    const row = baseRow({ extraction_version: EXTRACTION_VERSION, mentioned_competitors_count: 3 });
    const reconciliation = reconcileRowForBackfill(row);
    expect(reconciliation).toEqual({ touched: false });
    const scoreInput = toScoreInputRow(row, reconciliation);
    expect(scoreInput.mentioned_competitors_count).toBe(3);
    expect(scoreInput.extraction_version).toBe(EXTRACTION_VERSION);
    expect(scoreInput.extracted_json).toBe(row.extracted_json);
  });
});

describe("computeRunBackfill", () => {
  it("returns null when every row in the run is already current", () => {
    const outcome = computeRunBackfill({
      run_id: "run-1",
      project_id: "project-1",
      project_domain: "acme.com",
      rows: [baseRow({ extraction_version: EXTRACTION_VERSION })],
      previous: null
    });
    expect(outcome).toBeNull();
  });

  it("flips standing from a fabricated 100 to null once reconciliation reveals zero tracked competitors", () => {
    // Real bug this guards against: the OLD (contaminated) run had a
    // competitor entity the model invented, so mentioned_competitors_count
    // wasn't 0 and standing looked legitimate. The project actually tracks
    // NO competitors (competitors_snapshot: []) — after reconciliation
    // that phantom entity moves to other_brands_mentioned and standing
    // correctly drops to null (docs/adr/0018 §4).
    const rows = [
      baseRow({
        id: "row-1",
        competitors_snapshot: [],
        mentioned_competitors_count: 1,
        extracted_json: {
          brand: { mentioned: true, display_name_found: "Acme", evidence: [], position: 1 },
          competitors: [{ name: "Phantom Co", mentioned: true, evidence: [], position: 2 }],
          citations: [],
          sentiment: "neutral",
          sentiment_drivers: [],
          other_brands_mentioned: [],
          summary: "",
          confidence: "high",
          notes: []
        }
      })
    ];

    const outcome = computeRunBackfill({
      run_id: "run-1",
      project_id: "project-1",
      project_domain: "acme.com",
      rows,
      previous: {
        visibility_score: 100,
        details_json: { geo_score: { components: { standing: { value: 100 }, prominence: { value: 100 } } } }
      }
    });

    expect(outcome).not.toBeNull();
    if (!outcome) return;
    expect(outcome.report.rows_touched).toBe(1);
    expect(outcome.report.standing_flip).toBe("value_to_null");
    expect(outcome.touchedRowUpdates).toHaveLength(1);
    expect(outcome.touchedRowUpdates[0]).toMatchObject({ id: "row-1", extraction_version: EXTRACTION_VERSION });
  });

  it("reports unchanged flips and a real delta when nothing about the score's availability changes", () => {
    const rows = [baseRow()]; // Globex tracked and reconciled 1:1, no untracked entity

    const outcome = computeRunBackfill({
      run_id: "run-1",
      project_id: "project-1",
      project_domain: "acme.com",
      rows,
      previous: { visibility_score: 100, details_json: { geo_score: { score: 100, components: {} } } }
    });

    expect(outcome).not.toBeNull();
    if (!outcome) return;
    expect(outcome.report.previous_geo_score).toBe(100);
    expect(typeof outcome.report.geo_score_delta).toBe("number");
  });
});

describe("runBackfillDryRun (I/O orchestration)", () => {
  function createServiceMock(tables: { scan_prompt_results: unknown[]; projects: unknown[]; run_scores: unknown[] }) {
    function builderFor(data: unknown[]) {
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "range", "in", "eq"]) {
        builder[method] = vi.fn(() => builder);
      }
      builder.then = (resolve: (value: { data: unknown[]; error: null }) => unknown) => resolve({ data, error: null });
      return builder;
    }

    return {
      from: vi.fn((tableName: string) => builderFor(tables[tableName as keyof typeof tables] ?? []))
    };
  }

  it("scans rows, groups by run, skips already-current rows, and produces a report for a run needing backfill", async () => {
    const service = createServiceMock({
      scan_prompt_results: [baseRow({ id: "row-1", run_id: "run-1", project_id: "project-1" })],
      projects: [{ id: "project-1", domain: "acme.com" }],
      run_scores: [{ run_id: "run-1", visibility_score: 100, details_json: { geo_score: { score: 100 } } }]
    });

    const result = await runBackfillDryRun(service as unknown as Parameters<typeof runBackfillDryRun>[0]);

    expect(result.rows_scanned).toBe(1);
    expect(result.runs_scanned).toBe(1);
    expect(result.runs_needing_backfill).toBe(1);
    expect(result.runs_skipped_no_project_domain).toBe(0);
    expect(result.reports[0]).toMatchObject({ run_id: "run-1", project_id: "project-1", rows_touched: 1 });
  });

  it("skips a run whose project domain can't be resolved, without throwing", async () => {
    const service = createServiceMock({
      scan_prompt_results: [baseRow({ run_id: "run-1", project_id: "missing-project" })],
      projects: [],
      run_scores: []
    });

    const result = await runBackfillDryRun(service as unknown as Parameters<typeof runBackfillDryRun>[0]);

    expect(result.runs_skipped_no_project_domain).toBe(1);
    expect(result.reports).toHaveLength(0);
  });

  it("summarizeDryRun aggregates deltas and flip counts across reports", async () => {
    const service = createServiceMock({
      scan_prompt_results: [baseRow({ id: "row-1", run_id: "run-1", project_id: "project-1" })],
      projects: [{ id: "project-1", domain: "acme.com" }],
      run_scores: []
    });

    const result = await runBackfillDryRun(service as unknown as Parameters<typeof runBackfillDryRun>[0]);
    const summary = summarizeDryRun(result);

    expect(summary.runs_needing_backfill).toBe(1);
    // No previous run_scores row -> delta is null for this run, so the
    // aggregate has nothing to average.
    expect(summary.avg_geo_score_delta).toBeNull();
  });
});
