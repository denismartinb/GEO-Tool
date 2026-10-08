import { describe, expect, it } from "vitest";

import {
  MEASUREMENT_API_LIMIT_NOTICE,
  buildMeasurementBasis,
  compareMeasurementBasis,
  describeMeasurementBasis,
  readMeasurementBasis
} from "@/lib/scoring/measurement-basis";
import { computeRunScoresFromResults, type ScoreInputRow } from "@/lib/scoring/run-scoring";
import { compareRuns, readComparableRun, resolveDelta } from "@/lib/scoring/score-reliability";
import { computeWindowedScore, readWindowRun } from "@/lib/scoring/score-window";

const DOMAIN = "acme.com";
const ENGINES = ["gemini", "openai", "claude"] as const;
const MODELS: Record<string, string> = {
  gemini: "gemini-2.5-flash",
  openai: "gpt-4o-mini",
  claude: "claude-haiku-4-5-20251001"
};

type RowOptions = {
  prompts?: string[];
  engines?: readonly string[];
  samples?: number;
  mentioned?: (provider: string, prompt: string) => boolean;
  models?: Record<string, string>;
  country?: string;
  language?: string;
  extractionError?: (provider: string, prompt: string) => string | null;
};

/** prompts x engines x samples rows, shaped like a persisted scan_prompt_results. */
function rows(options: RowOptions = {}): ScoreInputRow[] {
  const prompts = options.prompts ?? Array.from({ length: 4 }, (_, i) => `pregunta ${i + 1}`);
  const engines = options.engines ?? ENGINES;
  const models = options.models ?? MODELS;
  const out: ScoreInputRow[] = [];
  for (const prompt of prompts) {
    for (const provider of engines) {
      for (let sample = 0; sample < (options.samples ?? 1); sample += 1) {
        const mentioned = options.mentioned?.(provider, prompt) ?? false;
        const error = options.extractionError?.(provider, prompt) ?? null;
        out.push({
          id: `${provider}-${prompt}-${sample}`,
          prompt_text_snapshot: prompt,
          brand_mentioned: mentioned,
          citation_found: false,
          mentioned_competitors_count: 0,
          citations_count: 0,
          sentiment: "unknown",
          extracted_json: error ? null : { brand: { mentioned, position: mentioned ? 1 : null }, competitors: [] },
          extraction_error: error,
          brand_snapshot: "Acme",
          provider,
          extraction_version: "current",
          model: models[provider],
          country_snapshot: options.country ?? "ES",
          language_snapshot: options.language ?? "es",
          sample_index: sample
        });
      }
    }
  }
  return out;
}

function details(input: ScoreInputRow[], expectedResponses: number | null = null) {
  return computeRunScoresFromResults(input, DOMAIN, { expectedResponses }).details_json as Record<string, any>;
}

describe("buildMeasurementBasis", () => {
  it("records engine, model, grounding, question breadth and locale for each run", () => {
    const basis = details(rows({ samples: 2 }), 24).measurement_basis;

    expect(basis.responses).toMatchObject({ valid: 24, expected: 24, missing: 0 });
    expect(basis.prompts).toMatchObject({ distinct: 4, max_samples: 2 });
    expect(basis.by_engine.gemini).toEqual({ responses: 8, models: [MODELS.gemini], grounded: true });
    expect(basis.by_engine.openai.grounded).toBe(true);
    // Claude's call has no web search; the basis must not pretend it has.
    expect(basis.by_engine.claude.grounded).toBe(false);
    expect(basis.locale).toEqual({ countries: ["es"], languages: ["es"] });
  });

  it("counts questions, not responses: many repetitions of one question are one question", () => {
    const basis = details(rows({ prompts: ["única pregunta"], samples: 5 }), 15).measurement_basis;

    expect(basis.responses.valid).toBe(15);
    expect(basis.prompts.distinct).toBe(1);
    expect(basis.prompts.max_samples).toBe(5);
  });

  it("does not fabricate an expected count it was not given", () => {
    const basis = details(rows(), null).measurement_basis;

    expect(basis.responses.expected).toBeNull();
    expect(basis.responses.missing).toBeNull();
    expect(describeMeasurementBasis(readMeasurementBasis({ measurement_basis: basis }))[0]).toContain(
      "no se registró cuántas se esperaban"
    );
  });

  it("round-trips through details_json and rejects a malformed block as 'not recorded'", () => {
    const stored = details(rows(), 12);
    expect(readMeasurementBasis(stored)).toEqual(stored.measurement_basis);
    expect(readMeasurementBasis({ measurement_basis: { version: "x" } })).toBeNull();
    expect(readMeasurementBasis(null)).toBeNull();
  });

  it("same questions in a different order and spelling give the same set key", () => {
    const a = buildMeasurementBasis(rows({ prompts: ["Uno  dos", "tres"] }), { groundedProviders: new Set() });
    const b = buildMeasurementBasis(rows({ prompts: ["TRES", "uno dos"] }), { groundedProviders: new Set() });
    expect(a.prompts.set_key).toBe(b.prompts.set_key);
  });
});

