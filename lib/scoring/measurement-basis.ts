/**
 * MEASUREMENT-BASIS-1 — what a run's score was actually measured over.
 *
 * Pure and dependency-free, same contract as `lib/scoring/score-reliability.ts`
 * and `lib/scan/sampling.ts`: no database, no clock, no I/O.
 *
 * WHY THIS EXISTS. The public methodology page promises that a trend never
 * mixes scans "que no midan lo mismo" and that "si cambias prompts, motores o
 * plan […] el número vuelve a ser el de tu último escaneo". Until this module
 * the code kept a narrower promise: `compareRuns` looked at composite version,
 * surviving components, engine set and the NUMBER of responses, and the score
 * window (`isWindowEligible`) did not look at engines at all. Two scans over
 * entirely different prompt sets, or over a different model behind the same
 * engine name, were comparable as long as they happened to hold the same
 * number of rows — and nothing recorded the question text, model, country or
 * language the number depended on.
 *
 * WHAT THIS IS NOT. It does not change a score, a weight, a threshold or the
 * confidence label (`.claude/rules/scoring.md`). It records the facts about
 * the measurement next to it, explains the confidence label that already
 * exists, and gives the two comparability gates one shared definition of
 * "same measurement".
 *
 * WHAT IT DOES NOT CLAIM. The numbers come from model APIs, not from the
 * consumer product a person types into: the same model name behind an API and
 * behind a chat interface can differ in system prompt, tools, personalisation
 * and rollout. `MEASUREMENT_API_LIMIT_NOTICE` carries that limit so every
 * surface that shows these numbers can say it in the same words as the Terms.
 */

import { getEngineMeta } from "@/lib/scan/engine-meta";

export const MEASUREMENT_BASIS_VERSION = "measurement-basis-v1";

/**
 * The limit the Terms of Service already state ("no garantizan una réplica
 * exacta de lo que un usuario final vería"), in one place so the dashboard, an
 * individual answer and an exported report cannot each paraphrase it.
 */
export const MEASUREMENT_API_LIMIT_NOTICE =
  "Medido con las APIs de los modelos, no con sus aplicaciones de consumo: lo que ve una persona en la interfaz de ChatGPT, Gemini o Claude puede diferir. Es una muestra, no una réplica.";

/** The subset of a `scan_prompt_results` row this module reads. */
export type MeasurementRow = {
  prompt_text_snapshot: string;
  provider?: string | null;
  model?: string | null;
  country_snapshot?: string | null;
  language_snapshot?: string | null;
  sample_index?: number | null;
  extracted_json: unknown;
  extraction_error: string | null;
};

export type MeasurementEngineBasis = {
  /** Valid responses (completed rows) this engine contributed. */
  responses: number;
  /** Distinct model identifiers the provider reported, sorted. */
  models: string[];
  /** Whether this engine's call includes live web search (and so can yield citations). */
  grounded: boolean;
};

export type MeasurementBasis = {
  version: string;
  responses: {
    /** Completed rows the score was computed over. */
    valid: number;
    /** Of those, rows extracted without an extraction error. */
    clean: number;
    /**
     * Rows the run was sized to produce (prompts x samples x engines), or null
     * when the caller could not know it. Null is "unknown", never "equal to
     * valid" — deriving it from what arrived would make every run complete.
     */
    expected: number | null;
    /** `expected - valid`, never negative; null when `expected` is null. */
    missing: number | null;
  };
  by_engine: Record<string, MeasurementEngineBasis>;
  prompts: {
    /** Different questions asked. This, not `responses.valid`, is the breadth of the evidence. */
    distinct: number;
    /** Highest repetition count any single question reached (1 = no repetition). */
    max_samples: number;
    /** Stable fingerprint of the exact set of question texts. */
    set_key: string;
  };
  locale: { countries: string[]; languages: string[] };
};

function normalizePromptText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * FNV-1a, 32 bit, run twice with different seeds and concatenated. This is a
 * fingerprint for "same set of questions?", not a security primitive; the
 * only requirement is that it is deterministic across runtimes with no
 * dependency (`node:crypto` is not available to client-safe modules).
 */
function fingerprint(value: string): string {
  const pass = (seed: number) => {
    let hash = seed >>> 0;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
  };
  return pass(0x811c9dc5) + pass(0x9747b28c);
}

function sortedUnique(values: Iterable<string | null | undefined>): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) seen.add(trimmed);
  }
  return [...seen].sort();
}

