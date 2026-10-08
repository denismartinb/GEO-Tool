import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  COPY_NOT_ENOUGH_COMPARABLE_SCANS,
  COPY_NOT_ENOUGH_COMPARABLE_SCANS_NO_BASIS,
  GeoScoreGaugeCard
} from "@/components/geo-score-gauge-card";
import { resolveGaugeHeadline } from "@/lib/metrics/gauge-headline";
import { readMeasurementBasis } from "@/lib/scoring/measurement-basis";
import { FIXTURE_MODELS, scoredFixtureRun } from "@/lib/scoring/measurement-basis.fixtures";
import type { FixtureRowOptions } from "@/lib/scoring/measurement-basis.fixtures";
import { readComparableRun } from "@/lib/scoring/score-reliability";
import { readWindowRun } from "@/lib/scoring/score-window";

/** Renders the gauge card the way the Overview page does, from persisted runs (oldest first). */
function render(history: ReturnType<typeof scoredFixtureRun>[], sampleNudge: string | null = null) {
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
    <GeoScoreGaugeCard
      headline={headline}
      bandLabel="Emergente"
      bandTone="accent"
      sampleNudge={sampleNudge}
      basisRecorded={readMeasurementBasis(history[history.length - 1].details_json) !== null}
    />
  );
  return { headline, html, latest: perRunTrend[perRunTrend.length - 1] };
}

const THREE_COMPARABLE = () => [
  scoredFixtureRun("a", "2026-10-01T00:00:00Z", { missEvery: 5 }),
  scoredFixtureRun("b", "2026-10-02T00:00:00Z", { missEvery: 4 }),
  scoredFixtureRun("c", "2026-10-03T00:00:00Z", { missEvery: 3 })
];

/** Strip the basis from a persisted run: what every scan taken before this change looks like. */
const withoutBasis = (row: ReturnType<typeof scoredFixtureRun>) => ({
  ...row,
  details_json: { ...(row.details_json as object), measurement_basis: undefined }
});

describe("fixture runs carry all five components", () => {
  it("so the comparable case is not a degenerate two-component run", () => {
    const geo = (THREE_COMPARABLE()[0].details_json as any).geo_score;
    expect(geo.inputs_used.sort()).toEqual(["authority", "presence", "prominence", "standing", "technical"]);
    expect(geo.confidence).toBe("high");
  });
});

describe("GeoScoreGaugeCard — comparable scans", () => {
  it("publishes the median, the variation and the trend, with no withheld note", () => {
    const { headline, html } = render(THREE_COMPARABLE());

    expect(headline.windowPublished).toBe(true);
    expect(headline.deltaVerdict?.kind).toBe("publish");
    expect(html).toMatch(/Últimos \d+ escaneos/);
    expect(html).not.toContain("gauge-withheld-reason");
  });
});

describe("GeoScoreGaugeCard — a change that was verified", () => {
  const cases: Array<[string, FixtureRowOptions, string]> = [
    ["the model of an engine changed", { models: { ...FIXTURE_MODELS, openai: "gpt-5-mini" } }, "el modelo de ChatGPT cambió"],
    ["the questions changed", { prompts: ["otra 1", "otra 2", "otra 3", "otra 4", "otra 5", "otra 6", "otra 7"] }, "las preguntas medidas cambiaron"],
    ["web search was switched off for an engine", { grounding: { gemini: true, openai: false, claude: false } }, "pasó de activada a desactivada"]
  ];

  it.each(cases)("%s: only the median and the variation go away; the latest score stays, with the reason", (_label, change, reason) => {
    const history = [
      scoredFixtureRun("a", "2026-10-01T00:00:00Z", { missEvery: 5 }),
      scoredFixtureRun("b", "2026-10-02T00:00:00Z", { missEvery: 4 }),
      scoredFixtureRun("c", "2026-10-03T00:00:00Z", { missEvery: 3, ...change })
    ];
    const { headline, html, latest } = render(history);

    expect(headline.windowPublished).toBe(false);
    expect(headline.score).toBe(latest);
    expect(html).toContain(`>${latest}<`);
    expect(html).toContain("Emergente");
    expect(html).not.toMatch(/Últimos \d+ escaneos/);
    expect(headline.deltaVerdict?.kind).not.toBe("publish");
    expect(html).toContain("Sin mediana ni variación");
    expect(html).toContain(reason);
    expect(html).toContain("Esta es la puntuación de tu último escaneo");
    // A verified change is not the "not enough scans" message.
    expect(html).not.toContain(COPY_NOT_ENOUGH_COMPARABLE_SCANS);
  });
});