describe("zero mentions and absent responses", () => {
  it("a brand with zero mentions keeps a basis and says what was measured", () => {
    const result = details(rows({ mentioned: () => false }), 12);

    expect(result.visibility_score).toBeUndefined(); // lives at the top level, not in details
    expect(result.measurement_basis.responses.valid).toBe(12);
    expect(result.geo_score.components.presence.value).toBe(0);
    // Excluded signals are declared, not zeroed.
    expect(result.geo_score.components.prominence.value).toBeNull();
    expect(result.geo_score.inputs_used).not.toContain("prominence");
  });

  it("no responses at all: no score, no confidence claim, an honest reason", () => {
    const result = computeRunScoresFromResults([], DOMAIN, { expectedResponses: 12 });
    const d = result.details_json as Record<string, any>;

    expect(d.geo_score).toBeUndefined();
    expect(result.confidence).toBe("low");
    expect(d.confidence_reason).toMatch(/Sin respuestas válidas/);
    expect(d.measurement_basis.responses).toMatchObject({ valid: 0, expected: 12, missing: 12 });
    expect(d.engine_sensitivity).toBeUndefined();
  });
});

describe("a partial run (1 of 3 engines) and provider errors", () => {
  const full = rows({ mentioned: (p) => p !== "claude" });
  const onlyClaude = rows({ engines: ["claude"], mentioned: () => false });

  it("reports valid against expected and never refills the missing rows", () => {
    const d = details(onlyClaude, 12 * 1);
    // 4 prompts x 1 engine arrived, but the run was sized for 4 x 3 = 12.
    expect(d.measurement_basis.responses).toMatchObject({ valid: 4, expected: 12, missing: 8 });
    expect(d.total_results).toBe(4);
    expect(describeMeasurementBasis(readMeasurementBasis(d))[0]).toContain("faltan 8, y no se rellenan");
  });

  it("is not comparable with a complete run of the same questions", () => {
    const partial = readComparableRun(details(onlyClaude, 12));
    const complete = readComparableRun(details(full, 12));

    const verdict = compareRuns(partial, complete);
    expect(verdict.comparable).toBe(false);
  });

  it("measures how much the headline rests on each engine", () => {
    const d = details(full, 12);

    expect(Object.keys(d.engine_sensitivity).sort()).toEqual(["claude", "gemini", "openai"]);
    // Removing the engine that never named the brand raises the score; removing
    // one that did lowers it. The numbers are recomputed, not estimated.
    expect(d.engine_sensitivity.claude.delta).toBeGreaterThan(0);
    expect(d.engine_sensitivity.gemini.delta).toBeLessThan(0);
    expect(d.engine_sensitivity.claude.score_without).toBeCloseTo(d.geo_score.score + d.engine_sensitivity.claude.delta, 1);
  });

  it("omits sensitivity for a single-engine run: there is nothing to remove", () => {
    expect(details(onlyClaude, 4).engine_sensitivity).toBeUndefined();
  });

  it("provider errors stay out of the valid count and lower the stated confidence", () => {
    const clean = details(rows({ samples: 2 }), 24);
    const broken = details(
      rows({ samples: 2, extractionError: (provider) => (provider === "openai" ? "timeout: extraction" : null) }),
      24
    );

    expect(clean.measurement_basis.responses.clean).toBe(24);
    expect(broken.measurement_basis.responses).toMatchObject({ valid: 24, clean: 16 });
    // 16/24 = 67% < the 80% floor, and the reason says exactly that.
    expect(broken.confidence_reason).toMatch(/solo 16 de 24 respuestas/);
    expect(computeRunScoresFromResults(rows({ samples: 2, extractionError: (p) => (p === "openai" ? "timeout" : null) }), DOMAIN).confidence).toBe("low");
  });
});

