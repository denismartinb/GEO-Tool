/**
 * SCREEN-POLISH-1 Fase A (Fase 10 of the external audit) — the single owner
 * of "what is the dominant brand sentiment across a group of
 * scan_prompt_results rows".
 *
 * WHY THIS EXISTS. A row's `sentiment` column is populated by the LLM for
 * every response, whether or not the brand was actually named in it — the
 * extraction schema has no "N/A" value, so an unmentioned row still carries
 * some sentiment string (`lib/extraction/schema.ts`). Reading that column
 * without filtering by `brand_mentioned` therefore affirms an opinion about
 * the brand on a response where the brand never came up — the exact "no fake
 * metrics" violation this module exists to close. The pattern this file
 * copies already existed and was already audited in two places
 * (`lib/scan/engine-breakdown.ts`'s per-engine `dominantSentiment`, and the
 * Overview KPI in `app/dashboard/projects/[projectId]/page.tsx`); Prompts had
 * grown three more copies that never applied the filter. This module is the
 * one place that computation lives now — no I/O, pure, safe to import from
 * both server and client components (same contract as engine-breakdown.ts).
 *
 * No I/O, no "server-only" — consumed by prompts/page.tsx (server) and by
 * prompts-client.tsx / prompt-drawer.tsx (client).
 */

export type BrandSentimentInputRow = {
  brand_mentioned: boolean | null;
  sentiment: string | null;
};

export type DominantBrandSentiment = "positive" | "neutral" | "mixed" | "negative" | null;

// Same four countable values as lib/scan/engine-breakdown.ts and the Overview
// KPI's sentimentCounts record — "unknown" (a real extraction value, see
// lib/extraction/schema.ts) contributes to no bucket, same as a missing
// sentiment. Keeping this set identical across the three call sites is the
// point: one vocabulary, not three that happen to agree today.
const SENTIMENT_KEYS = new Set(["positive", "neutral", "mixed", "negative"]);

/**
 * Dominant brand sentiment across a group of rows, counted ONLY over rows
 * where `brand_mentioned === true`. Returns `null` when the group has no
 * brand-mentioned rows, or when none of them carry a countable sentiment
 * value.
 *
 * Ties resolve to whichever sentiment was seen FIRST in row order (insertion
 * order into the tally) — the same rule `engine-breakdown.ts` uses, so the
 * product has exactly one tie-break semantics for "dominant sentiment", not a
 * third one invented here.
 */
export function computeDominantBrandSentiment(
  rows: BrandSentimentInputRow[]
): DominantBrandSentiment {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.brand_mentioned) continue;
    if (row.sentiment && SENTIMENT_KEYS.has(row.sentiment)) {
      counts.set(row.sentiment, (counts.get(row.sentiment) ?? 0) + 1);
    }
  }

  let dominant: DominantBrandSentiment = null;
  let topCount = 0;
  for (const [sentiment, count] of counts) {
    if (count > topCount) {
      topCount = count;
      dominant = sentiment as DominantBrandSentiment;
    }
  }
  return dominant;
}
