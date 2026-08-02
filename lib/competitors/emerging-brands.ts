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
 *
 * Counts DISTINCT PROMPTS, never rows. One row is one (prompt × engine ×
 * run), so a project with 2 prompts scanned by 3 engines over 3 runs has 18
 * rows — counting those and labelling the result "en N prompts" overstated
 * the evidence by ~9x (founder caught this on real data: "Carrefour · en 18
 * prompts" on a project with 2 prompts).
 */

export type EmergingBrandInputRow = {
  /** scan_prompt_results.prompt_id — rows without one cannot be attributed to a prompt and are skipped. */
  promptId: string | null;
  extracted_json: unknown;
};

export type EmergingBrand = {
  name: string;
  /** Number of distinct prompts this brand was named in. */
  promptCount: number;
};

const DEFAULT_LIMIT = 5;
const MIN_PROMPTS = 2;

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

  // key -> { display name, set of distinct prompt ids }
  const byKey = new Map<string, { name: string; prompts: Set<string> }>();

  for (const row of input.rows) {
    if (!row.promptId) continue;
    for (const raw of parseOtherBrands(row.extracted_json)) {
      const key = normKey(raw);
      if (!key || key === brandKey || trackedKeys.has(key)) continue;
      const entry = byKey.get(key);
      if (entry) {
        entry.prompts.add(row.promptId);
      } else {
        byKey.set(key, { name: raw.trim(), prompts: new Set([row.promptId]) });
      }
    }
  }

  return Array.from(byKey.values())
    .map((entry) => ({ name: entry.name, promptCount: entry.prompts.size }))
    .filter((entry) => entry.promptCount >= MIN_PROMPTS)
    .sort((a, b) => b.promptCount - a.promptCount || a.name.localeCompare(b.name))
    .slice(0, limit);
}