describe("confidence reason", () => {
  it("explains each label from the same inputs the label used", () => {
    const low = computeRunScoresFromResults(rows({ prompts: ["a", "b"], engines: ["gemini"] }), DOMAIN);
    expect(low.confidence).toBe("low");
    expect((low.details_json as any).confidence_reason).toMatch(/^Baja: 2 respuestas, por debajo de las 10/);

    const medium = computeRunScoresFromResults(rows({ prompts: ["a", "b", "c", "d"] }), DOMAIN);
    expect(medium.confidence).toBe("medium");
    expect((medium.details_json as any).confidence_reason).toMatch(/^Media: 12 respuestas/);

    const high = computeRunScoresFromResults(rows({ prompts: ["a", "b", "c", "d", "e", "f", "g"] }), DOMAIN);
    expect(high.confidence).toBe("high");
    expect((high.details_json as any).confidence_reason).toMatch(/^Alta: 21 respuestas/);
  });

  it("does not let repeating one question pass for breadth", () => {
    const result = computeRunScoresFromResults(rows({ prompts: ["única"], samples: 5 }), DOMAIN);
    const reason = (result.details_json as any).confidence_reason as string;

    expect(reason).toContain("1 pregunta distinta repetidas hasta 5 veces");
    expect(reason).toContain("no demuestra que se mencione en otras");
  });

  it("states the cap when a missing component limits the composite", () => {
    // 21 responses all clean -> top-level "high"; no authority rows -> composite "medium".
    const d = details(rows({ prompts: ["a", "b", "c", "d", "e", "f", "g"], engines: ["claude", "claude2", "claude3"] }), 21);
    expect(d.geo_score.confidence).toBe("medium");
    expect(d.geo_score.confidence_reason).toContain("El compuesto se limita a «media»");
  });
});

describe("the persisted formula matches its version", () => {
  it("formulas_used.geo_score is the same text as geo_score.formula and names v4 weights", () => {
    const d = details(rows({ mentioned: () => true }), 12);

    expect(d.formulas_used.geo_score).toBe(d.geo_score.formula);
    expect(d.formulas_used.geo_score).toContain("presence .32 / prominence .20 / standing .16 / authority .12 / technical .20");
    expect(d.formulas_used.geo_score).not.toContain("base weights presence .40");
  });
});

