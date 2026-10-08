import { describe, expect, it } from "vitest";

import {
  MEASUREMENT_API_LIMIT_NOTICE,
  buildMeasurementBasis,
  compareMeasurementBasis,
  describeMeasurementBasis,
  isUnverifiableReason,
  parseGroundingEnabled,
  readMeasurementBasis,
  requestedPromptCount,
  type MeasurementRow
} from "@/lib/scoring/measurement-basis";
import { FIXTURE_MODELS, fixtureBasis, fixtureMeasurementRows, type FixtureRowOptions } from "@/lib/scoring/measurement-basis.fixtures";
import { computeRunScoresFromResults, type ScoreInputRow } from "@/lib/scoring/run-scoring";
import { compareRuns, readComparableRun, resolveDelta } from "@/lib/scoring/score-reliability";
import { computeWindowedScore, readWindowRun } from "@/lib/scoring/score-window";

const DOMAIN = "acme.com";

/** Scorer input from measurement rows: nobody mentions the brand unless `mentioned` says so. */
function scoreRows(rows: MeasurementRow[], mentioned: (row: MeasurementRow) => boolean = () => false): ScoreInputRow[] {
  return rows.map((row, index) => {
    const said = mentioned(row);
    return {
      id: `${row.provider}-${row.prompt_text_snapshot}-${row.sample_index}-${index}`,
      prompt_text_snapshot: row.prompt_text_snapshot,
      brand_mentioned: said,
      citation_found: false,
      mentioned_competitors_count: 0,
      citations_count: 0,
      sentiment: "unknown",
      extracted_json: row.extraction_error ? null : { brand: { mentioned: said, position: said ? 1 : null }, competitors: [] },
      extraction_error: row.extraction_error,
      brand_snapshot: "Acme",
      provider: row.provider,
      extraction_version: "current",
      model: row.model,
      country_snapshot: row.country_snapshot,
      language_snapshot: row.language_snapshot,
      sample_index: row.sample_index,
      grounding_enabled: row.grounding_enabled
    };
  });
}

function details(
  options: FixtureRowOptions & { expected?: number | null; requested?: number | null; mentioned?: (row: MeasurementRow) => boolean } = {}
) {
  const rows = fixtureMeasurementRows(options);
  return computeRunScoresFromResults(scoreRows(rows, options.mentioned), DOMAIN, {
    expectedResponses: options.expected === undefined ? null : options.expected,
    requestedPrompts: options.requested === undefined ? null : options.requested
  }).details_json as Record<string, any>;
}

/** Rows from an explicit list of `engine:question` cells, to build runs that answered only some. */
function cellsRows(cells: string[], extra: Partial<MeasurementRow> = {}): MeasurementRow[] {
  return cells.map((cell) => {
    const [provider, prompt] = cell.split(":");
    return {
      prompt_text_snapshot: prompt,
      provider,
      model: FIXTURE_MODELS[provider],
      country_snapshot: "ES",
      language_snapshot: "es",
      sample_index: 0,
      grounding_enabled: provider !== "claude",
      extracted_json: { brand: { mentioned: false } },
      extraction_error: null,
      ...extra
    };
  });
}

const basisOf = (rows: MeasurementRow[], expected: number | null = null, requested: number | null = null) =>
  buildMeasurementBasis(rows, { expectedResponses: expected, requestedPrompts: requested });

