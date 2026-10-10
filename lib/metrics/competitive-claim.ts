/**
 * AUDIT-TRUTH-1 (GS-02, external product audit 2026-10-11, log §276) — the
 * single owner of "what may the Overview summary claim about the brand
 * against its competitors".
 *
 * WHY THIS EXISTS. The summary sentence used to end in a default branch:
 * "Hoy mantienes la mayor visibilidad frente a tus competidores" whenever no
 * competitor beat the brand and the brand had at least one own citation. It
 * never checked that a competitor existed, nor that the brand itself was
 * named. A project with zero competitors and 0 of 72 mentions therefore read
 * as the market leader. Leadership is a comparison, so it can only be
 * claimed when there is something to compare against, the brand is ahead of
 * it, and the sample is large enough to say so.
 *
 * Pure, no I/O.
 */

export type CompetitiveClaim =
  /** A competitor has a higher mention rate than the brand. */
  | { kind: "behind"; competitor: string; competitorRate: number }
  /** The brand has no own citation (shown only when no rival is ahead). */
  | { kind: "no_citations" }
  /** No competitors configured: nothing to compare against. */
  | { kind: "no_competitors" }
  /** Neither the brand nor any competitor was named. */
  | { kind: "nobody_named" }
  /** Same mention rate as the strongest competitor. */
  | { kind: "tied"; competitor: string }
  /** Ahead, but on too few answers to call it. */
  | { kind: "ahead_small_sample" }
  /** Ahead of every competitor on a sufficient sample. */
  | { kind: "leader" };

export type CompetitiveClaimInput = {
  brandRate: number;
  /** Mention rate of every configured competitor, same scan, same denominator. */
  competitors: ReadonlyArray<{ name: string; mentionRate: number }>;
  citationScore: number;
  sampleSufficient: boolean;
};

export function resolveCompetitiveClaim(input: CompetitiveClaimInput): CompetitiveClaim {
  const top = [...input.competitors].sort((a, b) => b.mentionRate - a.mentionRate)[0];

  if (top && top.mentionRate > input.brandRate) {
    return { kind: "behind", competitor: top.name, competitorRate: top.mentionRate };
  }
  if (input.citationScore === 0) return { kind: "no_citations" };
  if (!top) return { kind: "no_competitors" };
  if (input.brandRate === 0 && top.mentionRate === 0) return { kind: "nobody_named" };
  if (top.mentionRate === input.brandRate) return { kind: "tied", competitor: top.name };
  if (!input.sampleSufficient) return { kind: "ahead_small_sample" };
  return { kind: "leader" };
}
