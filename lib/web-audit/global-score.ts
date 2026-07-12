/**
 * Global "Preparación GEO" score for the web-audit hero (WEB-AUDIT-R1).
 *
 * Honest composite: the plain (unweighted) mean of the real 0-100 signals the
 * page already computes — topic coverage, AI surfacing rate, and the
 * technical readiness score — over ONLY the components that actually have a
 * value. A missing component (e.g. the technical audit has never run) is
 * excluded from the mean and reported as `value: null`, never imputed or
 * defaulted; the hero always renders the per-component breakdown next to the
 * composite so the number is never a black box. If no component has a value,
 * there is no score (`score: null`) — never a fake 0 or placeholder.
 *
 * Pure function over plain data (no I/O, no "server-only"), importable from
 * Vitest — same rationale as opportunity-matrix.ts / action-plan.ts.
 */

export type GlobalScoreComponentKey = "content" | "surfacing" | "technical";

export type GlobalScoreComponent = {
  key: GlobalScoreComponentKey;
  /** 0-100, or null when this signal has never been computed. */
  value: number | null;
};

export type GlobalScore = {
  /** Rounded mean of the non-null components, or null when none exist. */
  score: number | null;
  components: GlobalScoreComponent[];
  /** How many components the mean was actually taken over. */
  includedCount: number;
};

function clampPct(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function buildGlobalScore(input: {
  coveragePct: number | null;
  surfacingPct: number | null;
  technicalScore: number | null;
}): GlobalScore {
  const components: GlobalScoreComponent[] = [
    { key: "content", value: input.coveragePct === null ? null : clampPct(input.coveragePct) },
    { key: "surfacing", value: input.surfacingPct === null ? null : clampPct(input.surfacingPct) },
    { key: "technical", value: input.technicalScore === null ? null : clampPct(input.technicalScore) }
  ];

  const present = components.filter((c): c is GlobalScoreComponent & { value: number } => c.value !== null);
  const score =
    present.length === 0 ? null : Math.round(present.reduce((acc, c) => acc + c.value, 0) / present.length);

  return { score, components, includedCount: present.length };
}
