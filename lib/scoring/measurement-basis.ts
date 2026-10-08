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
 * number of rows.
 *
 * THE UNIT IS THE CELL, NOT THE SET. A first version of this module compared
 * the set of question texts, the set of engines and the set of locales
 * separately. That cannot tell "same questions on the same engines" from "the
 * same count of rows spread differently": two runs can share a question set and
 * an engine set while one engine answered only half the questions. So every
 * `(question, engine)` pair is recorded as a cell with its own model, web-search
 * mode, country, language and repetition count, and two runs are comparable
 * only when their cells match one to one.
 *
 * UNKNOWN IS NOT VERIFIED. A run with no recorded basis, a cell with no
 * recorded model, or a row whose web-search mode was never written cannot be
 * shown to match anything, and is reported as not comparable — the same rule
 * `compareRuns` already applies to composite version, components and engines.
 * The price, stated: for the first scans after this ships the headline falls
 * back to the run's own score and says why, instead of a median nobody can
 * vouch for.
 *
 * WHAT THIS IS NOT. It does not change a score, a weight, a threshold or the
 * confidence label (`.claude/rules/scoring.md`). It records the facts about
 * the measurement next to it, explains the confidence label that already
 * exists, and gives the two comparability gates one shared definition.
 *
 * WHAT IT DOES NOT CLAIM. The numbers come from model APIs, not from the
 * consumer product a person types into: the same model name behind an API and
 * behind a chat interface can differ in system prompt, tools, personalisation
 * and rollout. `MEASUREMENT_API_LIMIT_NOTICE` carries that limit so every
 * surface that shows these numbers can say it in the same words as the Terms.
 * It also cannot prove WHICH questions were asked of an engine that never
 * answered: it records how many questions were requested, and how many were
 * answered, never the text of one that got no answer.
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
  /**
   * Whether the call that produced this row had live web search enabled,
   * snapshotted at call time (`raw_response_json.grounding_enabled`).
   * `null`/absent = never recorded, which is "unknown", not "off".
   */
  grounding_enabled?: boolean | null;
  extracted_json: unknown;
  extraction_error: string | null;
};

/** One `(question, engine)` pair of a run, with everything its comparability depends on. */
export type MeasurementCell = {
  /** Fingerprint of the normalised question text. */
  p: string;
  /** Engine / provider id. */
  e: string;
  /** Web search on (`true`), off (`false`), or not recorded / mixed (`null`). */
  g: boolean | null;
  /** Country snapshot, lower-cased. Mixed values within a cell are joined with `|`. */
  c: string;
  /** Language snapshot, lower-cased. */
  l: string;
  /** Distinct model identifiers the provider reported, sorted. */
  m: string[];
  /** Responses in this cell (repetitions of the same question on the same engine). */
  n: number;
};

export type MeasurementEngineBasis = {
  /** Valid responses (completed rows) this engine contributed. */
  responses: number;
  /** Different questions this engine answered. */
  distinct_prompts: number;
  /** Distinct model identifiers the provider reported, sorted. */
  models: string[];
  /** Web search on for every response (`true`), off for every one (`false`), or not recorded / mixed (`null`). */
  grounded: boolean | null;
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
    /** Different questions that got at least one response. This, not `responses.valid`, is the breadth of the evidence. */
    distinct: number;
    /** Different questions the run asked for, or null when unknown. Never derived from what was answered. */
    requested: number | null;
    /** Highest repetition count any single question reached (1 = no repetition). */
    max_samples: number;
  };
  /**
   * True when every engine answered the same questions the same number of
   * times. Unbalanced runs score over whatever arrived; the score is real but
   * the engines are not evenly weighted.
   */
  balanced: boolean;
  /**
   * True only when the run is provably whole: its expected size is known and
   * met, every requested question was answered, and the engines are balanced.
   * Equal row counts never establish this.
   */
  complete: boolean;
  locale: { countries: string[]; languages: string[] };
  cells: MeasurementCell[];
};

function normalizePromptText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * FNV-1a, 32 bit, run twice with different seeds and concatenated. A
 * fingerprint for "same question?", not a security primitive; the only
 * requirement is that it is deterministic across runtimes with no dependency
 * (`node:crypto` is not available to client-safe modules).
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

/** `raw_response_json->>grounding_enabled` arrives as the text "true"/"false", or null. */
export function parseGroundingEnabled(value: unknown): boolean | null {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return null;
}

/**
 * Different questions a run asked for. `total_prompts` counts JOBS (one per
 * question per repetition, SAMPLING-1) and `sample_count` is the repetition
 * count, so the quotient is the question count — but only when it divides
 * exactly. Anything else is "unknown", never a rounded guess.
 */