describe("comparability across prompt, model, engine and locale changes", () => {
  const base = () => readComparableRun(details(rows({ mentioned: (_p, q) => q === "pregunta 1" }), 12));

  it("same measurement is comparable and says it was actually checked", () => {
    const a = readComparableRun(details(rows(), 12));
    const b = readComparableRun(details(rows(), 12));
    expect(compareRuns(a, b)).toEqual({ comparable: true });
    expect(compareMeasurementBasis(a.basis ?? null, b.basis ?? null)).toEqual({ comparable: true, checked: true });
  });

  it("different questions with the SAME number of responses are no longer comparable", () => {
    // Before MEASUREMENT-BASIS-1 this passed: same version, same components,
    // same engines, same count.
    const changed = readComparableRun(details(rows({ prompts: ["otra 1", "otra 2", "otra 3", "otra 4"] }), 12));
    const verdict = compareRuns(base(), changed);

    expect(verdict).toEqual({ comparable: false, reason: "las preguntas medidas cambiaron entre estos dos escaneos" });
  });

  it("a different model behind the same engine name is not comparable", () => {
    const upgraded = readComparableRun(details(rows({ models: { ...MODELS, openai: "gpt-5-mini" } }), 12));
    const verdict = compareRuns(upgraded, readComparableRun(details(rows(), 12)));

    expect(verdict.comparable).toBe(false);
    expect((verdict as { reason: string }).reason).toBe(
      "el modelo de ChatGPT cambió entre estos dos escaneos (gpt-4o-mini → gpt-5-mini)"
    );
  });

  it("a different country or language is not comparable", () => {
    const verdict = compareRuns(
      readComparableRun(details(rows({ country: "MX" }), 12)),
      readComparableRun(details(rows(), 12))
    );
    expect(verdict).toEqual({
      comparable: false,
      reason: "el país o el idioma de la medición cambió entre estos dos escaneos"
    });
  });

  it("a run scored before the basis existed is not rejected, and is marked unchecked", () => {
    const legacy = { ...readComparableRun(details(rows(), 12)), basis: null };
    const current = readComparableRun(details(rows(), 12));

    expect(compareRuns(current, legacy)).toEqual({ comparable: true });
    expect(compareMeasurementBasis(current.basis ?? null, null)).toEqual({ comparable: true, checked: false });
  });

  it("resolveDelta withholds the delta with the question-set reason", () => {
    const current = readComparableRun(details(rows({ prompts: ["x1", "x2", "x3", "x4"] }), 12));
    const verdict = resolveDelta(5, current, base());

    expect(verdict).toEqual({
      kind: "not_comparable",
      reason: "las preguntas medidas cambiaron entre estos dos escaneos"
    });
  });
});

describe("the headline window honours the same definition", () => {
  const winRow = (runId: string, finishedAt: string, input: ScoreInputRow[]) => {
    const d = details(input, 12);
    return readWindowRun({ run_id: runId, created_at: finishedAt, details_json: d })!;
  };

  it("does not fold runs over different questions into one median", () => {
    const result = computeWindowedScore([
      winRow("c", "2026-10-03T00:00:00Z", rows({ prompts: ["n1", "n2", "n3", "n4"] })),
      winRow("b", "2026-10-02T00:00:00Z", rows()),
      winRow("a", "2026-10-01T00:00:00Z", rows())
    ]);

    // c is the reference and b/a measured other questions, so nothing is
    // eligible with it: the headline falls back to the run's own score, and the
    // verdict says "not comparable", not "not enough runs yet".
    expect(result.verdict).toBe("not_comparable");
    expect(result.value).toBeNull();
    expect(result.latest).not.toBeNull();
  });

  it("does not fold runs with a different engine set, which it never checked before", () => {
    const result = computeWindowedScore([
      winRow("c", "2026-10-03T00:00:00Z", rows({ engines: ["gemini", "claude"] })),
      winRow("b", "2026-10-02T00:00:00Z", rows({ engines: ["gemini", "openai"] })),
      winRow("a", "2026-10-01T00:00:00Z", rows({ engines: ["gemini", "claude"] }))
    ]);

    // c and a share their engines; b swapped one for another at the same row count.
    expect(result.runsUsed).toEqual(["c", "a"]);
    expect(result.verdict).toBe("published");
  });

  it("still publishes over legacy runs that recorded no basis", () => {
    const legacy = (runId: string, finishedAt: string) => ({
      ...winRow(runId, finishedAt, rows()),
      measurement: null
    });
    const result = computeWindowedScore([
      legacy("c", "2026-10-03T00:00:00Z"),
      legacy("b", "2026-10-02T00:00:00Z"),
      legacy("a", "2026-10-01T00:00:00Z")
    ]);

    expect(result.verdict).toBe("published");
    expect(result.runsUsed).toHaveLength(3);
  });
});

describe("API limit notice", () => {
  it("says the numbers come from APIs and are a sample, never a replica", () => {
    expect(MEASUREMENT_API_LIMIT_NOTICE).toMatch(/APIs/);
    expect(MEASUREMENT_API_LIMIT_NOTICE).toMatch(/no una réplica/);
  });
});