describe("buildMeasurementBasis", () => {
  it("records a cell per question and engine with model, web search, locale and repetitions", () => {
    const basis = fixtureBasis({ samples: 2 });

    expect(basis.cells).toHaveLength(12);
    expect(basis.responses).toMatchObject({ valid: 24, expected: 24, missing: 0 });
    expect(basis.prompts).toMatchObject({ distinct: 4, requested: 4, max_samples: 2 });
    expect(basis.by_engine.gemini).toEqual({
      responses: 8,
      distinct_prompts: 4,
      models: [FIXTURE_MODELS.gemini],
      grounded: true
    });
    // Claude's call has no web search; it is recorded as off, not omitted.
    expect(basis.by_engine.claude.grounded).toBe(false);
    expect(basis.cells.every((cell) => cell.n === 2)).toBe(true);
    expect(basis.locale).toEqual({ countries: ["es"], languages: ["es"] });
    expect(basis.balanced).toBe(true);
    expect(basis.complete).toBe(true);
  });

  it("counts questions, not responses: many repetitions of one question are one question", () => {
    const basis = fixtureBasis({ prompts: ["única pregunta"], samples: 5 });

    expect(basis.responses.valid).toBe(15);
    expect(basis.prompts.distinct).toBe(1);
    expect(basis.prompts.max_samples).toBe(5);
  });

  it("never fabricates what it was not told: unknown expected/requested stay null and the run is not 'complete'", () => {
    const basis = fixtureBasis({ expected: null, requested: null });

    expect(basis.responses.expected).toBeNull();
    expect(basis.responses.missing).toBeNull();
    expect(basis.prompts.requested).toBeNull();
    expect(basis.complete).toBe(false);
    expect(describeMeasurementBasis(basis)[0]).toContain("no se registró cuántas se esperaban");
  });

  it("a web-search mode that was never recorded stays null, not 'off'", () => {
    const basis = fixtureBasis({ grounding: { gemini: null, openai: true, claude: false } });
    expect(basis.by_engine.gemini.grounded).toBeNull();
    expect(describeMeasurementBasis(basis).join(" ")).toContain("búsqueda web sin registrar");
  });

  it("round-trips through details_json and reads a malformed block as 'not recorded'", () => {
    const stored = details({ expected: 12, requested: 4 });
    expect(readMeasurementBasis(stored)).toEqual(stored.measurement_basis);
    expect(readMeasurementBasis({ measurement_basis: { version: "x" } })).toBeNull();
    expect(readMeasurementBasis({ measurement_basis: { ...stored.measurement_basis, cells: [{ nope: 1 }] } })).toBeNull();
    expect(readMeasurementBasis(null)).toBeNull();
  });

  it("derives the requested question count only when the jobs divide exactly", () => {
    expect(requestedPromptCount(12, 3)).toBe(4);
    expect(requestedPromptCount(7, 1)).toBe(7);
    expect(requestedPromptCount(10, 3)).toBeNull();
    expect(requestedPromptCount(0, 1)).toBeNull();
    expect(requestedPromptCount(null, 1)).toBeNull();
  });

  it("reads the stored web-search snapshot from jsonb text", () => {
    expect(parseGroundingEnabled("true")).toBe(true);
    expect(parseGroundingEnabled("false")).toBe(false);
    expect(parseGroundingEnabled(null)).toBeNull();
    expect(parseGroundingEnabled(undefined)).toBeNull();
  });
});

describe("zero mentions and absent responses", () => {
  it("a brand with zero mentions keeps a basis and says what was measured", () => {
    const result = details({ expected: 12, requested: 4 });

    expect(result.measurement_basis.responses.valid).toBe(12);
    expect(result.geo_score.components.presence.value).toBe(0);
    // Excluded signals are declared, not zeroed.
    expect(result.geo_score.components.prominence.value).toBeNull();
    expect(result.geo_score.inputs_used).not.toContain("prominence");
  });

  it("no responses at all: no score, no confidence claim, an honest reason", () => {
    const result = computeRunScoresFromResults([], DOMAIN, { expectedResponses: 12, requestedPrompts: 4 });
    const d = result.details_json as Record<string, any>;

    expect(d.geo_score).toBeUndefined();
    expect(result.confidence).toBe("low");
    expect(d.confidence_reason).toMatch(/Sin respuestas válidas/);
    expect(d.measurement_basis.responses).toMatchObject({ valid: 0, expected: 12, missing: 12 });
    expect(d.measurement_basis.complete).toBe(false);
    expect(d.engine_sensitivity).toBeUndefined();
  });
});

