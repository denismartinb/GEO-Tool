import { describe, expect, it } from "vitest";
import { computeJointPotentialPoints, computeRecommendationPotentialPoints, computeRunScoresFromResults } from "./run-scoring";

type Row = Parameters<typeof computeRunScoresFromResults>[0][number];

const DOMAIN = "genscore.es";

function absentRow(i: number): Row {
  return {
    id: `a-${i}`,
    prompt_text_snapshot: `prompt ${i}`,
    brand_mentioned: false,
    citation_found: false,
    mentioned_competitors_count: 0,
    citations_count: 0,
    sentiment: "unknown",
    extracted_json: { brand: { mentioned: false, position: null }, competitors: [], citations: [] },
    extraction_error: null,
    brand_snapshot: "GenScore"
  };
}

function perfectRow(i: number): Row {
  return {
    ...absentRow(i),
    brand_mentioned: true,
    citation_found: true,
    citations_count: 1,
    sentiment: "positive",
    extracted_json: {
      brand: { mentioned: true, position: 1 },
      competitors: [],
      citations: [{ url: `https://${DOMAIN}/p`, domain: DOMAIN, title: "p", source: "grounding" }]
    }
  };
}

const ids = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `a-${from + i}`);
const score = (rows: Row[]) =>
  (computeRunScoresFromResults(rows, DOMAIN).details_json as { geo_score?: { score?: number } }).geo_score?.score ?? NaN;

/**
 * Audit 2026-10-08, finding 4 — "+87 potential points" on the Overview against
 * "up to +22" on Recomendaciones.
 *
 * Both are JOINT counterfactuals (ADR 0017 §3) over different sets, not sums:
 * all active recommendations vs. the 3-action plan. The overlap is already
 * collapsed by construction. What was wrong was the naming — the figure is the
 * score if every affected prompt were fixed perfectly. These tests pin that
 * meaning so nobody "fixes" the number or the label in the wrong direction.
 */
describe("potential-points ceiling — overlapping recommendations", () => {
  const rows = Array.from({ length: 20 }, (_, i) => absentRow(i));

  const a = { recommendationType: "increase_brand_visibility", affectedPromptIds: ids(0, 9) };
  const b = { recommendationType: "increase_brand_visibility", affectedPromptIds: ids(5, 14) }; // overlaps a on 5..9
  const c = { recommendationType: "close_competitor_gap", affectedPromptIds: ids(10, 19) }; // overlaps b on 10..14

  const standalone = (r: typeof a) =>
    computeRecommendationPotentialPoints(rows, DOMAIN, r.recommendationType, r.affectedPromptIds)!.deltaPoints;

  it("the joint ceiling is never the sum of the standalone deltas, and never below the largest", () => {
    const joint = computeJointPotentialPoints(rows, DOMAIN, [a, b, c])!.deltaPoints;
    const sum = standalone(a) + standalone(b) + standalone(c);
    expect(joint).toBeLessThanOrEqual(sum);
    expect(joint).toBeGreaterThanOrEqual(Math.max(standalone(a), standalone(b), standalone(c)));
    // and the overlap is real in this fixture: summing WOULD overstate it
    expect(sum).toBeGreaterThan(joint);
  });

  it("the same recommendation listed twice adds nothing", () => {
    const once = computeJointPotentialPoints(rows, DOMAIN, [a])!.deltaPoints;
    const twice = computeJointPotentialPoints(rows, DOMAIN, [a, a])!.deltaPoints;
    expect(twice).toBe(once);
  });

  it("a larger set of recommendations is never a smaller ceiling than the plan inside it", () => {
    const plan = computeJointPotentialPoints(rows, DOMAIN, [a])!.deltaPoints;
    const all = computeJointPotentialPoints(rows, DOMAIN, [a, b, c])!.deltaPoints;
    expect(all).toBeGreaterThanOrEqual(plan);
  });

  it("with every prompt at zero, the ceiling is the theoretical maximum — every prompt mentioned, first and cited — not an expectation", () => {
    const everything = [
      { recommendationType: "increase_brand_visibility", affectedPromptIds: ids(0, 19) },
      { recommendationType: "increase_brand_prominence", affectedPromptIds: ids(0, 19) },
      { recommendationType: "add_citation_block", affectedPromptIds: ids(0, 19) }
    ];
    const joint = computeJointPotentialPoints(rows, DOMAIN, everything)!.deltaPoints;
    const real = score(rows);
    const perfect = score(rows.map((_, i) => perfectRow(i)));
    // The ceiling cannot exceed what a flawless run scores...
    expect(real + joint).toBeLessThanOrEqual(perfect + 0.01);
    // ...and with these three kinds over every prompt it reaches almost all of it.
    expect(joint).toBeGreaterThan(0.5 * (perfect - real));
  });
});