export function requestedPromptCount(totalJobs: unknown, sampleCount: unknown): number | null {
  if (typeof totalJobs !== "number" || !Number.isInteger(totalJobs) || totalJobs <= 0) return null;
  const samples = typeof sampleCount === "number" && Number.isInteger(sampleCount) && sampleCount > 0 ? sampleCount : 1;
  return totalJobs % samples === 0 ? totalJobs / samples : null;
}

function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function buildMeasurementBasis(
  rows: readonly MeasurementRow[],
  options: {
    expectedResponses?: number | null;
    requestedPrompts?: number | null;
  } = {}
): MeasurementBasis {
  type CellAccumulator = {
    p: string;
    e: string;
    grounding: Array<boolean | null>;
    countries: Set<string>;
    languages: Set<string>;
    models: Set<string>;
    n: number;
  };

  const cells = new Map<string, CellAccumulator>();
  const promptKeys = new Set<string>();
  let maxSamples = rows.length > 0 ? 1 : 0;
  let clean = 0;

  for (const row of rows) {
    const provider = row.provider ?? "unknown";
    const promptKey = fingerprint(normalizePromptText(row.prompt_text_snapshot));
    promptKeys.add(promptKey);

    const key = `${promptKey}|${provider}`;
    const cell = cells.get(key) ?? {
      p: promptKey,
      e: provider,
      grounding: [],
      countries: new Set<string>(),
      languages: new Set<string>(),
      models: new Set<string>(),
      n: 0
    };
    cell.n += 1;
    cell.grounding.push(row.grounding_enabled ?? null);
    const country = row.country_snapshot?.trim().toLowerCase();
    if (country) cell.countries.add(country);
    const language = row.language_snapshot?.trim().toLowerCase();
    if (language) cell.languages.add(language);
    const model = row.model?.trim();
    if (model) cell.models.add(model);
    cells.set(key, cell);

    const sample = typeof row.sample_index === "number" && row.sample_index >= 0 ? row.sample_index + 1 : 1;
    if (sample > maxSamples) maxSamples = sample;

    if (row.extracted_json && typeof row.extracted_json === "object" && !row.extraction_error) clean += 1;
  }

  const outCells: MeasurementCell[] = [...cells.values()]
    .map((cell) => {
      const allOn = cell.grounding.every((value) => value === true);
      const allOff = cell.grounding.every((value) => value === false);
      return {
        p: cell.p,
        e: cell.e,
        g: allOn ? true : allOff ? false : null,
        c: [...cell.countries].sort().join("|"),
        l: [...cell.languages].sort().join("|"),
        m: [...cell.models].sort(),
        n: cell.n
      };
    })
    .sort((a, b) => (a.e === b.e ? a.p.localeCompare(b.p) : a.e.localeCompare(b.e)));

  const byEngine: Record<string, MeasurementEngineBasis> = {};
  for (const cell of outCells) {
    const entry = byEngine[cell.e] ?? { responses: 0, distinct_prompts: 0, models: [], grounded: cell.g };
    entry.responses += cell.n;
    entry.distinct_prompts += 1;
    entry.models = sortedUnique([...entry.models, ...cell.m]);
    entry.grounded = entry.grounded === cell.g ? entry.grounded : null;
    byEngine[cell.e] = entry;
  }

  const engineIds = Object.keys(byEngine);
  const balanced =
    engineIds.length <= 1 ||
    engineIds.every((engine) => {
      const mine = outCells.filter((cell) => cell.e === engine);
      const reference = outCells.filter((cell) => cell.e === engineIds[0]);
      return (
        mine.length === reference.length &&
        mine.every((cell, index) => cell.p === reference[index].p && cell.n === reference[index].n)
      );
    });

  const expected =
    typeof options.expectedResponses === "number" && Number.isFinite(options.expectedResponses)
      ? Math.max(0, Math.floor(options.expectedResponses))
      : null;
  const requested =
    typeof options.requestedPrompts === "number" && Number.isFinite(options.requestedPrompts)
      ? Math.max(0, Math.floor(options.requestedPrompts))
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
    prompts: { distinct: promptKeys.size, requested, max_samples: maxSamples },
    balanced,
    complete:
      expected !== null && rows.length === expected && requested !== null && promptKeys.size === requested && balanced,
    locale: {
      countries: sortedUnique(rows.map((row) => row.country_snapshot?.toLowerCase())),
      languages: sortedUnique(rows.map((row) => row.language_snapshot?.toLowerCase()))
    },
    cells: outCells
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? (value as string[]) : null;
}

function nullableBoolean(value: unknown): boolean | null | undefined {
  return value === null || typeof value === "boolean" ? value : undefined;
}

