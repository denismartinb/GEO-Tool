/**
 * PANORAMA-EMPTY-1 — which of the panorama's four real states applies, and
 * what each one hands the renderer.
 *
 * `rankLatestPositions` (PANORAMA-PARITY-1) answers "who's ahead, in what
 * order" for a scan that HAS a ranking. It says nothing about a scan that
 * doesn't, and until this module the panorama's own layer collapsed those
 * into a single fallback that only ever looked like state B with worse data —
 * a live customer's first scan (mozilla.org's own genscore.es project,
 * 2026-08-07, zero mentions across the board) rendered as six rows of `0%`
 * with no explanation, because nothing distinguished "nobody has been
 * mentioned yet" from "somebody has, here's the list".
 *
 * Four states, and only one of them is what the panorama used to assume:
 *
 * - **empty** — nobody (brand or any tracked competitor) was named in this
 *   scan. Detected off `fallbackMentionRate`, not off the ranking: it must
 *   fire whether or not `hasPositionData` is true, because a scan can have
 *   valid extraction and still name nobody. A wall of `0%` rows answers a
 *   question nobody asked; the renderer replaces it with an explanation.
 * - **unranked** — pre-geo-score-v3 scan (docs/adr/0026, no backfill): no
 *   `avg_position_when_mentioned` for anybody, but real, non-zero mention
 *   data exists. Genuinely different from `empty` — there IS something to
 *   show, just not a standing — so it keeps the existing mention-only list,
 *   sorted by mention rate, brand pinned first.
 * - **ranked** — a real ranking exists. `topRows` is always the true top 5,
 *   never padded with the brand's own row: forcing you into "your" top-5
 *   bars when you're 6th is the inversion of what a leaderboard means.
 *   `brandRank` is the brand's real standing, or null when the brand itself
 *   was never named even though others were (the scan you'd see on a
 *   dormant or newly-tracked domain sitting next to well-established
 *   competitors). `listRows` appends the brand's own row after the top 5
 *   ONLY when the brand has a rank to show — an unranked brand gets no row
 *   at all (founder decision, 2026-08-07: the headline already says "no
 *   apareciste"; a row with nothing in its position column repeats that with
 *   less information). `brandAppended` tells the renderer whether that
 *   append happened, so it can draw the visual break instead of letting a
 *   gap in the row order read as a bug.
 */

import { rankLatestPositions, type LatestPositionRow } from "./latest-positions";
import type { PersistedRankingEntry } from "@/lib/scoring/brand-position-ranking";

export type PanoramaEntityInput = {
  key: string;
  name: string;
  domain: string | null;
  isBrand: boolean;
  /**
   * Mention rate computed independently of the persisted ranking (from the
   * run's raw prompt results), 0-100. This is what decides `empty`: it is
   * available even on a pre-v3 scan that has no ranking to consult at all.
   */
  fallbackMentionRate: number;
};

export type PanoramaRow = {
  key: string;
  name: string;
  domain: string | null;
  isBrand: boolean;
  mentionRate: number | null;
  /** Mean rank when mentioned. Never published as a number — encode as a bar. */
  position: number | null;
  rank: number | null;
};

export type PanoramaState =
  | { kind: "empty" }
  | { kind: "unranked"; rows: PanoramaRow[] }
  | {
      kind: "ranked";
      /** Every ranked entity, best first. */
      rows: PanoramaRow[];
      /** The real top 5 — what the bars draw. Never includes the brand just to include it. */
      topRows: PanoramaRow[];
      /** `topRows`, plus the brand's own row appended when it fell outside the top 5. */
      listRows: PanoramaRow[];
      /** The brand's 1..N standing, or null when the brand itself was never named. */
      brandRank: number | null;
      /** Entities the AI actually named this scan — the honest denominator for "X / N". */
      totalRanked: number;
      /** True when `listRows` ends with the brand's row appended past the top 5. */
      brandAppended: boolean;
    };

export function computePanoramaState({
  entities,
  ranking,
  hasPositionData
}: {
  entities: readonly PanoramaEntityInput[];
  ranking: readonly PersistedRankingEntry[] | null | undefined;
  hasPositionData: boolean;
}): PanoramaState {
  const allMentionsZero = entities.every((e) => e.fallbackMentionRate === 0);
  if (allMentionsZero) return { kind: "empty" };

  const rankedPanorama = rankLatestPositions({
    entities: entities.map((e) => ({ key: e.key, label: e.name, isBrand: e.isBrand, domain: e.domain })),
    ranking
  });

  if (!hasPositionData || rankedPanorama.length === 0) {
    const rows: PanoramaRow[] = [
      ...entities.filter((e) => e.isBrand),
      ...entities
        .filter((e) => !e.isBrand)
        .slice()
        .sort((a, b) => b.fallbackMentionRate - a.fallbackMentionRate)
    ].map((e) => ({
      key: e.key,
      name: e.name,
      domain: e.domain,
      isBrand: e.isBrand,
      mentionRate: e.fallbackMentionRate,
      position: null,
      rank: null
    }));
    return { kind: "unranked", rows };
  }

  const rows: PanoramaRow[] = rankedPanorama.map((row) => toPanoramaRow(row));
  const topRows = rows.slice(0, 5);
  const brandRow = rows.find((r) => r.isBrand);
  const listRows = brandRow && !topRows.some((r) => r.isBrand) ? [...topRows, brandRow] : topRows;

  return {
    kind: "ranked",
    rows,
    topRows,
    listRows,
    brandRank: rankedPanorama.find((r) => r.isBrand)?.rank ?? null,
    totalRanked: rankedPanorama.length,
    brandAppended: listRows.length > topRows.length
  };
}

function toPanoramaRow(row: LatestPositionRow<{ key: string; label: string; domain: string | null; isBrand?: boolean }>): PanoramaRow {
  return {
    key: row.key,
    name: row.label,
    domain: row.domain,
    isBrand: Boolean(row.isBrand),
    mentionRate: row.mentionRate,
    position: row.position,
    rank: row.rank
  };
}
