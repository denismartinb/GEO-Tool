import { EXTRACTION_VERSION } from "@/lib/scan/constants";
import { buildMeasurementBasis, type MeasurementBasis, type MeasurementRow } from "@/lib/scoring/measurement-basis";
import { computeRunScoresFromResults, type ScoreInputRow } from "@/lib/scoring/run-scoring";

/**
 * Test fixtures for the measurement basis. Not imported by production code.
 *
 * Mirrors what a real full scan records: every question answered by every
 * engine, each with the model it reported, the web-search mode that engine
 * really uses (Claude has none) and one country / language.
 */
export const FIXTURE_MODELS: Record<string, string> = {
  gemini: "gemini-2.5-flash",
  openai: "gpt-4o-mini",
  claude: "claude-haiku-4-5-20251001"
};

export const FIXTURE_GROUNDING: Record<string, boolean> = { gemini: true, openai: true, claude: false };

export type FixtureRowOptions = {
  prompts?: string[];
  engines?: readonly string[];
  samples?: number;
  models?: Record<string, string>;
  grounding?: Record<string, boolean | null>;
  country?: string;
  language?: string;
  /** Per-row override, applied last — for one question that differs from the rest. */
  override?: (row: MeasurementRow) => Partial<MeasurementRow>;
};

export function fixtureMeasurementRows(options: FixtureRowOptions = {}): MeasurementRow[] {
  const prompts = options.prompts ?? ["pregunta 1", "pregunta 2", "pregunta 3", "pregunta 4"];
  const engines = options.engines ?? ["gemini", "openai", "claude"];
  const models = options.models ?? FIXTURE_MODELS;
  const grounding = options.grounding ?? FIXTURE_GROUNDING;
  const rows: MeasurementRow[] = [];
  for (const prompt of prompts) {
    for (const provider of engines) {
      for (let sample = 0; sample < (options.samples ?? 1); sample += 1) {
        const row: MeasurementRow = {
          prompt_text_snapshot: prompt,
          provider,
          model: models[provider],
          country_snapshot: options.country ?? "ES",
          language_snapshot: options.language ?? "es",
          sample_index: sample,
          grounding_enabled: grounding[provider] ?? null,
          extracted_json: { brand: { mentioned: false } },
          extraction_error: null
        };
        rows.push({ ...row, ...(options.override?.(row) ?? {}) });
      }
    }
  }
  return rows;
}

/** A complete 4-question x 3-engine basis; `rows` overrides the default scan. */
export function fixtureBasis(
  options: FixtureRowOptions & { expected?: number | null; requested?: number | null } = {}
): MeasurementBasis {
  const rows = fixtureMeasurementRows(options);
  return buildMeasurementBasis(rows, {
    expectedResponses: options.expected === undefined ? 12 * (options.samples ?? 1) : options.expected,
    requestedPrompts: options.requested === undefined ? (options.prompts ?? [1, 2, 3, 4]).length : options.requested
  });
}

/**
 * A fully scored fixture run with all FIVE composite components present
 * (presence, prominence, standing, authority, technical), shaped like a
 * persisted `run_scores` row. Used by the gauge-card tests and the review
 * captures so the "comparable" case is not a degenerate two-component run.
 *
 * DATA IS INVENTED. Nothing here comes from a real scan, and nothing is ever
 * inserted anywhere: it only exists inside a test process.
 */
export function scoredFixtureRun(
  runId: string,
  createdAt: string,
  options: FixtureRowOptions & {
    /** The brand is NOT named in every Nth response, so a larger N means MORE mentions. Prominence needs >= 10 mentions. */
    missEvery: number;
    technical?: number | null
  }
) {
  const measurement = fixtureMeasurementRows({ prompts: FULL_PROMPTS, ...options });
  const rows: ScoreInputRow[] = measurement.map((row, index) => {
    const mentioned = index % options.missEvery !== 0;
    const cited = mentioned && index % 4 === 0 && (FIXTURE_GROUNDING[row.provider ?? ""] ?? false);
    return {
      id: `${runId}-${index}`,
      prompt_text_snapshot: row.prompt_text_snapshot,
      brand_mentioned: mentioned,
      citation_found: cited,
      mentioned_competitors_count: 1,
      citations_count: cited ? 1 : 0,
      sentiment: "neutral",
      extracted_json: {
        brand: { mentioned, position: mentioned ? 1 + (index % 3) : null },
        competitors: [{ name: "Rival fixture", mentioned: true, position: mentioned ? 2 + (index % 2) : 1 }],
        citations: cited ? [{ url: "https://acme.com/p", domain: "acme.com", title: "p", source: "grounding", confidence: "high" }] : []
      },
      extraction_error: null,
      brand_snapshot: "Acme",
      provider: row.provider,
      extraction_version: EXTRACTION_VERSION,
      model: row.model,
      country_snapshot: row.country_snapshot,
      language_snapshot: row.language_snapshot,
      sample_index: row.sample_index,
      grounding_enabled: row.grounding_enabled
    };
  });

  const technical =
    options.technical === null
      ? null
      : {
          value: options.technical ?? 62,
          snapshot_id: "fixture-snapshot",
          captured_at: createdAt,
          source: "this_run" as const,
          age_days: 0
        };

  const scored = computeRunScoresFromResults(rows, "acme.com", {
    technical,
    expectedResponses: rows.length,
    requestedPrompts: FULL_PROMPTS.length
  });
  return {
    run_id: runId,
    created_at: createdAt,
    details_json: scored.details_json,
    visibility_score: scored.visibility_score
  };
}

/** Seven questions x three engines = 21 responses, enough for "high" confidence. */
const FULL_PROMPTS = ["q1", "q2", "q3", "q4", "q5", "q6", "q7"].map((q) => `pregunta fixture ${q}`);
