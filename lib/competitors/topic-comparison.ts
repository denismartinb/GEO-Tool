/**
 * Per-topic brand-vs-strongest-competitor mention rate ("Terreno por tema")
 * for the Competitors page (COMP-REDESIGN-1) — answers the first Semrush
 * reference document's "are they mentioned more often around key topics?"
 * using `project_prompts.category`, already resolved elsewhere in the app
 * (citations page's promptCategoryMap uses the same source).
 *
 * Scope: cumulative across all completed runs, same population as the
 * existing SoV podium and engine-share breakdown on this page — a single
 * scan rarely has enough prompts per topic to be a meaningful percentage.
 */

export type TopicComparisonInputRow = {
  promptId: string | null;
  extracted_json: unknown;
};

export type TopicComparisonRow = {
  topic: string;
  sampleSize: number;
  brandRate: number;
  leaderName: string | null;
  leaderRate: number;
  /** brandRate - leaderRate. Negative = a competitor leads this topic. */
  gap: number;
};

const UNCATEGORIZED_LABEL = "Sin tema";

type ExtractedJsonLike = {
  brand?: { mentioned?: boolean };
  competitors?: Array<{ name?: string; mentioned?: boolean }>;
};

function parseExt(raw: unknown): ExtractedJsonLike {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as ExtractedJsonLike;
}

function normKey(name: string): string {
  return name.trim().toLowerCase();
}

export function computeTopicComparison(input: {
  rows: TopicComparisonInputRow[];
  promptCategoryMap: Map<string, string | null>;
  activeCompetitors: Array<{ name: string }>;
}): TopicComparisonRow[] {
  const { rows, promptCategoryMap, activeCompetitors } = input;

  type TopicAcc = {
    total: number;
    brandMentions: number;
    competitorMentions: Map<string, number>; // key -> count
  };

  const byTopic = new Map<string, TopicAcc>();

  for (const row of rows) {
    const rawTopic = row.promptId ? promptCategoryMap.get(row.promptId) : null;
    const topic = rawTopic && rawTopic.trim() ? rawTopic.trim() : UNCATEGORIZED_LABEL;

    let acc = byTopic.get(topic);
    if (!acc) {
      acc = { total: 0, brandMentions: 0, competitorMentions: new Map() };
      byTopic.set(topic, acc);
    }
    acc.total += 1;

    const ext = parseExt(row.extracted_json);
    if (ext.brand?.mentioned) acc.brandMentions += 1;

    for (const c of ext.competitors ?? []) {
      if (!c.mentioned || !c.name) continue;
      const key = normKey(c.name);
      acc.competitorMentions.set(key, (acc.competitorMentions.get(key) ?? 0) + 1);
    }
  }

  const activeCompetitorNames = new Map(activeCompetitors.map((c) => [normKey(c.name), c.name]));

  const result: TopicComparisonRow[] = [];
  for (const [topic, acc] of byTopic) {
    if (acc.total === 0) continue;
    const brandRate = Math.round((acc.brandMentions / acc.total) * 100);

    let leaderKey: string | null = null;
    let leaderMentions = -1;
    for (const [key, count] of acc.competitorMentions) {
      if (!activeCompetitorNames.has(key)) continue; // only currently-tracked, active rivals
      if (count > leaderMentions) {
        leaderMentions = count;
        leaderKey = key;
      }
    }

    const leaderName = leaderKey ? activeCompetitorNames.get(leaderKey)! : null;
    const leaderRate = leaderKey ? Math.round((leaderMentions / acc.total) * 100) : 0;

    result.push({
      topic,
      sampleSize: acc.total,
      brandRate,
      leaderName,
      leaderRate,
      gap: brandRate - leaderRate
    });
  }

  // Worst gap first — where you're most behind is the most actionable row.
  return result.sort((a, b) => a.gap - b.gap);
}