describe("a partial run (1 of 3 engines) and provider errors", () => {
  const full = () => details({ expected: 12, requested: 4, mentioned: (row) => row.provider !== "claude" });
  const onlyClaude = () => details({ engines: ["claude"], expected: 12, requested: 4 });

  it("reports valid against expected and never refills the missing rows", () => {
    const d = onlyClaude();
    expect(d.measurement_basis.responses).toMatchObject({ valid: 4, expected: 12, missing: 8 });
    expect(d.measurement_basis.complete).toBe(false);
    expect(d.total_results).toBe(4);
    expect(describeMeasurementBasis(readMeasurementBasis(d)).join(" ")).toContain("faltan 8, y no se rellenan");
  });

  it("is not comparable with a complete run of the same questions", () => {
    const verdict = compareRuns(readComparableRun(onlyClaude()), readComparableRun(full()));
    expect(verdict.comparable).toBe(false);
  });

  it("measures how much the headline rests on each engine", () => {
    const d = full();

    expect(Object.keys(d.engine_sensitivity).sort()).toEqual(["claude", "gemini", "openai"]);
    expect(d.engine_sensitivity.claude.delta).toBeGreaterThan(0);
    expect(d.engine_sensitivity.gemini.delta).toBeLessThan(0);
    expect(d.engine_sensitivity.claude.score_without).toBeCloseTo(d.geo_score.score + d.engine_sensitivity.claude.delta, 1);
  });

  it("omits sensitivity for a single-engine run: there is nothing to remove", () => {
    expect(onlyClaude().engine_sensitivity).toBeUndefined();
  });

  it("provider errors stay out of the clean count and lower the stated confidence", () => {
    const broken = details({
      samples: 2,
      expected: 24,
      requested: 4,
      override: (row) => (row.provider === "openai" ? { extraction_error: "timeout: extraction", extracted_json: null } : {})
    } as FixtureRowOptions);

    expect(broken.measurement_basis.responses).toMatchObject({ valid: 24, clean: 16 });
    expect(broken.confidence_reason).toMatch(/solo 16 de 24 respuestas/);
  });
});

describe("equal row counts do not establish comparability", () => {
  // Same five rows, same three questions, same two engines — answered by
  // different engines. Before MEASUREMENT-BASIS-1 these were "comparable".
  const runX = () => cellsRows(["gemini:q1", "gemini:q2", "gemini:q3", "openai:q1", "openai:q2"]);
  const runY = () => cellsRows(["gemini:q1", "gemini:q2", "openai:q1", "openai:q2", "openai:q3"]);
  const asDetails = (rows: MeasurementRow[]) =>
    computeRunScoresFromResults(scoreRows(rows), DOMAIN, { expectedResponses: 6, requestedPrompts: 3 }).details_json as Record<string, any>;

  it("the fixture really has equal counts, questions and engines", () => {
    const x = asDetails(runX());
    const y = asDetails(runY());
    expect(x.total_results).toBe(y.total_results);
    expect(x.measurement_basis.prompts.distinct).toBe(y.measurement_basis.prompts.distinct);
    expect(Object.keys(x.measurement_basis.by_engine)).toEqual(Object.keys(y.measurement_basis.by_engine));
  });

  it("different engines answered different questions: not comparable, with that reason", () => {
    const verdict = compareRuns(readComparableRun(asDetails(runX())), readComparableRun(asDetails(runY())));
    expect(verdict).toEqual({
      comparable: false,
      reason: "las mismas preguntas no obtuvieron respuesta de los mismos motores en estos dos escaneos"
    });
  });

  it("neither run is described as whole, and the engines are flagged as unbalanced", () => {
    const basis = readMeasurementBasis(asDetails(runX()))!;
    expect(basis.balanced).toBe(false);
    expect(basis.complete).toBe(false);
    expect(describeMeasurementBasis(basis).join(" ")).toContain("Medición parcial: los motores no respondieron las mismas preguntas");
  });

  it("a different question answered by the same count of rows is not comparable either", () => {
    const other = cellsRows(["gemini:q1", "gemini:q2", "gemini:q4", "openai:q1", "openai:q2"]);
    const verdict = compareRuns(readComparableRun(asDetails(runX())), readComparableRun(asDetails(other)));
    expect(verdict).toEqual({ comparable: false, reason: "las preguntas medidas cambiaron entre estos dos escaneos" });
  });

  it("a requested question that got no answer from anyone is declared, not hidden", () => {
    const rows = cellsRows(["gemini:q1", "gemini:q2", "openai:q1", "openai:q2"]);
    const basis = basisOf(rows, 6, 3);

    expect(basis.balanced).toBe(true);
    expect(basis.complete).toBe(false);
    expect(describeMeasurementBasis(basis).join(" ")).toContain("2 preguntas distintas con respuesta, de 3 pedidas");
  });

  it("only a run that is whole, balanced and fully requested is called complete", () => {
    const rows = cellsRows(["gemini:q1", "gemini:q2", "openai:q1", "openai:q2"]);
    expect(basisOf(rows, 4, 2).complete).toBe(true);
    expect(basisOf(rows, 4, 3).complete).toBe(false);
    expect(basisOf(rows, 6, 2).complete).toBe(false);
  });
});

