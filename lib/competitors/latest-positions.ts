/**
 * PANORAMA-PARITY-1 — the one place "who is ahead of whom in the latest scan"
 * is decided.
 *
 * Two screens answer that question: the Competidores page's "Puesto en el
 * último escaneo" list and the Overview's "Panorámica competitiva". They read
 * the same `brand_position.ranking` off the same run and, until this module,
 * ordered it two different ways — so on the founder's Mozilla project Proton
 * VPN was 1º on one screen and 2º on the other (it ties Amazon at 1,00 and only
 * one of the two screens broke the tie). `.claude/rules/competitors.md` calls
 * that a defect, not a nuance: "dos números con el mismo significado y distinto
 * valor es un fallo" (ADR 0018).
 *
 * What this function does NOT do is compute anything new. The ordering and the
 * 1..N ranking are exactly what the Competidores list already did (log §15);
 * they moved here so a second caller cannot drift from them.
 *
 * The rules it encodes, each traceable to that section of the log:
 *
 * - **A rank is a 1..N order, never the raw mean.** The number behind it is a
 *   mean rank over the prompts where the entity was named, and a mean is almost
 *   never 1,00 — printing it made the list look like nobody was in first place.
 * - **Ties break by mention rate**, because at the same mean rank the brand the
 *   AI names in more answers is genuinely ahead, and that percentage is already
 *   on screen beside the name, so the tiebreak is visible rather than arbitrary.
 *   Name last, purely so the order is stable between renders instead of
 *   depending on the caller's array order.
 * - **No rank means no row.** Under geo-score-v3 an entity the AI never named
 *   has no position at all (docs/adr/0026), and giving it one would invent data.
 * - **A mean over too few answers does not outrank a mean over many**
 *   (SAMPLE-FLOOR-1, see `MIN_MENTION_RATE_FOR_RANK` below).
 */

import { readPosition, type PersistedRankingEntry } from "@/lib/scoring/brand-position-ranking";

/** What a caller must tell us about each entity it wants ranked. */
export type LatestPositionEntity = {
  /** Caller's own stable key — echoed back untouched, for React and for joins. */
  key: string;
  /** Display name, and how a non-brand entity is matched to the persisted ranking. */
  label: string;
  /** The project's own brand. Matched by `is_brand`, never by name. */
  isBrand?: boolean;
};

export type LatestPositionRow<T> = T & {
  /** Mean rank when mentioned, kept for callers that need the underlying value. */
  position: number;
  /** Percentage of the scan's answers that named this entity, 0-100. */
  mentionRate: number | null;
  /** 1..N standing among the entities the AI actually named in this scan. */
  rank: number;
  /**
   * Whether this row's mean rank rests on enough answers to be compared with
   * the others (SAMPLE-FLOOR-1). `false` rows keep their real figures and
   * their row, sorted last — the renderer must say why rather than hide them.
   */
  qualified: boolean;
};

/**
 * SAMPLE-FLOOR-1 (2026-08-27) — how much evidence a mean rank needs before it
 * is allowed to outrank another.
 *
 * `avg_position_when_mentioned` is honest per answer and misleading across
 * entities, because nothing in it says how many answers it averages. On the
 * founder's movistar.es scan (30 answers) Euskaltel was named **once**, came
 * first in that single answer, and therefore led the standings at 1,00 — above
 * Movistar, named in 26 of the 30. Both screens published it: "Euskaltel 1º ·
 * 3% de mención", which no reader parses as "we saw it once".
 *
 * A floor, not a filter. An entity below it keeps its row, its mention rate
 * and its real mean — it simply cannot jump the queue on one lucky answer.
 * Hiding it would trade one wrong impression for a missing one.
 *
 * Expressed as a RATE because it has to hold at both ends of the scan-size
 * range: a fixed count of 3 is 10% of a 30-answer scan and 0,6% of a
 * 500-answer one, which is noise. The absolute companion floor only guards the
 * other extreme — on a 10-answer first scan, 10% is a single answer, which is
 * the very thing this exists to stop.
 */
export const MIN_MENTION_RATE_FOR_RANK = 10;
export const MIN_MENTIONS_FOR_RANK = 2;

/**
 * Reads the floor off what the run actually persisted.
 *
 * Fail direction is deliberate: an entry that carries NEITHER figure is
 * treated as qualified. Pre-v3 runs (docs/adr/0026) are already dropped for
 * having no position at all, so this only ever covers a partially-written
 * entry — and demoting a row for a key that was never stored would be
 * inventing a verdict out of a gap in the data.
 */
function qualifiesForRank(entry: PersistedRankingEntry | null | undefined): boolean {
  const rate = entry?.mention_rate;
  const count = entry?.mention_count;
  if (typeof rate === "number" && rate < MIN_MENTION_RATE_FOR_RANK) return false;
  if (typeof count === "number" && count < MIN_MENTIONS_FOR_RANK) return false;
  return true;
}

function normKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Ranks the entities the AI named in one scan, best first.
 *
 * The brand is matched by `is_brand` rather than by name: a persisted entry's
 * name is whatever was stored when the run was scored, so a brand renamed since
 * then would silently stop matching itself.
 */
export function rankLatestPositions<T extends LatestPositionEntity>({
  entities,
  ranking
}: {
  entities: readonly T[];
  ranking: readonly PersistedRankingEntry[] | null | undefined;
}): Array<LatestPositionRow<T>> {
  const entries = ranking ?? [];

  return entities
    .map((entity) => {
      const match = entity.isBrand
        ? entries.find((e) => e.is_brand)
        : entries.find((e) => !e.is_brand && e.name && normKey(e.name) === normKey(entity.label));
      return {
        ...entity,
        position: readPosition(match),
        mentionRate: typeof match?.mention_rate === "number" ? match.mention_rate : null,
        qualified: qualifiesForRank(match)
      };
    })
    .filter((row): row is typeof row & { position: number } => row.position !== null)
    .sort(
      (a, b) =>
        // The floor outranks the mean itself: a 1,00 over one answer sits
        // behind a 1,50 over twenty-six, which is the whole of SAMPLE-FLOOR-1.
        Number(b.qualified) - Number(a.qualified) ||
        a.position - b.position ||
        (b.mentionRate ?? -1) - (a.mentionRate ?? -1) ||
        a.label.localeCompare(b.label, "es")
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));
}
