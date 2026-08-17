/**
 * Per-prompt competitive gap categorization for the Competitors page
 * (COMP-REDESIGN-1). Answers the question the two Semrush reference
 * documents both center on: "in which specific prompts do my competitors
 * show up and I don't?" — mirroring their Missing/Weak/Strong/Shared/Unique
 * taxonomy, collapsed into 5 mutually exclusive buckets over data we already
 * persist (no schema change, no new Gemini call).
 *
 * Scope: the LATEST completed run only, not accumulated across history —
 * "brand.position"/"competitors[].position" are a snapshot of one response,
 * not stable across runs, and accumulating would make categories drift with
 * scan cadence instead of reflecting the current competitive picture.
 *
 * "absent" is deliberately the same predicate as competitor_gap_score's
 * displacedPromptsCount (lib/scoring/run-scoring.ts): !brand.mentioned &&
 * at least one tracked competitor mentioned. Kept as a literal duplicate
 * (not an import — run-scoring.ts operates on persisted columns across a
 * whole run, this operates on extracted_json per prompt) so the two numbers
 * shown on different screens for "prompts where you were displaced" can
 * never silently drift apart (see docs/adr/0018, "two different numbers
 * with the same name on the same screen").
 */

export type PromptGapCategory = "absent" | "behind" | "ahead" | "exclusive" | "none";

export type PromptGapExtractedJson = {
  brand?: { mentioned?: boolean; position?: number | null };
  competitors?: Array<{ name?: string; mentioned?: boolean; position?: number | null }>;
};

export type PromptGapInputRow = {
  /** scan_prompt_results.id — used only to keep engine rows distinguishable before grouping. */
  id: string;
  promptId: string | null;
  promptText: string;
  /** project_prompts.category, already resolved by the caller. */
  topic: string | null;
  provider: string | null;
  extracted_json: unknown;
};

export type PromptGapCompetitorHit = {
  name: string;
  /** Best (lowest) 1-based position across the engines that triggered this row's category. Null if never positioned. */
  position: number | null;
};

export type PromptGapRow = {
  promptId: string;
  promptText: string;
  topic: string | null;
  category: PromptGapCategory;
  /** Distinct providers whose response is the reason this prompt landed in this category. */
  engines: string[];
  /** Distinct competitors responsible for "absent"/"behind", best position first. Empty for ahead/exclusive/none. */
  competitors: PromptGapCompetitorHit[];
};

export type PromptGapSummary = {
  counts: Record<PromptGapCategory, number>;
  rowsByCategory: Record<PromptGapCategory, PromptGapRow[]>;
  totalPrompts: number;
};

const CATEGORY_ORDER: PromptGapCategory[] = ["absent", "behind", "ahead", "exclusive", "none"];
// Worst-first: if any engine analyzing this prompt shows the worse
// condition, the whole prompt is bucketed there — a prompt that's "ahead"
// in Gemini but "absent" in ChatGPT has a real, actionable problem and
// should never be hidden behind its best-case engine.
const CATEGORY_PRIORITY: Record<PromptGapCategory, number> = {
  absent: 0,
  behind: 1,
  ahead: 2,
  exclusive: 3,
  none: 4
};

function parseExt(raw: unknown): PromptGapExtractedJson {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as PromptGapExtractedJson;
}

function normKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Categorizes a single (prompt × engine) response against the CURRENTLY
 * active tracked competitor set. Returns the category plus, for
 * absent/behind, the mentioned active competitors sorted by best position.
 */
