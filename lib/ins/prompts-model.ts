import { computeDominantBrandSentiment, type DominantBrandSentiment } from "@/lib/metrics/brand-sentiment";
import { isBrandDomain } from "@/lib/domains/brand-domain";
import { normalizeProvider } from "@/lib/scan/engine-meta";

/**
 * Prompts in the «Instrumento» system (CONSOLE-INSTRUMENTO-1 F5, log §360).
 * Pure: it only regroups rows the page already loaded, never asks anything
 * else, and every figure is a count of those rows (no estimate, no filler).
 */

export type PromptRow = {
  id: string;
  prompt_id: string | null;
  prompt_text_snapshot: string | null;
  brand_mentioned: boolean | null;
  sentiment: string | null;
  extracted_json: unknown;
  category: string | null;
  provider: string | null;
};

/** An active prompt the last scan did not cover (added after it ran). */
export type PendingPrompt = { id: string; text: string; category: string | null };

export type PromptItem = {
  key: string;
  text: string;
  category: string | null;
  /** True for a prompt the last scan did not cover: nothing is measured yet. */
  pending: boolean;
  named: boolean;
  /** Engines that named the brand in at least one of their answers. */
  namedBy: string[];
  sentiment: DominantBrandSentiment;
  competitors: number;
  citesOwn: boolean;
  rows: PromptRow[];
};

export type TopicItem = {
  category: string;
  prompts: PromptItem[];
  /** Named rows over all rows of the topic, in % (the topic's own visibility). */
  visibility: number;
  /** Rows that named the brand. */
  mentions: number;
  /** Prompts of the topic that name the brand. */
  namedPrompts: number;
  sentiment: DominantBrandSentiment;
};

export type EngineVisibility = { provider: string; percent: number };

export type PromptsModel = {
  items: PromptItem[];
  topics: TopicItem[];
  scanned: number;
  named: number;
  pending: number;
  /** Prompts that name the brand over prompts scanned, in %. */
  visibility: number;
  engines: EngineVisibility[];
  best: TopicItem | null;
  worst: TopicItem | null;
};

type Extracted = {
  competitors?: Array<{ name?: string; mentioned?: boolean }>;
  citations?: Array<{ domain?: string | null }>;
};

function extractedOf(raw: unknown): Extracted {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Extracted) : {};
}

/** A competitor named by two engines counts once. */
function competitorsUnion(rows: PromptRow[]): number {
  const names = new Set<string>();
  for (const r of rows) {
    for (const c of extractedOf(r.extracted_json).competitors ?? []) {
      if (c.mentioned && c.name) names.add(c.name.trim().toLowerCase());
    }
  }
  return names.size;
}

function citesOwnDomain(rows: PromptRow[], projectDomain: string): boolean {
  return rows.some((r) =>
    (extractedOf(r.extracted_json).citations ?? []).some((c) => isBrandDomain(c.domain, projectDomain)),
  );
}

const percent = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);

export const UNCATEGORIZED = "Sin categoría";

export function buildPromptsModel(input: {
  results: PromptRow[];
  pending?: PendingPrompt[];
  projectDomain: string;
  /** Engines of the plan, in display order; only these appear in the strip. */
  providers: string[];
}): PromptsModel {
  const { results, pending = [], projectDomain, providers } = input;

  const order: string[] = [];
  const byKey = new Map<string, PromptRow[]>();
  for (const r of results) {
    const key = r.prompt_id ?? r.id;
    if (!byKey.has(key)) {
      byKey.set(key, []);
      order.push(key);
    }
    byKey.get(key)!.push(r);
  }

  const scannedItems: PromptItem[] = order.map((key) => {
    const rows = byKey.get(key)!;
    const named = rows.some((r) => r.brand_mentioned);
    return {
      key,
      text: rows[0].prompt_text_snapshot ?? "",
      category: rows[0].category && rows[0].category.trim() ? rows[0].category : null,
      pending: false,
      named,
      namedBy: Array.from(
        new Set(rows.filter((r) => r.brand_mentioned).map((r) => normalizeProvider(r.provider))),
      ),
      // Only over rows that name the brand: a sentiment on an answer that never
      // named it would say something about a brand that was not there.
      sentiment: computeDominantBrandSentiment(rows),
      competitors: competitorsUnion(rows),
      citesOwn: citesOwnDomain(rows, projectDomain),
      rows,
    };
  });
  // Brand absent first, as the list always did: that is where the work is.
  scannedItems.sort((a, b) => Number(a.named) - Number(b.named));

  const pendingItems: PromptItem[] = pending.map((p) => ({
    key: p.id,
    text: p.text,
    category: p.category && p.category.trim() ? p.category : null,
    pending: true,
    named: false,
    namedBy: [],
    sentiment: null,
    competitors: 0,
    citesOwn: false,
    rows: [],
  }));
  const items = [...scannedItems, ...pendingItems];

  const categories = Array.from(
    new Set(items.map((i) => i.category).filter((c): c is string => c !== null)),
  );
  const hasTopics = categories.length >= 2;
  const hasUncategorized = hasTopics && items.some((i) => i.category === null);
  const topicNames = hasTopics ? [...categories, ...(hasUncategorized ? [UNCATEGORIZED] : [])] : [];

  const topics: TopicItem[] = topicNames
    .map((category) => {
      const prompts = items.filter((i) => (category === UNCATEGORIZED ? i.category === null : i.category === category));
      const rows = prompts.flatMap((p) => p.rows);
      const mentions = rows.filter((r) => r.brand_mentioned).length;
      return {
        category,
        prompts,
        visibility: percent(mentions, rows.length),
        mentions,
        namedPrompts: prompts.filter((p) => p.named).length,
        sentiment: computeDominantBrandSentiment(rows),
      };
    })
    .filter((t) => t.prompts.length > 0)
    .sort((a, b) => b.visibility - a.visibility);

  const scanned = scannedItems.length;
  const named = scannedItems.filter((i) => i.named).length;
  const measured = topics.filter((t) => t.prompts.some((p) => !p.pending));

  const engines: EngineVisibility[] = providers.map((provider) => {
    const rows = results.filter((r) => normalizeProvider(r.provider) === provider);
    return { provider, percent: percent(rows.filter((r) => r.brand_mentioned).length, rows.length) };
  });

  return {
    items,
    topics,
    scanned,
    named,
    pending: pendingItems.length,
    visibility: percent(named, scanned),
    engines,
    best: measured[0] ?? null,
    worst: measured.length > 1 ? measured[measured.length - 1] : null,
  };
}

/** Case- and accent-insensitive match, as the prototype's `fold()`. */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function promptMatches(item: PromptItem, query: string, topic?: string): boolean {
  const q = fold(query.trim());
  if (!q) return true;
  return fold(item.text).includes(q) || (topic ? fold(topic).includes(q) : false);
}