describe("confidence reason", () => {
  it("explains each label from the same inputs the label used", () => {
    const run = (prompts: string[], engines?: string[]) =>
      computeRunScoresFromResults(scoreRows(fixtureMeasurementRows({ prompts, engines })), DOMAIN);

    const low = run(["a", "b"], ["gemini"]);
    expect(low.confidence).toBe("low");
    expect((low.details_json as any).confidence_reason).toMatch(/^Baja: 2 respuestas, por debajo de las 10/);

    const medium = run(["a", "b", "c", "d"]);
    expect(medium.confidence).toBe("medium");
    expect((medium.details_json as any).confidence_reason).toMatch(/^Media: 12 respuestas/);

    const high = run(["a", "b", "c", "d", "e", "f", "g"]);
    expect(high.confidence).toBe("high");
    expect((high.details_json as any).confidence_reason).toMatch(/^Alta: 21 respuestas/);
  });

  it("does not let repeating one question pass for breadth", () => {
    const result = computeRunScoresFromResults(scoreRows(fixtureMeasurementRows({ prompts: ["única"], samples: 5 })), DOMAIN);
    const reason = (result.details_json as any).confidence_reason as string;

    expect(reason).toContain("1 pregunta distinta repetidas hasta 5 veces");
    expect(reason).toContain("no demuestra que se mencione en otras");
  });

  it("states the cap when a missing component limits the composite", () => {
    const d = details({ prompts: ["a", "b", "c", "d", "e", "f", "g"], engines: ["claude", "claude2", "claude3"] });
    expect(d.geo_score.confidence).toBe("medium");
    expect(d.geo_score.confidence_reason).toContain("El compuesto se limita a «media»");
  });
});

describe("the persisted formula matches its version", () => {
  it("formulas_used.geo_score is the same text as geo_score.formula and names v4 weights", () => {
    const d = details({ mentioned: () => true });

    expect(d.formulas_used.geo_score).toBe(d.geo_score.formula);
    expect(d.formulas_used.geo_score).toContain("presence .32 / prominence .20 / standing .16 / authority .12 / technical .20");
    expect(d.formulas_used.geo_score).not.toContain("base weights presence .40");
  });
});

