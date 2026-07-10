import type { ClassifiedTopic, WebAuditSummary } from "@/lib/web-audit/opportunity-matrix";

/**
 * "Plan de acción" (WEB-AUDIT-ACTION): turns the opportunity matrix into a
 * short, prioritized list of next steps instead of leaving the founder to
 * infer "what do I do about this?" from the raw quadrant counts. Pure
 * function over already-classified topics — no I/O, no new Gemini calls, no
 * schema. Deliberately NOT marked `import "server-only"`, same rationale as
 * opportunity-matrix.ts: importable from Vitest and from the server page
 * alike.
 *
 * `performing`/`inconclusive` topics never produce an action: the first is
 * already working, the second has no reliable signal either way — turning
 * either into an "action" would be inventing urgency, not reporting it.
 */

export type ActionItemKind = "optimize" | "create_competing" | "create_open" | "capture";

export type ActionItem = {
  kind: ActionItemKind;
  promptId: string;
  topic: string;
  rationale: string;
  /** Names the AI actually mentioned for this topic's prompt — never invented; empty when none. */
  competitors: string[];
  /** Deep-link to the matching recommendation card, when one exists. */
  recommendationId: string | null;
};

const RATIONALE_BY_KIND: Record<ActionItemKind, string> = {
  optimize: "Tienes página propia pero la IA todavía no la cita",
  create_competing: "No tienes contenido propio y la IA cita a un competidor",
  create_open: "No tienes contenido propio; todavía nadie destaca en este tema",
  capture: "La IA te cita por otra vía, sin una página propia verificada"
};

function toActionItem(
  topic: ClassifiedTopic,
  kind: ActionItemKind,
  competitorsByPromptId: Map<string, string[]>,
  recommendationIdByPromptId: Map<string, string>
): ActionItem {
  return {
    kind,
    promptId: topic.promptId,
    topic: topic.topic,
    rationale: RATIONALE_BY_KIND[kind],
    competitors: competitorsByPromptId.get(topic.promptId) ?? [],
    recommendationId: recommendationIdByPromptId.get(topic.promptId) ?? null
  };
}

/**
 * Builds the prioritized action list. Order of leverage (highest first):
 * 1. `invisible` → optimize — the page already exists, only needs to become
 *    citable. The fastest lever.
 * 2. `content_gap` → create_competing — a rival already wins this topic;
 *    competitive urgency. Sorted by number of AI-mentioned competitors desc
 *    within this group.
 * 3. `open_opportunity` → create_open — a gap with no rival yet; clean
 *    opportunity but less urgent than one already being lost.
 * 4. `unverified_cited` → capture — the AI already cites the brand some
 *    other way; formalize it with a real page.
 */
export function buildActionPlan(input: {
  summary: WebAuditSummary;
  competitorsByPromptId: Map<string, string[]>;
  recommendationIdByPromptId: Map<string, string>;
  limit?: number;
}): ActionItem[] {
  const { summary, competitorsByPromptId, recommendationIdByPromptId } = input;
  const limit = input.limit ?? 5;

  const invisible = summary.topics.filter((t) => t.outcome === "invisible");
  const contentGap = summary.topics
    .filter((t) => t.outcome === "content_gap")
    .slice()
    .sort((a, b) => (competitorsByPromptId.get(b.promptId)?.length ?? 0) - (competitorsByPromptId.get(a.promptId)?.length ?? 0));
  const openOpportunity = summary.topics.filter((t) => t.outcome === "open_opportunity");
  const unverifiedCited = summary.topics.filter((t) => t.outcome === "unverified_cited");

  const items: ActionItem[] = [
    ...invisible.map((t) => toActionItem(t, "optimize", competitorsByPromptId, recommendationIdByPromptId)),
    ...contentGap.map((t) => toActionItem(t, "create_competing", competitorsByPromptId, recommendationIdByPromptId)),
    ...openOpportunity.map((t) => toActionItem(t, "create_open", competitorsByPromptId, recommendationIdByPromptId)),
    ...unverifiedCited.map((t) => toActionItem(t, "capture", competitorsByPromptId, recommendationIdByPromptId))
  ];

  return items.slice(0, limit);
}

type ExtractedCompetitors = { competitors?: Array<{ name?: string | null; mentioned?: boolean }> };

/**
 * Names the AI actually mentioned for a single prompt result — only
 * `mentioned: true` entries, deduped, capped. Mirrors the established
 * pattern in lib/recommendations/recommendation-engine.ts's promptEvidence
 * (same filter/map shape) so this never invents a competitor the AI didn't
 * name. Callers build the `competitorsByPromptId` map buildActionPlan needs
 * from this, one call per scan_prompt_results row.
 */
export function extractMentionedCompetitors(extractedJson: unknown): string[] {
  if (!extractedJson || typeof extractedJson !== "object") return [];
  const competitors = (extractedJson as ExtractedCompetitors).competitors ?? [];
  const names = competitors
    .filter((c) => c.mentioned && c.name)
    .map((c) => (c.name as string).trim())
    .filter(Boolean);
  return Array.from(new Set(names)).slice(0, 5);
}