function categorizeRow(
  ext: PromptGapExtractedJson,
  activeCompetitorKeys: Set<string>
): { category: PromptGapCategory; competitors: PromptGapCompetitorHit[] } {
  const brandMentioned = Boolean(ext.brand?.mentioned);
  const brandPosition = typeof ext.brand?.position === "number" ? ext.brand.position : null;

  const mentionedActiveCompetitors = (ext.competitors ?? []).filter(
    (c) => c.mentioned && c.name && activeCompetitorKeys.has(normKey(c.name))
  );

  if (mentionedActiveCompetitors.length === 0) {
    return { category: brandMentioned ? "exclusive" : "none", competitors: [] };
  }

  const hits: PromptGapCompetitorHit[] = mentionedActiveCompetitors
    .map((c) => ({
      name: c.name as string,
      position: typeof c.position === "number" ? c.position : null
    }))
    .sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity));

  if (!brandMentioned) {
    return { category: "absent", competitors: hits };
  }

  const bestCompetitorPosition = Math.min(
    ...hits.map((h) => (h.position ?? Infinity))
  );
  const brandRank = brandPosition ?? Infinity;

  if (brandRank > bestCompetitorPosition) {
    return { category: "behind", competitors: hits };
  }

  return { category: "ahead", competitors: [] };
}

/**
 * Groups the latest run's (prompt × engine) result rows into one row per
 * prompt, taking the worst-case category across its engines.
 */
export function computePromptGapSummary(input: {
  rows: PromptGapInputRow[];
  activeCompetitors: Array<{ name: string }>;
}): PromptGapSummary {
  const { rows, activeCompetitors } = input;
  const activeCompetitorKeys = new Set(activeCompetitors.map((c) => normKey(c.name)));

  type Draft = {
    promptId: string;
    promptText: string;
    topic: string | null;
    category: PromptGapCategory;
    engines: Set<string>;
    competitorsByName: Map<string, number | null>;
  };

  const byPrompt = new Map<string, Draft>();

  for (const row of rows) {
    if (!row.promptId) continue;
    const { category, competitors } = categorizeRow(parseExt(row.extracted_json), activeCompetitorKeys);
    const provider = row.provider ?? "gemini";

    const existing = byPrompt.get(row.promptId);
    if (!existing) {
      byPrompt.set(row.promptId, {
        promptId: row.promptId,
        promptText: row.promptText,
        topic: row.topic,
        category,
        engines: new Set(category !== "none" ? [provider] : []),
        competitorsByName: new Map(competitors.map((c) => [c.name, c.position]))
      });
      continue;
    }

    if (CATEGORY_PRIORITY[category] < CATEGORY_PRIORITY[existing.category]) {
      // Strictly worse category found on another engine: reset the
      // evidence (engines/competitors) to this new, worse condition only.
      existing.category = category;
      existing.engines = new Set([provider]);
      existing.competitorsByName = new Map(competitors.map((c) => [c.name, c.position]));
    } else if (category === existing.category && category !== "none") {
      existing.engines.add(provider);
      for (const c of competitors) {
        const prev = existing.competitorsByName.get(c.name);
        if (prev === undefined || (c.position ?? Infinity) < (prev ?? Infinity)) {
          existing.competitorsByName.set(c.name, c.position);
        }
      }
    }
  }

  const rowsByCategory: Record<PromptGapCategory, PromptGapRow[]> = {
    absent: [],
    behind: [],
    ahead: [],
    exclusive: [],
    none: []
  };
  const counts: Record<PromptGapCategory, number> = {
    absent: 0,
    behind: 0,
    ahead: 0,
    exclusive: 0,
    none: 0
  };

  for (const draft of byPrompt.values()) {
    const gapRow: PromptGapRow = {
      promptId: draft.promptId,
      promptText: draft.promptText,
      topic: draft.topic,
      category: draft.category,
      engines: Array.from(draft.engines).sort(),
      competitors: Array.from(draft.competitorsByName.entries())
        .map(([name, position]) => ({ name, position }))
        .sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity))
    };
    rowsByCategory[draft.category].push(gapRow);
    counts[draft.category] += 1;
  }

  for (const category of CATEGORY_ORDER) {
    rowsByCategory[category].sort((a, b) => a.promptText.localeCompare(b.promptText));
  }

  return { counts, rowsByCategory, totalPrompts: byPrompt.size };
}