describe("GeoScoreGaugeCard — scans taken before the basis was recorded", () => {
  /** The first weeks after deploy: the newest scan has a basis, the two before it do not. */
  const newestRecorded = () => {
    const history = THREE_COMPARABLE();
    history[0] = withoutBasis(history[0]);
    history[1] = withoutBasis(history[1]);
    return history;
  };
  /** Before the first new scan: nothing has a basis, including the one on screen. */
  const allLegacy = () => THREE_COMPARABLE().map(withoutBasis);

  it("says it in plain words, with no jargon and no promise about the next scan", () => {
    const { headline, html } = render(newestRecorded());

    expect(headline.windowPublished).toBe(false);
    expect(html).toContain(COPY_NOT_ENOUGH_COMPARABLE_SCANS);
    expect(COPY_NOT_ENOUGH_COMPARABLE_SCANS).toBe(
      "Todavía no hay suficientes escaneos comparables para mostrar una tendencia. Puedes ver el resultado de este escaneo y cómo se midió."
    );
    // The jargon the earlier version showed, and the promise it must not make.
    expect(html).not.toContain("no registró con qué preguntas");
    expect(html).not.toMatch(/próximo escaneo/i);
    expect(html).not.toMatch(/se resuelve/i);
    expect(html).not.toMatch(/Últimos \d+ escaneos/);
  });

  it("does not offer 'cómo se midió' when this very scan has no basis to show", () => {
    const { html } = render(allLegacy());

    expect(html).toContain(COPY_NOT_ENOUGH_COMPARABLE_SCANS_NO_BASIS);
    expect(html).not.toContain("cómo se midió");
    expect(html).not.toMatch(/próximo escaneo/i);
  });

  it("keeps the latest scan's score on screen in both situations", () => {
    for (const history of [newestRecorded(), allLegacy()]) {
      const { html, latest } = render(history);
      expect(html).toContain(`>${latest}<`);
    }
  });
});

describe("GeoScoreGaugeCard — legibility of the withheld note", () => {
  it("is 12px in --ink-3, not the 10.5px / --ink-4 caption style (2.6:1, below AA)", () => {
    const { html } = render(THREE_COMPARABLE().map(withoutBasis));
    const note = html.match(/<div style="([^"]*)" data-testid="gauge-withheld-reason"/)?.[1] ?? "";

    expect(note).toContain("font-size:12px");
    expect(note).toContain("color:var(--ink-3)");
    expect(note).not.toContain("ink-4");
    // And it no longer borrows the caption class that carried the faint grey.
    expect(html).not.toMatch(/ov2-gauge-trend-cap[^>]*data-testid="gauge-withheld-reason"/);
  });
});

describe("GeoScoreGaugeCard — thin sample", () => {
  it("keeps the existing nudge ahead of the withheld note", () => {
    const history = [
      scoredFixtureRun("a", "2026-10-01T00:00:00Z", { missEvery: 4 }),
      scoredFixtureRun("b", "2026-10-02T00:00:00Z", { missEvery: 3, models: { ...FIXTURE_MODELS, openai: "gpt-5-mini" } })
    ];
    const { html } = render(history, "Con 3 respuestas de IA más verás franja y evolución. Añade prompts o motores.");

    expect(html).toContain("Con 3 respuestas de IA más verás franja y evolución");
    expect(html).not.toContain("gauge-withheld-reason");
  });
});
