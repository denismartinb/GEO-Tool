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
};

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
        mentionRate: typeof match?.mention_rate === "number" ? match.mention_rate : null
      };
    })
    .filter((row): row is typeof row & { position: number } => row.position !== null)
    .sort(
      (a, b) =>
        a.position - b.position ||
        (b.mentionRate ?? -1) - (a.mentionRate ?? -1) ||
        a.label.localeCompare(b.label, "es")
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));
}
