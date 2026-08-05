/**
 * GEO-SCORE-V4 — resolving the `technical` component of the composite.
 *
 * Pure and dependency-free on purpose, exactly like `lib/scan/sampling.ts`:
 * which technical-readiness snapshot a run scores against is a decision that
 * has to be reproducible in a test without a database.
 *
 * Why this component exists (founder decision, 2026-08-05): a site that is not
 * technically readable by AI engines cannot benefit from any other GEO work,
 * so technical readiness belongs inside the headline number rather than beside
 * it. See docs/adr/0033-geo-score-v4-technical-component.md.
 *
 * Why it also *stabilises* the score, which is the reason it is safe to give
 * it real weight: `readiness_score` is computed by pure string/regex checks
 * (lib/web-audit/page-checks.ts) with no LLM anywhere in the calculation. The
 * same site scores the same number. Every other component is a measurement of
 * live LLM answers over non-deterministic retrieval. Giving weight w to a
 * deterministic component scales the volatile part of the composite by
 * (1 - w), so the run-to-run standard deviation contributed by LLM noise drops
 * by the same factor — at w = 0.20, a 20% reduction, on top of everything
 * Fases A and B do.
 *
 * THE TIMING PROBLEM this module solves. The web audit runs *after* the scan
 * completes (docs/adr/0027), and with retries its window reaches ~12.5h. So at
 * the moment a run is first scored, the audit belonging to that run usually
 * does not exist yet. Three bad options and the one taken:
 *
 *   - Block scoring until the audit lands: the user stares at a scan that
 *     finished but has no score. Rejected.
 *   - Score without `technical`, then re-score when the audit arrives: the
 *     published number visibly jumps. That is the very failure mode this whole
 *     phase exists to remove. Rejected as the *primary* path.
 *   - TAKEN: score against the project's most recent existing snapshot, then
 *     re-score against this run's own snapshot when it lands. A site's
 *     technical readiness does not change in the minutes between a scan and
 *     its audit unless the owner deployed, so the re-score is normally a
 *     no-op or a change of a fraction of a point — and when it is NOT a no-op,
 *     the site genuinely changed and the movement is real signal.
 *
 * The first scan of a brand-new project has no prior snapshot, so `technical`
 * is dropped there and the remaining four components renormalise to exactly
 * their v3 weights (see run-scoring.ts). There is no previous run to be
 * compared against on a project's first scan, so this costs no stability.
 */

/**
 * How old the project's most recent snapshot may be before it stops standing
 * in for this run's own audit.
 *
 * 30 days is deliberately generous rather than tight. The failure mode of a
 * window that is too SHORT is the one that hurts: the component drops out,
 * the weights renormalise, and the score steps by several points for a reason
 * that has nothing to do with the site or the AI answers — manufacturing
 * exactly the discontinuity documented as variance source V4/V5 in
 * docs/adr/0032. The failure mode of a window that is too LONG is scoring
 * against a slightly stale readiness figure for a site whose audit has been
 * failing for weeks, which is both rarer and milder. When the audit pipeline
 * is healthy this constant is never reached: every scan enqueues an audit
 * (docs/adr/0027), so the newest snapshot is at most one scan old.
 */
export const TECHNICAL_SNAPSHOT_MAX_AGE_DAYS = 30;

/**
 * How many of a project's most recent snapshots to load when resolving the
 * component. Only the newest eligible one can ever win, so this is a query
 * bound rather than a policy: it exists so a project with years of audits
 * does not pull its whole history into memory to answer one question.
 */
export const TECHNICAL_SNAPSHOT_LOOKUP_LIMIT = 10;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** A `web_audit_snapshots` row, narrowed to what the decision needs. */
export type TechnicalSnapshotCandidate = {
  id: string;
  /** `web_audit_snapshots.scan_id` — the run the audit was triggered by. */
  scan_id: string | null;
  /** 0–100, or null when no page could be analysed. */
  readiness_score: number | null;
  created_at: string;
};

