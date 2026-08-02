/**
 * Surfaces `other_brands_mentioned` (already extracted by every provider,
 * lib/llm/{gemini,claude,openai}.ts) on the Competitors page for the first
 * time — closes the gap the ADR 0018 Ikea case documented: the AI already
 * names untracked rivals (Sklum, Brico Depôt…) and the product had nowhere
 * to show that until now. Same normalization/threshold convention as
 * `computeEmergingCompetitors` in lib/recommendations/recommendation-engine.ts
 * (>=2 occurrences to filter noise, not reused directly because that
 * function is private to the recommendation engine's own gap-detection
 * pipeline and returns a different shape).
 */

export type EmergingBrandInputRow = {
  extracted_json: unknown;
};

export type EmergingBrand = {
  name: string;
  occurrences: number;
};

const DEFAULT_LIMIT = 5;
const MIN_OCCURRENCES = 2;

function parseOtherBrands(raw: unknown): string[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const list = (raw as { other_brands_mentioned?: unknown }).other_brands_mentioned;
  if (!Array.isArray(list)) return [];
  return list.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

function normKey(name: string): string {
  return name.trim().toLowerCase();
}

export function computeEmergingBrands(input: {
  rows: EmergingBrandInputRow[];
  brandName: string;
  /** Every tracked competitor name ever seen for this project, active or inactive — a re-tracked name must never show as "emerging". */
  trackedCompetitorNames: string[];
  limit?: number;
}): EmergingBrand[] {
  const brandKey = normKey(input.brandName);
  const trackedKeys = new Set(input.trackedCompetitorNames.map(normKey));
  const limit = input.limit ?? DEFAULT_LIMIT;

  const byKey = new Map<string, { name: string; occurrences: number }>();

  for (const row of input.rows) {
    const names = parseOtherBrands(row.extracted_json);
    // A brand named twice by different engines for the SAME prompt result
    // row can't happen (one row = one engine's response), so no per-row dedup needed.
    for (const raw of names) {
      const key = normKey(raw);
      if (!key || key === brandKey || trackedKeys.has(key)) continue;
      const entry = byKey.get(key);
      if (entry) {
        entry.occurrences += 1;
      } else {
        byKey.set(key, { name: raw.trim(), occurrences: 1 });
      }
    }
  }

  return Array.from(byKey.values())
    .filter((entry) => entry.occurrences >= MIN_OCCURRENCES)
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, limit);
}
