import "server-only";

/**
 * RECS-LOOP-1 Fase B — closes the half of the loop Fase A explicitly left
 * open (ADR 0041, `.claude/rules/recommendations.md` "Verificación de la
 * predicción"): a `dismissed` row never gets `resolved_in_run_id` written
 * (dismissal is a manual click, not something the system detects by
 * re-scanning), so Fase A's mechanism — pin to the run that confirmed the
 * gap gone — has no anchor to pin to.
 *
 * The question this module answers instead: after a gap was marked done, did
 * it come back? Same signal `computeRecommendationTransition`
 * (recommendation-history.ts) already uses to decide "resolved" — whether the
 * gap's dedupe_key reappears among a run's recommendation rows — applied to
 * ONE specific later run rather than every subsequent one, so the answer is a
 * dated observation, not a metric that keeps changing underneath an already-
 * rendered history row (ADR 0041 §6: "observation, never a live estimate").
 *
 * The anchor is the FIRST completed scan run whose `created_at` is after the
 * dismissal's `updated_at` — never a rolling "most recent run" check. Pinning
 * once keeps the attribution window as narrow as it can be (the run
 * immediately after the click) and keeps a rendered history row from
 * silently flipping verdict on a later render, the same "pin once, do not
 * re-check" shape Fase A already established for resolved rows.
 */

export type DismissedRow = {
  id: string;
  dedupeKey: string;
  /** `recommendations.updated_at` for this row — the dismissal timestamp,
   *  reliable because nothing else ever writes a `dismissed` row (every
   *  finalize write is scoped to `status='active'`, RECS-FINALIZE-DURABILITY-1). */
  dismissedAt: string;
};

export type CandidateRun = {
  id: string;
  /** `scan_runs.created_at`, not `finished_at` — guarantees every row of that
   *  run was generated after the dismissal, including one that was already
   *  in flight the moment the user clicked. */
  createdAt: string;
};

export type RecurrenceVerdict =
  | { status: "no_verdict" }
  | { status: "did_not_recur"; anchorRunId: string; anchorRunCreatedAt: string }
  | { status: "recurred"; anchorRunId: string; anchorRunCreatedAt: string };

/**
 * Pure — no DB access. `candidateRuns` and `dedupeKeysByRunId` are pre-fetched
 * by the caller (app/dashboard/projects/[projectId]/recommendations/page.tsx),
 * same shape as the Fase A precedent in prediction-verification.ts.
 *
 * `dedupeKeysByRunId` must carry every `recommendations` row for a candidate
 * run, of ANY status — not just `active`. A run with no entry at all (as
 * opposed to an entry that exists but omits this dedupe_key) is
 * indistinguishable from "the finalize insert for that run failed"
 * (RECS-FINALIZE-DURABILITY-1 logs that failure but the run still completes),
 * so it fails closed to `no_verdict` rather than reading an empty run as
 * "the gap is gone" — publishing a win caused by a persistence failure would
 * be worse than staying silent about the rare genuinely-empty run.
 */
export function computeDismissalRecurrence(opts: {
  dismissedRows: readonly DismissedRow[];
  candidateRuns: readonly CandidateRun[];
  dedupeKeysByRunId: ReadonlyMap<string, ReadonlySet<string>>;
}): Map<string, RecurrenceVerdict> {
  const sortedRuns = [...opts.candidateRuns].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const out = new Map<string, RecurrenceVerdict>();

  for (const row of opts.dismissedRows) {
    // Pre-RECS-3 rows have no dedupe_key at all — nothing to match against,
    // ever (not a "wait for the next scan" case, a permanent no_verdict).
    if (!row.dedupeKey) {
      out.set(row.id, { status: "no_verdict" });
      continue;
    }

    const dismissedAtMs = new Date(row.dismissedAt).getTime();
    const anchor = sortedRuns.find((run) => new Date(run.createdAt).getTime() > dismissedAtMs);
    if (!anchor) {
      out.set(row.id, { status: "no_verdict" });
      continue;
    }

    const keysInAnchor = opts.dedupeKeysByRunId.get(anchor.id);
    if (!keysInAnchor || keysInAnchor.size === 0) {
      out.set(row.id, { status: "no_verdict" });
      continue;
    }

    out.set(
      row.id,
      keysInAnchor.has(row.dedupeKey)
        ? { status: "recurred", anchorRunId: anchor.id, anchorRunCreatedAt: anchor.createdAt }
        : { status: "did_not_recur", anchorRunId: anchor.id, anchorRunCreatedAt: anchor.createdAt }
    );
  }

  return out;
}