/**
 * Defensive read of `details_json.measurement_basis`. Runs scored before this
 * module existed have none, and the honest representation of that is `null` —
 * `compareMeasurementBasis` treats it as "not verified", never as "matches
 * anything".
 */
export function readMeasurementBasis(detailsJson: unknown): MeasurementBasis | null {
  if (!isRecord(detailsJson)) return null;
  const raw = detailsJson.measurement_basis;
  if (!isRecord(raw) || typeof raw.version !== "string") return null;

  const { responses, prompts, locale, by_engine: byEngineRaw } = raw;
  if (!isRecord(responses) || !isRecord(prompts) || !isRecord(locale) || !isRecord(byEngineRaw)) return null;
  if (typeof responses.valid !== "number" || typeof responses.clean !== "number") return null;
  if (typeof prompts.distinct !== "number" || typeof prompts.max_samples !== "number") return null;
  if (typeof raw.balanced !== "boolean" || typeof raw.complete !== "boolean") return null;
  const countries = stringArray(locale.countries);
  const languages = stringArray(locale.languages);
  if (!countries || !languages || !Array.isArray(raw.cells)) return null;

  const byEngine: Record<string, MeasurementEngineBasis> = {};
  for (const [provider, value] of Object.entries(byEngineRaw)) {
    if (!isRecord(value) || typeof value.responses !== "number" || typeof value.distinct_prompts !== "number") {
      return null;
    }
    const models = stringArray(value.models);
    const grounded = nullableBoolean(value.grounded);
    if (!models || grounded === undefined) return null;
    byEngine[provider] = { responses: value.responses, distinct_prompts: value.distinct_prompts, models, grounded };
  }

  const cells: MeasurementCell[] = [];
  for (const value of raw.cells) {
    if (!isRecord(value)) return null;
    const m = stringArray(value.m);
    const g = nullableBoolean(value.g);
    if (
      typeof value.p !== "string" ||
      typeof value.e !== "string" ||
      typeof value.c !== "string" ||
      typeof value.l !== "string" ||
      typeof value.n !== "number" ||
      !m ||
      g === undefined
    ) {
      return null;
    }
    cells.push({ p: value.p, e: value.e, g, c: value.c, l: value.l, m, n: value.n });
  }

  return {
    version: raw.version,
    responses: {
      valid: responses.valid,
      clean: responses.clean,
      expected: typeof responses.expected === "number" ? responses.expected : null,
      missing: typeof responses.missing === "number" ? responses.missing : null
    },
    by_engine: byEngine,
    prompts: {
      distinct: prompts.distinct,
      requested: typeof prompts.requested === "number" ? prompts.requested : null,
      max_samples: prompts.max_samples
    },
    balanced: raw.balanced,
    complete: raw.complete,
    locale: { countries, languages },
    cells
  };
}

/**
 * Reasons that mean "we cannot VERIFY these two scans measured the same thing"
 * — as opposed to "we verified they differ". The first is nothing the user
 * changed and nothing they can act on (a scan from before the basis was
 * recorded); the second is a real change (another model, other questions) and
 * is worth naming. The screen words them differently, so the distinction has
 * one definition here.
 */
export const REASON_BASIS_UNRECORDED =
  "uno de los escaneos no registró con qué preguntas, modelo y búsqueda web se midió";
export const REASON_BASIS_FORMAT = "el registro de la medición cambió de formato entre estos dos escaneos";
/** Pre-existing wording of `compareRuns`' own "unknown" gate (version/components/engines never recorded). */
export const REASON_CONFIG_UNRECORDED = "uno de los escaneos no registró con qué configuración se midió";

const UNVERIFIABLE_PREFIX = "no se registró";

export function isUnverifiableReason(reason: string | null | undefined): boolean {
  if (!reason) return false;
  return (
    reason === REASON_BASIS_UNRECORDED ||
    reason === REASON_BASIS_FORMAT ||
    reason === REASON_CONFIG_UNRECORDED ||
    reason.startsWith(UNVERIFIABLE_PREFIX)
  );
}

export type BasisComparison = { comparable: true } | { comparable: false; reason: string };

function engineLabel(provider: string): string {
  return getEngineMeta(provider).label || provider;
}

function describeGrounding(value: boolean): string {
  return value ? "activada" : "desactivada";
}

/**
 * Whether two runs measured the same thing, cell by cell. Single definition
 * shared by the delta gate (`compareRuns`) and the headline window
 * (`isWindowEligible`), so the two cannot disagree again about what "same
 * measurement" means.
 *
 * Returns `comparable: true` ONLY when it could verify every dimension. A
 * missing basis, a missing model, an unrecorded web-search mode or a different
 * record format is reported as not comparable with its own reason — unknown is
 * never verified. Equal row counts establish nothing here: two runs with the
 * same number of responses are comparable only if each question was answered
 * by the same engines with the same model, search mode, country, language and
 * repetitions.
 */
