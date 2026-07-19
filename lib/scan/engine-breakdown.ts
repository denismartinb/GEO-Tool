import { ENGINE_META, normalizeProvider } from "@/lib/scan/engine-meta";

/**
 * Pure aggregation over scan_prompt_results rows, grouped by engine
 * (provider). No I/O, no "server-only" — consumed by both the Overview
 * server component and (indirectly, via engine-meta) client components.
 * See docs/specs/engines-value-1.md for the full spec.
 */

export type EngineBreakdownInputRow = {
  provider: string | null;
  brand_mentioned: boolean | null;
  citation_found: boolean | null;
  sentiment: string | null;
};

export type DominantSentiment = "positive" | "neutral" | "mixed" | "negative" | null;

export type EngineBreakdownEntry = {
  /** Already normalized (null → "gemini"). */
  provider: string;
  /** Rows (prompts) for this engine in the run. */
  total: number;
  mentioned: number;
  /** 0–100, rounded. */
  mentionRate: number;
  /**
   * null when the engine is NOT grounded (docs/adr/0012) — never 0. A
   * non-grounded engine's citation_found is always false by construction,
   * so a 0% would misrepresent a structural impossibility as a failure.
   */
  citationRate: number | null;
  citationCount: number;
  /**
   * Only over rows with brand_mentioned === true — mirrors the global
   * sentiment KPI on the Overview page (page.tsx sentimentCounts). No
   * mentions → null.
   */
  dominantSentiment: DominantSentiment;
};

export type EngineGap = {
  /** Provider with the highest mentionRate. */
  leader: string;
  /** Provider with the lowest mentionRate. */
  laggard: string;
  /** Difference in percentage points. */
  points: number;
} | null;

const SENTIMENT_KEYS = new Set(["positive", "neutral", "mixed", "negative"]);

type Acc = {
  total: number;
  mentioned: number;
  citationCount: number;
  // Insertion order == first-seen order for this provider's sentiments;
  // ties in the dominant-sentiment scan below resolve to whichever
  // sentiment was seen first, same behavior as the global sentiment KPI.
  sentimentCounts: Map<string, number>;
};

export function computeEngineBreakdown(rows: EngineBreakdownInputRow[]): {
  engines: EngineBreakdownEntry[];
  gap: EngineGap;
} {
  if (rows.length === 0) return { engines: [], gap: null };

  const byProvider = new Map<string, Acc>();

  for (const row of rows) {
    const provider = normalizeProvider(row.provider);
    let acc = byProvider.get(provider);
    if (!acc) {
      acc = { total: 0, mentioned: 0, citationCount: 0, sentimentCounts: new Map() };
      byProvider.set(provider, acc);
    }

    acc.total += 1;
    if (row.brand_mentioned) acc.mentioned += 1;
    if (row.citation_found) acc.citationCount += 1;

    if (row.brand_mentioned && row.sentiment && SENTIMENT_KEYS.has(row.sentiment)) {
      acc.sentimentCounts.set(row.sentiment, (acc.sentimentCounts.get(row.sentiment) ?? 0) + 1);
    }
  }

  const engines: EngineBreakdownEntry[] = Array.from(byProvider.entries()).map(([provider, acc]) => {
    // grounded is a property of the engine, not of any individual row.
    const grounded = ENGINE_META[provider]?.grounded ?? false;

    let dominantSentiment: DominantSentiment = null;
    let topCount = 0;
    for (const [sentiment, count] of acc.sentimentCounts) {
      if (count > topCount) {
        topCount = count;
        dominantSentiment = sentiment as DominantSentiment;
      }
    }

    return {
      provider,
      total: acc.total,
      mentioned: acc.mentioned,
      mentionRate: acc.total > 0 ? Math.round((acc.mentioned / acc.total) * 100) : 0,
      citationRate: grounded ? Math.round((acc.citationCount / acc.total) * 100) : null,
      citationCount: acc.citationCount,
      dominantSentiment
    };
  });

  engines.sort((a, b) => b.mentionRate - a.mentionRate);

  let gap: EngineGap = null;
  if (engines.length >= 2) {
    const leader = engines[0];
    const laggard = engines[engines.length - 1];
    gap = {
      leader: leader.provider,
      laggard: laggard.provider,
      points: leader.mentionRate - laggard.mentionRate
    };
  }

  return { engines, gap };
}