describe("comparability is verified cell by cell, and unknown is not verified", () => {
  const stored = (options: FixtureRowOptions = {}) => readComparableRun(details({ expected: 12, requested: 4, ...options }));

  it("the same measurement is comparable", () => {
    expect(compareRuns(stored(), stored())).toEqual({ comparable: true });
  });

  it("different questions with the SAME number of responses are not comparable", () => {
    const changed = stored({ prompts: ["otra 1", "otra 2", "otra 3", "otra 4"] });
    expect(compareRuns(stored(), changed)).toEqual({
      comparable: false,
      reason: "las preguntas medidas cambiaron entre estos dos escaneos"
    });
  });

  it("a different model behind the same engine name is not comparable", () => {
    const verdict = compareRuns(stored({ models: { ...FIXTURE_MODELS, openai: "gpt-5-mini" } }), stored());
    expect(verdict).toEqual({
      comparable: false,
      reason: "el modelo de ChatGPT cambió entre estos dos escaneos (gpt-4o-mini → gpt-5-mini)"
    });
  });

  it("a model recorded on only one side is unverified, not 'unchanged'", () => {
    const noModel = stored({ models: { gemini: FIXTURE_MODELS.gemini, claude: FIXTURE_MODELS.claude } as Record<string, string> });
    const verdict = compareRuns(noModel, stored());

    expect(verdict).toEqual({ comparable: false, reason: "no se registró el modelo de ChatGPT en uno de los escaneos" });
  });

  it("web search flipping from on to off for an engine is not comparable", () => {
    const off = stored({ grounding: { gemini: true, openai: false, claude: false } });
    const verdict = compareRuns(off, stored());

    expect(verdict).toEqual({
      comparable: false,
      reason: "la búsqueda web de ChatGPT pasó de activada a desactivada entre estos dos escaneos"
    });
    // …and the reverse direction names the reverse change.
    expect((compareRuns(stored(), off) as { reason: string }).reason).toContain("pasó de desactivada a activada");
  });

  it("an unrecorded web-search mode is unverified", () => {
    const unknownMode = stored({ grounding: { gemini: null, openai: true, claude: false } });
    expect(compareRuns(unknownMode, stored())).toEqual({
      comparable: false,
      reason: "no se registró si Gemini usó búsqueda web en uno de los escaneos"
    });
  });

  it("web search is compared per question, not as a set of values", () => {
    // Both runs have exactly one question with ChatGPT's search off — the SET
    // of values is identical ({on, off}); only WHICH question differs.
    const offOn = (prompt: string) =>
      stored({ override: (row) => (row.provider === "openai" && row.prompt_text_snapshot === prompt ? { grounding_enabled: false } : {}) });
    const verdict = compareRuns(offOn("pregunta 1"), offOn("pregunta 2"));

    expect(verdict.comparable).toBe(false);
    expect((verdict as { reason: string }).reason).toContain("la búsqueda web de ChatGPT");
  });

  it("country and language are compared per question, not as a set", () => {
    const mexicoOn = (prompt: string) =>
      stored({ override: (row) => (row.prompt_text_snapshot === prompt ? { country_snapshot: "MX" } : {}) });
    const a = mexicoOn("pregunta 1");
    const b = mexicoOn("pregunta 2");

    // The summary sets are identical; the cells are not.
    expect(a.basis?.locale).toEqual(b.basis?.locale);
    expect(compareRuns(a, b)).toEqual({
      comparable: false,
      reason: "el país o el idioma de la medición cambió entre estos dos escaneos"
    });
  });

  it("a different language alone is not comparable", () => {
    expect(compareRuns(stored({ language: "en" }), stored())).toEqual({
      comparable: false,
      reason: "el país o el idioma de la medición cambió entre estos dos escaneos"
    });
  });

  it("a different number of repetitions of a question is not comparable", () => {
    const verdict = compareMeasurementBasis(fixtureBasis({ samples: 2 }), fixtureBasis({ samples: 1 }));
    expect(verdict).toEqual({
      comparable: false,
      reason: "el número de repeticiones de una pregunta cambió entre estos dos escaneos"
    });
  });

  it("a run scored before the basis existed is unverified, in both directions", () => {
    const legacy = { ...stored(), basis: null };
    const reason = "uno de los escaneos no registró con qué preguntas, modelo y búsqueda web se midió";

    expect(compareRuns(stored(), legacy)).toEqual({ comparable: false, reason });
    expect(compareRuns(legacy, stored())).toEqual({ comparable: false, reason });
    expect(compareRuns(legacy, legacy)).toEqual({ comparable: false, reason });
  });

  it("a different record format is unverified", () => {
    const newer = { ...fixtureBasis(), version: "measurement-basis-v2" };
    expect(compareMeasurementBasis(newer, fixtureBasis())).toEqual({
      comparable: false,
      reason: "el registro de la medición cambió de formato entre estos dos escaneos"
    });
  });

  it("resolveDelta withholds the delta with the reason", () => {
    const verdict = resolveDelta(5, stored({ prompts: ["x1", "x2", "x3", "x4"] }), stored());

    expect(verdict).toEqual({
      kind: "not_comparable",
      reason: "las preguntas medidas cambiaron entre estos dos escaneos"
    });
  });
});

