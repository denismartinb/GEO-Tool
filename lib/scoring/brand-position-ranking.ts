/**
 * Reading `brand_position.ranking` off a persisted run.
 *
 * The ranking is stored inside `run_scores.details_json`, so it is whatever
 * the scoring code wrote *at the time that run was scored* — not what the
 * current code would write. `avg_position_when_mentioned` only exists from
 * geo-score-v3 onward and there is no backfill (docs/adr/0026, decision 4),
 * so for every run scored before that deploy the key is simply **missing**.
 *
 * That makes "absent" and "null" two different runtime values for one
 * meaning: the AI gave this entity no rank. Readers that used `?? null` and
 * readers that used `!== null` therefore disagreed about the same row — which
 * is exactly how the Overview panorama came to show a numeric rank badge
 * beside a "—" position on the same line, for every existing project until
 * its next scan.
 *
 * So the collapse happens once, here, and downstream code reads `position`
 * and only `position`. Divergence stops being something each call site has to
 * remember not to cause.
 */

export type PersistedRankingEntry = {
  name?: string;
  is_brand?: boolean;
  /** Absent on pre-v3 runs. Treat missing and null identically. */
  avg_position_when_mentioned?: number | null;
  mention_rate?: number;
  mention_count?: number;
};

export type RankedEntry<T> = T & {
  /** Mean rank over the prompts where the entity was mentioned; null when it
   *  has no rank at all, whether that was stored as null or never stored. */
  position: number | null;
};

/** The one place "no rank" is decided. */
export function readPosition(entry: PersistedRankingEntry | null | undefined): number | null {
  const raw = entry?.avg_position_when_mentioned;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

/**
 * Normalizes and orders a persisted ranking: best rank first, entities with
 * no rank last. Sorting rather than dropping them keeps the list complete —
 * an entity the AI never named is a real, reportable result — but their
 * array index is NOT a rank, so callers must gate any ordinal they derive on
 * `position !== null`.
 */
export function normalizeRanking<T extends PersistedRankingEntry>(
  ranking: readonly T[] | null | undefined
): Array<RankedEntry<T>> {
  return [...(ranking ?? [])]
    .map((entry) => ({ ...entry, position: readPosition(entry) }))
    .sort((a, b) => {
      if (a.position === null && b.position === null) return 0;
      if (a.position === null) return 1;
      if (b.position === null) return -1;
      return a.position - b.position;
    });
}

/** How many entities the AI actually named — the honest denominator for
 *  "your rank X of N". Counting the whole array counts brands that never
 *  appeared as if they were competing for the same places. */
export function countRanked(ranking: readonly RankedEntry<PersistedRankingEntry>[]): number {
  return ranking.filter((entry) => entry.position !== null).length;
}
