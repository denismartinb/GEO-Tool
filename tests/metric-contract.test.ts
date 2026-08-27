import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TRUST-METRICS-1 (docs/external-audit-2026-08.md, Fase 1) — source-level
 * regression guard, same shape as `tests/mission-parity.test.ts`: known files,
 * known invariants, checked without a browser.
 *
 * WHAT THIS DOES NOT DO. It does not sweep the whole repository looking for
 * "any percentage computed inline" — most of the product legitimately
 * computes percentages of its own, in files this phase never touched
 * (`lib/free-checker/`, `lib/scoring/geo-score-technical.ts`, the blog…), and
 * a blanket rule would either false-positive on all of them or be too vague
 * to mean anything. Instead this file pins down the FIVE specific places the
 * external audit found broken and asserts the fix is still there, in the
 * source, by name — not by re-deriving product behaviour from a regex.
 */

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("TRUST-METRICS-1 — the headline GEO score has one owner", () => {
  it("Dominios (project-workspace.ts) resolves latestScoreByProject via resolveGeoScore, not a raw visibility_score read", () => {
    const source = read("lib/project-workspace.ts");
    expect(source).toContain('import { resolveGeoScore, type GeoScoreRunRow } from "@/lib/metrics/run-metrics"');
    expect(source).toMatch(/latestScoreByProject\[projectId\]\s*=.*resolveGeoScore/s);
  });

  it("the completion notification (executor.ts) resolves geoScore via resolveGeoScore before emitting", () => {
    const source = read("lib/scan/executor.ts");
    expect(source).toContain('import { resolveGeoScore } from "@/lib/metrics/run-metrics"');
    expect(source).toMatch(/geoScoreForNotification\s*=\s*resolveGeoScore/);
    // The payload must carry the resolved figure under `geoScore` — not
    // `visibilityScore` relabelled — so render.ts has something honest to
    // read before falling back.
    expect(source).toMatch(/geoScore:\s*geoScoreForNotification/);
  });

  it("render.ts headlines payload.geoScore, falling back to visibilityScore only for rows persisted before it existed", () => {
    const source = read("lib/notifications/render.ts");
    expect(source).toMatch(/num\(payload\.geoScore\)\s*\?\?\s*num\(payload\.visibilityScore\)/);
    // The old body literally interpolated the raw score under "Visibilidad" —
    // that string must not exist as a rendered label anymore.
    expect(source).not.toMatch(/`Visibilidad \$\{/);
    expect(source).toContain("Escaneo actualizado: Puntuación GEO");
  });
});

describe("TRUST-METRICS-1 — every answer-row percentage carries its denominator", () => {
  it("Competidores composes 'X respuestas (Y prompts × Z motores)' only via answerCountLabel, never a bare prompt count", () => {
    const source = read("app/dashboard/projects/[projectId]/competitors/page.tsx");
    expect(source).toContain('import { answerCountLabel, citationRate, mentionRateByAnswer } from "@/lib/metrics/run-metrics"');
    expect(source).toMatch(/answerCountLabel\(promptCount, engineCount, totalResultsCount\)/);
    // The audit's exact wrong sentence must not be reconstructable from a
    // literal template anywhere in this file.
    expect(source).not.toMatch(/\$\{totalResultsCount\} prompts/);
  });

  it("brandMentionRate/brandCitationRate are read from the module's RateMetric, not computed inline with Math.round", () => {
    const source = read("app/dashboard/projects/[projectId]/competitors/page.tsx");
    expect(source).toMatch(/const brandMentionRateMetric = mentionRateByAnswer\(brandMentions, totalResultsCount\)/);
    expect(source).toMatch(/const brandCitationRateMetric = citationRate\(brandCitations, totalResultsCount\)/);
  });
});

describe("TRUST-METRICS-1 — an engine that ran is never hidden for scoring an honest zero (P1-03)", () => {
  it("Competidores' matrixEngines is brandEngineBreakdown directly, not filtered by filterComparableEngines", () => {
    const source = read("app/dashboard/projects/[projectId]/competitors/page.tsx");
    expect(source).toMatch(/const matrixEngines = brandEngineBreakdown;/);
    expect(source).not.toMatch(/matrixEngines = filterComparableEngines\(/);
  });
});
