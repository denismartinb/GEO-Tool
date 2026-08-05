/**
 * GEO-SCORE-V4 Fase B — engine coverage.
 *
 * Pure and dependency-free, same contract as `lib/scan/sampling.ts`.
 *
 * The problem, measured rather than assumed
 * (docs/geo-score-variability-2026-08.md §1, "Discontinuidades de escala"):
 * a prompt job is counted as successful when AT LEAST ONE engine returns
 * (lib/scan/executor.ts), and a failed engine writes no row at all. So a
 * transient provider outage does not fail the scan — it silently removes rows
 * from the sample. When the engine that dropped out was a grounded one, the
 * `authority` component loses its denominator entirely, gets dropped, and the
 * remaining weights renormalise. Reproduced against the real scorer, same
 * underlying reality:
 *
 *     engines = gemini + openai + claude   ->  GEO 71.67  (4 components)
 *     engines = claude only                ->  GEO 84.31  (3 components)
 *
 * Nearly 13 points of movement caused by a provider having a bad minute. The
 * reliability layer already refuses to publish a DELTA across runs whose
 * engine sets differ (`compareRuns`, docs/adr/0024) — but the score itself is
 * still published, with nothing on it saying it was measured over less than
 * the plan promises. That is the gap this closes.
 *
 * What this module deliberately does NOT do: change the score. A partial run
 * still scores over exactly the rows it has. Manufacturing the missing rows,
 * or zeroing the brand for engines that never answered, would invent data.
 * The verdict here is a FACT ABOUT the measurement, recorded next to it, and
 * consumed by the surfaces that decide what may be asserted from it.
 */

export type EngineCoverageStatus =
  /** Every engine the plan promises produced at least one row. */
  | "complete"
  /** At least one promised engine produced no rows at all. */
  | "partial"
  /** Nothing to judge — no expected engines were resolved for this run. */
  | "unknown";

export type EngineCoverage = {
  status: EngineCoverageStatus;
  /** Engines this run was sized for, from the plan (`resolveScanProvidersForPlan`). */
  expected: string[];
  /** Engines that actually produced at least one completed row. */
  observed: string[];
  /** `expected` minus `observed` — the engines that went silent. */
  missing: string[];
  /**
   * Engines that produced rows without being expected. Normally empty; a
   * non-empty value means the plan's engine set changed mid-run or the run
   * was resumed after a configuration change, which is itself a
   * comparability hazard worth recording rather than discarding.
   */
  unexpected: string[];
};

function normalize(engines: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  for (const engine of engines) {
    if (typeof engine !== "string") continue;
    const trimmed = engine.trim().toLowerCase();
    if (trimmed) seen.add(trimmed);
  }
  return [...seen].sort();
}

/**
 * Compares the engines a run was supposed to measure against the ones that
 * actually produced data.
 *
 * `observedProviders` is intended to be the providers of the run's COMPLETED
 * rows — the exact same set the score is computed over — so the verdict can
 * never disagree with the sample it describes.
 */
export function computeEngineCoverage(input: {
  expectedProviders: readonly (string | null | undefined)[];
  observedProviders: readonly (string | null | undefined)[];
}): EngineCoverage {
  const expected = normalize(input.expectedProviders);
  const observed = normalize(input.observedProviders);

  const missing = expected.filter((engine) => !observed.includes(engine));
  const unexpected = observed.filter((engine) => !expected.includes(engine));

  if (expected.length === 0) {
    return { status: "unknown", expected, observed, missing, unexpected };
  }

  return {
    status: missing.length > 0 ? "partial" : "complete",
    expected,
    observed,
    missing,
    unexpected
  };
}

/**
 * Spanish, user-facing explanation of a partial run, for the surfaces that
 * show the score. Returns null when there is nothing to warn about.
 *
 * Deliberately names the engines: "medido sobre menos motores" without saying
 * which one is missing gives the user nothing they can act on or verify.
 */
export function engineCoverageNotice(coverage: EngineCoverage | null | undefined): string | null {
  if (!coverage || coverage.status !== "partial" || coverage.missing.length === 0) return null;

  const names = coverage.missing.map((engine) => ENGINE_LABELS[engine] ?? engine);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
  const verb = names.length === 1 ? "no respondió" : "no respondieron";

  return `Este escaneo se midió sobre menos motores de los previstos: ${list} ${verb}. La puntuación es real, pero se calculó sobre una muestra más pequeña, así que no es directamente comparable con escaneos completos.`;
}

const ENGINE_LABELS: Record<string, string> = {
  gemini: "Gemini",
  openai: "ChatGPT",
  claude: "Claude"
};
