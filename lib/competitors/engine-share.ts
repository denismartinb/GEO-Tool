import { ENGINE_META, normalizeProvider } from "@/lib/scan/engine-meta";

/**
 * Pure aggregation over scan_prompt_results rows for a single entity (the
 * brand, or one competitor), grouped by engine. Extracted so the per-engine
 * mention share for the brand and every active competitor on the
 * Competitors page (ENGINES-VALUE-3, docs/specs/engines-value-3.md) shares
 * one unit-tested implementation instead of duplicating the aggregation
 * loop per entity.
 *
 * No I/O, no "server-only" — the caller (page.tsx) already owns the
 * parseExt/normKey matching logic and the mention predicate for a given
 * entity (brand or a specific competitor); this module only adds the engine
 * dimension on top of that SAME predicate, so results stay identical to the
 * page's existing brandMentions / competitorMentionMap counts, just
 * partitioned by provider.
 */

export type ExtractedJsonLike = {
  brand?: { mentioned?: boolean };
  competitors?: Array<{ name?: string; mentioned?: boolean }>;
};

export type EntityEngineInputRow = {
  provider: string | null;
  extracted_json: unknown; // same shape as ExtractedJson in page.tsx
};

export type EntityEngineBreakdown = {
  /** Already normalized (null → "gemini"). */
  provider: string;
  mentions: number;
  /**
   * Over THIS engine's own row total, never the global row total across all
   * engines — an engine added mid-project history (e.g. ChatGPT via
   * ENGINES-2a) has fewer accumulated rows than Gemini, and dividing by the
   * global total would make it look artificially weak just for having less
   * history (docs/specs/engines-value-3.md §7).
   */
  mentionRate: number;
};

function parseExt(raw: unknown): ExtractedJsonLike {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as ExtractedJsonLike;
}

/**
 * brandMentioned / competitor keys are already computed by the caller
 * (page.tsx has all of the parseExt/normKey logic); this function only adds
 * the engine dimension on top of the same aggregation, by re-running the
 * caller-supplied mention predicate per row and bucketing by provider.
 */
export function computeEntityEngineBreakdown(input: {
  rows: EntityEngineInputRow[];
  isEntityMentioned: (ext: ExtractedJsonLike) => boolean; // brand or a specific competitor
}): EntityEngineBreakdown[] {
  const { rows, isEntityMentioned } = input;

  const byProvider = new Map<string, { total: number; mentioned: number }>();

  for (const row of rows) {
    const provider = normalizeProvider(row.provider);
    let acc = byProvider.get(provider);
    if (!acc) {
      acc = { total: 0, mentioned: 0 };
      byProvider.set(provider, acc);
    }
    acc.total += 1;
    if (isEntityMentioned(parseExt(row.extracted_json))) acc.mentioned += 1;
  }

  // An engine with zero rows in the input never gets an entry here — a
  // mentionRate of 0 is only ever real (computed over rows that actually
  // exist for that engine), never invented for an engine that was never
  // run (same honesty principle as ENGINES-VALUE-1/2).
  const entries: EntityEngineBreakdown[] = Array.from(byProvider.entries()).map(([provider, acc]) => ({
    provider,
    mentions: acc.mentioned,
    mentionRate: acc.total > 0 ? Math.round((acc.mentioned / acc.total) * 100) : 0
  }));

  // Same display order as lib/scan/engine-breakdown.ts: grounded engines
  // first, then by mentionRate desc within each group.
  const groundedOf = (provider: string) => ENGINE_META[provider]?.grounded ?? false;
  entries.sort(
    (a, b) =>
      Number(groundedOf(b.provider)) - Number(groundedOf(a.provider)) ||
      b.mentionRate - a.mentionRate
  );

  return entries;
}