export function buildMeasurementBasis(
  rows: readonly MeasurementRow[],
  options: {
    expectedResponses?: number | null;
    groundedProviders: ReadonlySet<string>;
  }
): MeasurementBasis {
  const byEngine: Record<string, MeasurementEngineBasis> = {};
  const modelsByEngine = new Map<string, Set<string>>();
  const promptKeys = new Set<string>();
  let maxSamples = rows.length > 0 ? 1 : 0;
  let clean = 0;

  for (const row of rows) {
    const provider = row.provider ?? "unknown";
    const entry = byEngine[provider] ?? {
      responses: 0,
      models: [],
      grounded: options.groundedProviders.has(provider)
    };
    entry.responses += 1;
    byEngine[provider] = entry;

    const model = row.model?.trim();
    if (model) {
      const set = modelsByEngine.get(provider) ?? new Set<string>();
      set.add(model);
      modelsByEngine.set(provider, set);
    }

    promptKeys.add(normalizePromptText(row.prompt_text_snapshot));

    const sample = typeof row.sample_index === "number" && row.sample_index >= 0 ? row.sample_index + 1 : 1;
    if (sample > maxSamples) maxSamples = sample;

    if (row.extracted_json && typeof row.extracted_json === "object" && !row.extraction_error) clean += 1;
  }

  for (const [provider, models] of modelsByEngine) {
    byEngine[provider].models = [...models].sort();
  }

  const expected =
    typeof options.expectedResponses === "number" && Number.isFinite(options.expectedResponses)
      ? Math.max(0, Math.floor(options.expectedResponses))
      : null;

  return {
    version: MEASUREMENT_BASIS_VERSION,
    responses: {
      valid: rows.length,
      clean,
      expected,
      missing: expected === null ? null : Math.max(0, expected - rows.length)
    },
    by_engine: byEngine,
    prompts: {
      distinct: promptKeys.size,
      max_samples: maxSamples,
      set_key: fingerprint([...promptKeys].sort().join("\u0001"))
    },
    locale: {
      countries: sortedUnique(rows.map((row) => row.country_snapshot?.toLowerCase())),
      languages: sortedUnique(rows.map((row) => row.language_snapshot?.toLowerCase()))
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? (value as string[]) : null;
}

/**
 * Defensive read of `details_json.measurement_basis`. Runs scored before this
 * module existed have none, and the honest representation of that is `null` —
 * callers must treat it as "not recorded", not as "matches anything".
 */
export function readMeasurementBasis(detailsJson: unknown): MeasurementBasis | null {
  if (!isRecord(detailsJson)) return null;
  const raw = detailsJson.measurement_basis;
  if (!isRecord(raw) || typeof raw.version !== "string") return null;

  const responses = raw.responses;
  const prompts = raw.prompts;
  const locale = raw.locale;
  const byEngineRaw = raw.by_engine;
  if (!isRecord(responses) || !isRecord(prompts) || !isRecord(locale) || !isRecord(byEngineRaw)) return null;

  if (typeof responses.valid !== "number" || typeof responses.clean !== "number") return null;
  if (typeof prompts.distinct !== "number" || typeof prompts.max_samples !== "number") return null;
  if (typeof prompts.set_key !== "string") return null;
  const countries = stringArray(locale.countries);
  const languages = stringArray(locale.languages);
  if (!countries || !languages) return null;

  const byEngine: Record<string, MeasurementEngineBasis> = {};
  for (const [provider, value] of Object.entries(byEngineRaw)) {
    if (!isRecord(value) || typeof value.responses !== "number") return null;
    const models = stringArray(value.models);
    if (!models || typeof value.grounded !== "boolean") return null;
    byEngine[provider] = { responses: value.responses, models, grounded: value.grounded };
  }

  const expected = typeof responses.expected === "number" ? responses.expected : null;
  const missing = typeof responses.missing === "number" ? responses.missing : null;

  return {
    version: raw.version,
    responses: { valid: responses.valid, clean: responses.clean, expected, missing },
    by_engine: byEngine,
    prompts: { distinct: prompts.distinct, max_samples: prompts.max_samples, set_key: prompts.set_key },
    locale: { countries, languages }
  };
}

export type BasisComparison =
  /** `checked: false` means at least one side recorded no basis, so nothing here could be verified. */
  | { comparable: true; checked: boolean }
  | { comparable: false; reason: string };

function listKey(values: readonly string[]): string {
  return [...values].sort().join(",");
}

function engineLabel(provider: string): string {
  return getEngineMeta(provider).label || provider;
}

/**
 * Whether two runs measured the same thing, as far as their recorded basis can
 * show. Single definition shared by the delta gate (`compareRuns`) and the
 * headline window (`isWindowEligible`), so the two cannot disagree again about
 * what "same measurement" means.
 *
 * Legacy runs have no basis. They are NOT rejected here: that would suppress
 * the headline and every delta for the first scans after this ships, for a
 * change that happened before anyone could record it. They pass unchecked,
 * and `checked: false` lets a caller say so. The limit is stated in the log
 * entry, not hidden: a prompt or model change that straddles the rollout is
 * still undetectable.
 */
export function compareMeasurementBasis(
  current: MeasurementBasis | null,
  previous: MeasurementBasis | null
): BasisComparison {
  if (!current || !previous || current.version !== previous.version) {
    return { comparable: true, checked: false };
  }

  if (current.prompts.set_key !== previous.prompts.set_key) {
    return { comparable: false, reason: "las preguntas medidas cambiaron entre estos dos escaneos" };
  }

  const currentEngines = listKey(Object.keys(current.by_engine));
  const previousEngines = listKey(Object.keys(previous.by_engine));
  if (currentEngines !== previousEngines) {
    return { comparable: false, reason: "el conjunto de motores de IA cambió entre estos dos escaneos" };
  }

  for (const provider of Object.keys(current.by_engine).sort()) {
    const now = listKey(current.by_engine[provider].models);
    const before = listKey(previous.by_engine[provider].models);
    // An engine that reported no model on either side proves nothing either way.
    if (now && before && now !== before) {
      return {
        comparable: false,
        reason: `el modelo de ${engineLabel(provider)} cambió entre estos dos escaneos (${before} → ${now})`
      };
    }
  }

  if (
    listKey(current.locale.countries) !== listKey(previous.locale.countries) ||
    listKey(current.locale.languages) !== listKey(previous.locale.languages)
  ) {
    return { comparable: false, reason: "el país o el idioma de la medición cambió entre estos dos escaneos" };
  }

  return { comparable: true, checked: true };
}

/**
 * Plain-language reason behind a confidence label, written from the SAME
 * inputs `computeRunScoresFromResults` branches on so the sentence cannot say
 * something the label did not do. The label itself is unchanged by this phase.
 */
export function explainConfidence(input: {
  confidence: "low" | "medium" | "high";
  totalResponses: number;
  cleanResponses: number;
  cleanCoverageFloor: number;
  minResponsesForBand: number;
  highConfidenceCleanResponses: number;
  distinctPrompts: number;
  maxSamples: number;
}): string {
  const {
    confidence,
    totalResponses,
    cleanResponses,
    cleanCoverageFloor,
    minResponsesForBand,
    highConfidenceCleanResponses,
    distinctPrompts,
    maxSamples
  } = input;

  const coverage = totalResponses > 0 ? cleanResponses / totalResponses : 0;
  const breadth =
    maxSamples > 1
      ? ` Son ${distinctPrompts} ${distinctPrompts === 1 ? "pregunta distinta" : "preguntas distintas"} repetidas hasta ${maxSamples} veces: repetir la misma pregunta reduce el ruido de esa pregunta, no demuestra que se mencione en otras.`
      : ` Son ${distinctPrompts} ${distinctPrompts === 1 ? "pregunta distinta" : "preguntas distintas"}.`;

  if (confidence === "low") {
    if (coverage < cleanCoverageFloor) {
      return `Baja: solo ${cleanResponses} de ${totalResponses} respuestas se pudieron analizar sin error (mínimo ${Math.round(cleanCoverageFloor * 100)}%).${breadth}`;
    }
    return `Baja: ${totalResponses} ${totalResponses === 1 ? "respuesta" : "respuestas"}, por debajo de las ${minResponsesForBand} necesarias para que una sola no mueva el resultado de forma apreciable.${breadth}`;
  }

  if (confidence === "high") {
    return `Alta: ${cleanResponses} respuestas analizadas sin error (mínimo ${highConfidenceCleanResponses}) y cobertura de análisis suficiente.${breadth}`;
  }

  return `Media: ${totalResponses} respuestas, ${cleanResponses} analizadas sin error; no llegan a las ${highConfidenceCleanResponses} analizadas sin error que exige «alta».${breadth}`;
}

/**
 * Spanish lines for a surface that shows the score. Returns only facts that
 * were recorded; an unknown expected count produces no "de N esperadas".
 */
export function describeMeasurementBasis(basis: MeasurementBasis | null): string[] {
  if (!basis) return [];
  const lines: string[] = [];

  const { valid, expected, missing } = basis.responses;
  lines.push(
    expected === null
      ? `${valid} respuestas válidas (no se registró cuántas se esperaban).`
      : missing && missing > 0
        ? `${valid} respuestas válidas de ${expected} esperadas: faltan ${missing}, y no se rellenan.`
        : `${valid} respuestas válidas de ${expected} esperadas.`
  );

  lines.push(
    `${basis.prompts.distinct} ${basis.prompts.distinct === 1 ? "pregunta distinta" : "preguntas distintas"}` +
      (basis.prompts.max_samples > 1 ? `, cada una repetida hasta ${basis.prompts.max_samples} veces.` : ".")
  );

  const engines = Object.entries(basis.by_engine)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([provider, engine]) => {
      const model = engine.models.length > 0 ? ` (${engine.models.join(", ")})` : "";
      const mode = engine.grounded ? "con búsqueda web" : "sin búsqueda web";
      return `${engineLabel(provider)}${model}: ${engine.responses}, ${mode}`;
    });
  if (engines.length > 0) lines.push(`Motores: ${engines.join(" · ")}.`);

  return lines;
}
