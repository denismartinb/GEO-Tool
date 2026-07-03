/**
 * Pure cross-run comparison logic for RECS-3 ("memory" between scans):
 * given the previous run's recommendation rows and the current run's
 * dedupe_keys, decide which prior gaps are now resolved (a real win — gone,
 * not manually dismissed) and what consecutive_runs_open value each
 * currently-open gap should carry.
 *
 * Deliberately pure/no I/O so lib/scan/executor.ts can unit-test it without
 * mocking Supabase, and so the underlying idempotency requirement is easy to
 * verify directly: the caller must read the previous run's rows by their
 * fixed run_id (see 0010_recommendations_history.sql migration notes), not
 * by mutable status, so retries of the same finalize step recompute the same
 * result deterministically.
 */

export type PreviousRecommendationRow = {
  dedupe_key: string;
  status: string;
  consecutive_runs_open: number;
};

export type RecommendationTransition = {
  /** dedupe_keys that were open (active) last run and did NOT recur this run — a real win. */
  resolvedDedupeKeys: string[];
  /** consecutive_runs_open value to persist for each of THIS run's dedupe_keys. */
  consecutiveRunsByDedupeKey: Map<string, number>;
};

export function computeRecommendationTransition(opts: {
  previousRows: PreviousRecommendationRow[];
  currentDedupeKeys: string[];
}): RecommendationTransition {
  // Pre-migration/backfilled rows have dedupe_key === '' — never treat '' as
  // a real identity match (every current-run gap would spuriously look
  // "resolved" against a shared empty key on the first run after deploy).
  const previousByKey = new Map(
    opts.previousRows.filter((row) => row.dedupe_key).map((row) => [row.dedupe_key, row])
  );
  const currentSet = new Set(opts.currentDedupeKeys);

  const resolvedDedupeKeys = Array.from(previousByKey.values())
    .filter((prev) => prev.status !== "dismissed" && !currentSet.has(prev.dedupe_key))
    .map((prev) => prev.dedupe_key);

  const consecutiveRunsByDedupeKey = new Map<string, number>();
  for (const key of opts.currentDedupeKeys) {
    const prev = previousByKey.get(key);
    // A gap that was manually dismissed last run and reappears is a fresh
    // occurrence, not a continuing streak — restart at 1.
    const streak = prev && prev.status !== "dismissed" ? prev.consecutive_runs_open + 1 : 1;
    consecutiveRunsByDedupeKey.set(key, streak);
  }

  return { resolvedDedupeKeys, consecutiveRunsByDedupeKey };
}