export function compareMeasurementBasis(
  current: MeasurementBasis | null,
  previous: MeasurementBasis | null
): BasisComparison {
  if (!current || !previous) {
    return { comparable: false, reason: REASON_BASIS_UNRECORDED };
  }
  if (current.version !== previous.version) {
    return { comparable: false, reason: REASON_BASIS_FORMAT };
  }

  const currentPrompts = new Set(current.cells.map((cell) => cell.p));
  const previousPrompts = new Set(previous.cells.map((cell) => cell.p));
  const samePrompts =
    currentPrompts.size === previousPrompts.size && [...currentPrompts].every((p) => previousPrompts.has(p));
  if (!samePrompts) {
    return { comparable: false, reason: "las preguntas medidas cambiaron entre estos dos escaneos" };
  }

  const currentEngines = [...new Set(current.cells.map((cell) => cell.e))].sort();
  const previousEngines = [...new Set(previous.cells.map((cell) => cell.e))].sort();
  if (!sameStrings(currentEngines, previousEngines)) {
    return { comparable: false, reason: "el conjunto de motores de IA cambió entre estos dos escaneos" };
  }

  const previousByKey = new Map(previous.cells.map((cell) => [`${cell.p}|${cell.e}`, cell]));
  if (current.cells.length !== previous.cells.length) {
    return {
      comparable: false,
      reason: "las mismas preguntas no obtuvieron respuesta de los mismos motores en estos dos escaneos"
    };
  }

  for (const cell of current.cells) {
    const before = previousByKey.get(`${cell.p}|${cell.e}`);
    if (!before) {
      return {
        comparable: false,
        reason: "las mismas preguntas no obtuvieron respuesta de los mismos motores en estos dos escaneos"
      };
    }
    const label = engineLabel(cell.e);

    if (cell.m.length === 0 || before.m.length === 0) {
      return { comparable: false, reason: `${UNVERIFIABLE_PREFIX} el modelo de ${label} en uno de los escaneos` };
    }
    if (!sameStrings(cell.m, before.m)) {
      return {
        comparable: false,
        reason: `el modelo de ${label} cambió entre estos dos escaneos (${before.m.join(", ")} → ${cell.m.join(", ")})`
      };
    }

    if (cell.g === null || before.g === null) {
      return { comparable: false, reason: `${UNVERIFIABLE_PREFIX} si ${label} usó búsqueda web en uno de los escaneos` };
    }
    if (cell.g !== before.g) {
      return {
        comparable: false,
        reason: `la búsqueda web de ${label} pasó de ${describeGrounding(before.g)} a ${describeGrounding(cell.g)} entre estos dos escaneos`
      };
    }

    if (cell.c !== before.c || cell.l !== before.l) {
      return { comparable: false, reason: "el país o el idioma de la medición cambió entre estos dos escaneos" };
    }
    if (cell.n !== before.n) {
      return {
        comparable: false,
        reason: "el número de repeticiones de una pregunta cambió entre estos dos escaneos"
      };
    }
  }

  return { comparable: true };
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
 * were recorded; an unknown expected count produces no "de N esperadas", and a
 * run that is not provably whole says so instead of reading as complete.
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

  const { distinct, requested, max_samples: maxSamples } = basis.prompts;
  const questions = `${distinct} ${distinct === 1 ? "pregunta distinta" : "preguntas distintas"}`;
  lines.push(
    requested !== null && distinct < requested
      ? `${questions} con respuesta, de ${requested} pedidas` + (maxSamples > 1 ? `, repetidas hasta ${maxSamples} veces.` : ".")
      : questions + (maxSamples > 1 ? `, cada una repetida hasta ${maxSamples} veces.` : ".")
  );

  const engines = Object.entries(basis.by_engine)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([provider, engine]) => {
      const model = engine.models.length > 0 ? ` (${engine.models.join(", ")})` : " (modelo sin registrar)";
      const mode =
        engine.grounded === null ? "búsqueda web sin registrar" : engine.grounded ? "con búsqueda web" : "sin búsqueda web";
      return `${engineLabel(provider)}${model}: ${engine.responses}, ${mode}`;
    });
  if (engines.length > 0) lines.push(`Motores: ${engines.join(" · ")}.`);

  if (!basis.complete) {
    lines.push(
      !basis.balanced
        ? "Medición parcial: los motores no respondieron las mismas preguntas el mismo número de veces, así que no pesan por igual."
        : "Medición parcial: no se puede afirmar que se hicieran todas las preguntas pedidas a todos los motores."
    );
  }

  return lines;
}