export type TechnicalComponentSource =
  /** The audit triggered by this very run (docs/adr/0027). The precise case. */
  | "this_run"
  /** The project's most recent earlier snapshot, standing in until this run's own audit lands. */
  | "recent_project_snapshot";

export type ResolvedTechnicalComponent = {
  /** 0–100, higher is better — feeds the composite directly. */
  value: number;
  snapshot_id: string;
  captured_at: string;
  source: TechnicalComponentSource;
  /** Whole days between the snapshot and the run being scored. 0 for `this_run`. */
  age_days: number;
};

export type TechnicalComponentResolution = {
  component: ResolvedTechnicalComponent | null;
  /**
   * Why there is no component, in the same self-authored, user-readable style
   * the other dropped components use in run-scoring.ts. Null when resolved.
   */
  reason: string | null;
};

function isUsableScore(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function toTime(value: string | Date): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/**
 * Picks the technical-readiness snapshot a run scores against.
 *
 * Preference order, and it is a strict order rather than a heuristic:
 *
 *   1. The snapshot whose `scan_id` is this run — the audit this run itself
 *      triggered. Exact by construction, so it wins regardless of dates.
 *   2. Otherwise the most recent snapshot taken AT OR BEFORE the run, within
 *      TECHNICAL_SNAPSHOT_MAX_AGE_DAYS.
 *
 * Rule 2 deliberately refuses snapshots taken *after* the run that belong to
 * some *other* run. Accepting them would make a historical run's score change
 * every time a later scan audits the site, which would silently rewrite
 * history — the same objection docs/adr/0026 records against backfilling
 * position data, and it would break `compareRuns` in a way no version bump
 * could express.
 */
export function resolveTechnicalComponent(input: {
  /** `scan_runs.id` of the run being scored. */
  runId: string;
  /** When the run finished — the reference point for "recent". */
  runFinishedAt: string | Date;
  /** Snapshots for THIS project only. Order does not matter. */
  snapshots: readonly TechnicalSnapshotCandidate[];
  maxAgeDays?: number;
}): TechnicalComponentResolution {
  const maxAgeDays = input.maxAgeDays ?? TECHNICAL_SNAPSHOT_MAX_AGE_DAYS;
  const runTime = toTime(input.runFinishedAt);

  const usable = input.snapshots.filter((snapshot) => isUsableScore(snapshot.readiness_score));

  if (usable.length === 0) {
    return {
      component: null,
      reason:
        input.snapshots.length === 0
          ? "no technical audit has been recorded for this project yet (docs/adr/0027)"
          : "the project's technical audits produced no readiness score (no page could be analysed)"
    };
  }

  const own = usable.find((snapshot) => snapshot.scan_id === input.runId);
  if (own) {
    return {
      component: {
        value: own.readiness_score as number,
        snapshot_id: own.id,
        captured_at: own.created_at,
        source: "this_run",
        age_days: 0
      },
      reason: null
    };
  }

  if (!Number.isFinite(runTime)) {
    return {
      component: null,
      reason: "the run has no finish time to resolve a technical snapshot against"
    };
  }

  let best: TechnicalSnapshotCandidate | null = null;
  let bestTime = -Infinity;
  for (const snapshot of usable) {
    const time = toTime(snapshot.created_at);
    if (!Number.isFinite(time)) continue;
    if (time > runTime) continue; // never score a run against a later run's audit
    if (runTime - time > maxAgeDays * MS_PER_DAY) continue;
    if (time > bestTime) {
      bestTime = time;
      best = snapshot;
    }
  }

  if (!best) {
    return {
      component: null,
      reason: `no technical audit within ${maxAgeDays} days before this scan (the audit for this scan may still be running, docs/adr/0027)`
    };
  }

  return {
    component: {
      value: best.readiness_score as number,
      snapshot_id: best.id,
      captured_at: best.created_at,
      source: "recent_project_snapshot",
      age_days: Math.floor((runTime - bestTime) / MS_PER_DAY)
    },
    reason: null
  };
}
