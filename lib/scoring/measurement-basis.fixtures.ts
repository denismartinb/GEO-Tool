import { buildMeasurementBasis, type MeasurementBasis, type MeasurementRow } from "@/lib/scoring/measurement-basis";

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