describe("the headline window honours the same definition", () => {
  const winRow = (runId: string, finishedAt: string, options: FixtureRowOptions & { expected?: number | null } = {}, mutate?: (d: Record<string, any>) => void) => {
    const d = details({ expected: 12, requested: 4, ...options });
    mutate?.(d);
    return readWindowRun({ run_id: runId, created_at: finishedAt, details_json: d })!;
  };

  it("does not fold runs over different questions into one median, and says why", () => {
    const result = computeWindowedScore([
      winRow("c", "2026-10-03T00:00:00Z", { prompts: ["n1", "n2", "n3", "n4"] }),
      winRow("b", "2026-10-02T00:00:00Z"),
      winRow("a", "2026-10-01T00:00:00Z")
    ]);

    expect(result.verdict).toBe("not_comparable");
    expect(result.value).toBeNull();
    expect(result.latest).not.toBeNull();
    expect(result.reason).toBe("las preguntas medidas cambiaron entre estos dos escaneos");
  });

  it("does not fold runs with a different model, and names the model", () => {
    const result = computeWindowedScore([
      winRow("c", "2026-10-03T00:00:00Z", { models: { ...FIXTURE_MODELS, gemini: "gemini-3-flash" } }),
      winRow("b", "2026-10-02T00:00:00Z"),
      winRow("a", "2026-10-01T00:00:00Z")
    ]);

    expect(result.verdict).toBe("not_comparable");
    expect(result.reason).toContain("el modelo de Gemini cambió");
  });

  it("does not fold runs whose web search flipped for an engine", () => {
    const result = computeWindowedScore([
      winRow("c", "2026-10-03T00:00:00Z", { grounding: { gemini: true, openai: false, claude: false } }),
      winRow("b", "2026-10-02T00:00:00Z"),
      winRow("a", "2026-10-01T00:00:00Z")
    ]);

    expect(result.verdict).toBe("not_comparable");
    expect(result.reason).toContain("pasó de activada a desactivada");
  });

  it("keeps the comparable runs and drops only the one that changed", () => {
    const result = computeWindowedScore([
      winRow("c", "2026-10-03T00:00:00Z"),
      winRow("b", "2026-10-02T00:00:00Z", { engines: ["gemini", "openai"], expected: 8 }),
      winRow("a", "2026-10-01T00:00:00Z")
    ]);

    expect(result.verdict).toBe("published");
    expect(result.runsUsed).toEqual(["c", "a"]);
  });

  it("does not publish a median over runs that recorded no basis", () => {
    const legacy = (runId: string, finishedAt: string) => ({ ...winRow(runId, finishedAt), measurement: null });
    const result = computeWindowedScore([
      legacy("c", "2026-10-03T00:00:00Z"),
      legacy("b", "2026-10-02T00:00:00Z"),
      legacy("a", "2026-10-01T00:00:00Z")
    ]);

    expect(result.verdict).toBe("not_comparable");
    expect(result.value).toBeNull();
    expect(result.reason).toBe("uno de los escaneos no registró con qué preguntas, modelo y búsqueda web se midió");
  });
});

describe("unverifiable vs verified-different reasons", () => {
  it("separates 'we cannot verify' from 'we verified they differ'", () => {
    const stored = (options: FixtureRowOptions = {}) => readComparableRun(details({ expected: 12, requested: 4, ...options }));
    const reasonOf = (a: ReturnType<typeof stored>, b: ReturnType<typeof stored>) => (compareRuns(a, b) as { reason: string }).reason;

    // Cannot verify: nothing was recorded.
    expect(isUnverifiableReason(reasonOf({ ...stored(), basis: null }, stored()))).toBe(true);
    expect(isUnverifiableReason(reasonOf(stored({ grounding: { gemini: null, openai: true, claude: false } }), stored()))).toBe(true);
    expect(isUnverifiableReason(reasonOf(stored({ models: { gemini: FIXTURE_MODELS.gemini } as Record<string, string> }), stored()))).toBe(true);
    // Verified different: a real change worth naming.
    expect(isUnverifiableReason(reasonOf(stored({ models: { ...FIXTURE_MODELS, openai: "gpt-5-mini" } }), stored()))).toBe(false);
    expect(isUnverifiableReason(reasonOf(stored({ prompts: ["x1", "x2", "x3", "x4"] }), stored()))).toBe(false);
    expect(isUnverifiableReason(reasonOf(stored({ language: "en" }), stored()))).toBe(false);
    expect(isUnverifiableReason(null)).toBe(false);
  });
});

describe("API limit notice", () => {
  it("says the numbers come from APIs and are a sample, never a replica", () => {
    expect(MEASUREMENT_API_LIMIT_NOTICE).toMatch(/APIs/);
    expect(MEASUREMENT_API_LIMIT_NOTICE).toMatch(/no una réplica/);
  });
});
