import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GeoScoreGaugeCard } from "@/components/geo-score-gauge-card";
import { resolveGaugeHeadline } from "@/lib/metrics/gauge-headline";
import { FIXTURE_MODELS, fixtureMeasurementRows, type FixtureRowOptions } from "@/lib/scoring/measurement-basis.fixtures";
import type { MeasurementRow } from "@/lib/scoring/measurement-basis";
import { computeRunScoresFromResults, type ScoreInputRow } from "@/lib/scoring/run-scoring";
import { readComparableRun } from "@/lib/scoring/score-reliability";
import { readWindowRun } from "@/lib/scoring/score-window";

const DOMAIN = "acme.com";

/** One scored run, exactly as the scan finaliser persists it. `mentionEvery` sets how often the brand is named. */
function run(runId: string, createdAt: string, options: FixtureRowOptions & { mentionEvery: number }) {
  const measurement = fixtureMeasurementRows(options);
  const rows: ScoreInputRow[] = measurement.map((row: MeasurementRow, index) => {
    const said = index % options.mentionEvery === 0;
    return {
      id: `${runId}-${index}`,
      prompt_text_snapshot: row.prompt_text_snapshot,
      brand_mentioned: said,
      citation_found: false,
      mentioned_competitors_count: 1,
      citations_count: 0,
      sentiment: "unknown",
      extracted_json: { brand: { mentioned: said, position: said ? 1 : null }, competitors: [] },
      extraction_error: null,
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
  const scored = computeRunScoresFromResults(rows, DOMAIN, { expectedResponses: 12, requestedPrompts: 4 });
  return { run_id: runId, created_at: createdAt, details_json: scored.details_json, visibility_score: scored.visibility_score };
}

/** Renders the gauge card the way the Overview page does, from persisted runs (oldest first). */
function render(history: ReturnType<typeof run>[], sampleNudge: string | null = null) {
  const windowRuns = history.map((row) => readWindowRun(row)).filter((row): row is NonNullable<typeof row> => row !== null);
  const perRunTrend = history.map((row) => Math.round((row.details_json as any).geo_score.score));
  const headline = resolveGaugeHeadline({
    windowRuns,
    perRunScore: perRunTrend[perRunTrend.length - 1],
    perRunTrend,
    currentRun: readComparableRun(history[history.length - 1].details_json),
    previousRun: readComparableRun(history[history.length - 2].details_json)
  });
  const html = renderToStaticMarkup(
    <GeoScoreGaugeCard headline={headline} bandLabel="Emergente" bandTone="accent" sampleNudge={sampleNudge} />
  );
  return { headline, html, latest: perRunTrend[perRunTrend.length - 1] };
}

const THREE_COMPARABLE = () => [
  run("a", "2026-10-01T00:00:00Z", { mentionEvery: 4 }),
  run("b", "2026-10-02T00:00:00Z", { mentionEvery: 3 }),
  run("c", "2026-10-03T00:00:00Z", { mentionEvery: 2 })
];

describe("GeoScoreGaugeCard — comparable scans", () => {
  it("publishes the median, the variation and the trend, with no withheld note", () => {
    const { headline, html } = render(THREE_COMPARABLE());

    expect(headline.windowPublished).toBe(true);
    expect(headline.deltaVerdict?.kind).toBe("publish");
    expect(html).toMatch(/Últimos \d+ escaneos/);
    expect(html).not.toContain("gauge-withheld-reason");
  });
});

describe("GeoScoreGaugeCard — scans that did not measure the same thing", () => {
  const cases: Array<[string, FixtureRowOptions, string]> = [
    ["the model of an engine changed", { models: { ...FIXTURE_MODELS, openai: "gpt-5-mini" } }, "el modelo de ChatGPT cambió"],
    ["the questions changed", { prompts: ["otra 1", "otra 2", "otra 3", "otra 4"] }, "las preguntas medidas cambiaron"],
    ["web search was switched off for an engine", { grounding: { gemini: true, openai: false, claude: false } }, "pasó de activada a desactivada"]
  ];

  it.each(cases)("%s: only the median and the variation go away; the latest score stays, with the reason", (_label, change, reason) => {
    const history = [
      run("a", "2026-10-01T00:00:00Z", { mentionEvery: 4 }),
      run("b", "2026-10-02T00:00:00Z", { mentionEvery: 3 }),
      run("c", "2026-10-03T00:00:00Z", { mentionEvery: 2, ...change })
    ];
    const { headline, html, latest } = render(history);

    // The headline falls back to the latest scan's own score…
    expect(headline.windowPublished).toBe(false);
    expect(headline.score).toBe(latest);
    // …which is on screen (the ring draws it as text)…
    expect(html).toContain(`>${latest}<`);
    expect(html).toContain("Emergente");
    // …while the median's trend and the variation are gone…
    expect(html).not.toMatch(/Últimos \d+ escaneos/);
    expect(headline.deltaVerdict?.kind).not.toBe("publish");
    // …and the card says why, in the user's words, not as silence.
    expect(html).toContain("Sin mediana ni variación");
    expect(html).toContain(reason);
    expect(html).toContain("Esta es la puntuación de tu último escaneo");
  });

  it("a run that recorded no basis is never folded in, and says so", () => {
    const history = THREE_COMPARABLE();
    history[0] = { ...history[0], details_json: { ...(history[0].details_json as object), measurement_basis: undefined } };
    history[1] = { ...history[1], details_json: { ...(history[1].details_json as object), measurement_basis: undefined } };
    const { headline, html } = render(history);

    expect(headline.windowPublished).toBe(false);
    expect(html).toContain("no registró con qué preguntas, modelo y búsqueda web se midió");
    expect(html).not.toMatch(/Últimos \d+ escaneos/);
  });
});

describe("GeoScoreGaugeCard — thin sample", () => {
  it("keeps the existing nudge ahead of the withheld note", () => {
    const history = [
      run("a", "2026-10-01T00:00:00Z", { mentionEvery: 3 }),
      run("b", "2026-10-02T00:00:00Z", { mentionEvery: 2, prompts: ["x1", "x2", "x3", "x4"], models: { ...FIXTURE_MODELS, openai: "gpt-5-mini" } })
    ];
    const { html } = render(history, "Con 3 respuestas de IA más verás franja y evolución. Añade prompts o motores.");

    expect(html).toContain("Con 3 respuestas de IA más verás franja y evolución");
    expect(html).not.toContain("gauge-withheld-reason");
  });
});
