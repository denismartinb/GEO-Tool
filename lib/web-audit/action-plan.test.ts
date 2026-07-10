import { describe, expect, it } from "vitest";
import { buildActionPlan, extractMentionedCompetitors, type ActionItem } from "@/lib/web-audit/action-plan";
import type { ClassifiedTopic, TopicOutcome, WebAuditSummary } from "@/lib/web-audit/opportunity-matrix";

function topic(overrides: Partial<ClassifiedTopic> & { promptId: string; outcome: TopicOutcome }): ClassifiedTopic {
  return {
    topic: overrides.topic ?? `Topic ${overrides.promptId}`,
    found: overrides.found ?? false,
    pages: overrides.pages ?? [],
    note: overrides.note ?? "",
    ...overrides
  };
}

function summaryOf(topics: ClassifiedTopic[]): WebAuditSummary {
  return {
    topics,
    conclusiveCount: topics.length,
    coveredCount: topics.filter((t) => t.found).length,
    coveragePct: null,
    surfacedCount: 0,
    surfacingPct: null
  };
}

describe("buildActionPlan", () => {
  it("orders items exactly invisible > content_gap > open_opportunity > unverified_cited", () => {
    const topics = [
      topic({ promptId: "cap", outcome: "unverified_cited" }),
      topic({ promptId: "open", outcome: "open_opportunity" }),
      topic({ promptId: "gap", outcome: "content_gap" }),
      topic({ promptId: "inv", outcome: "invisible" })
    ];

    const items = buildActionPlan({
      summary: summaryOf(topics),
      competitorsByPromptId: new Map(),
      recommendationIdByPromptId: new Map()
    });

    expect(items.map((i) => i.kind)).toEqual(["optimize", "create_competing", "create_open", "capture"]);
    expect(items.map((i) => i.promptId)).toEqual(["inv", "gap", "open", "cap"]);
  });

  it("sorts content_gap topics by number of AI-mentioned competitors, descending", () => {
    const topics = [
      topic({ promptId: "gap-1", outcome: "content_gap" }),
      topic({ promptId: "gap-2", outcome: "content_gap" }),
      topic({ promptId: "gap-3", outcome: "content_gap" })
    ];
    const competitorsByPromptId = new Map([
      ["gap-1", ["Rival A"]],
      ["gap-2", ["Rival A", "Rival B", "Rival C"]],
      ["gap-3", []]
    ]);

    const items = buildActionPlan({
      summary: summaryOf(topics),
      competitorsByPromptId,
      recommendationIdByPromptId: new Map()
    });

    expect(items.map((i) => i.promptId)).toEqual(["gap-2", "gap-1", "gap-3"]);
  });

  it("fills competitors only from the resolved map, empty when absent", () => {
    const topics = [topic({ promptId: "inv-1", outcome: "invisible" }), topic({ promptId: "inv-2", outcome: "invisible" })];
    const competitorsByPromptId = new Map([["inv-1", ["Rival A", "Rival A", "Rival B"]]]);

    const items = buildActionPlan({
      summary: summaryOf(topics),
      competitorsByPromptId,
      recommendationIdByPromptId: new Map()
    });

    const byPromptId = new Map(items.map((i) => [i.promptId, i] as [string, ActionItem]));
    expect(byPromptId.get("inv-1")?.competitors).toEqual(["Rival A", "Rival A", "Rival B"]);
    expect(byPromptId.get("inv-2")?.competitors).toEqual([]);
  });

  it("fills recommendationId when a match exists and leaves it null otherwise", () => {
    const topics = [topic({ promptId: "inv-1", outcome: "invisible" }), topic({ promptId: "inv-2", outcome: "invisible" })];
    const recommendationIdByPromptId = new Map([["inv-1", "rec-123"]]);

    const items = buildActionPlan({
      summary: summaryOf(topics),
      competitorsByPromptId: new Map(),
      recommendationIdByPromptId
    });

    const byPromptId = new Map(items.map((i) => [i.promptId, i] as [string, ActionItem]));
    expect(byPromptId.get("inv-1")?.recommendationId).toBe("rec-123");
    expect(byPromptId.get("inv-2")?.recommendationId).toBeNull();
  });

  it("never produces items for performing or inconclusive topics", () => {
    const topics = [
      topic({ promptId: "perf", outcome: "performing" }),
      topic({ promptId: "inc", outcome: "inconclusive" }),
      topic({ promptId: "inv", outcome: "invisible" })
    ];

    const items = buildActionPlan({
      summary: summaryOf(topics),
      competitorsByPromptId: new Map(),
      recommendationIdByPromptId: new Map()
    });

    expect(items.map((i) => i.promptId)).toEqual(["inv"]);
  });

  it("respects the limit, defaulting to 5", () => {
    const topics = Array.from({ length: 8 }, (_, i) => topic({ promptId: `inv-${i}`, outcome: "invisible" }));

    const defaultLimit = buildActionPlan({
      summary: summaryOf(topics),
      competitorsByPromptId: new Map(),
      recommendationIdByPromptId: new Map()
    });
    expect(defaultLimit).toHaveLength(5);

    const customLimit = buildActionPlan({
      summary: summaryOf(topics),
      competitorsByPromptId: new Map(),
      recommendationIdByPromptId: new Map(),
      limit: 2
    });
    expect(customLimit).toHaveLength(2);
  });
});

describe("extractMentionedCompetitors", () => {
  it("keeps only mentioned:true entries with a name", () => {
    const extracted = {
      competitors: [
        { name: "Rival A", mentioned: true },
        { name: "Rival B", mentioned: false },
        { name: null, mentioned: true },
        { mentioned: true }
      ]
    };
    expect(extractMentionedCompetitors(extracted)).toEqual(["Rival A"]);
  });

  it("dedupes and caps at 5", () => {
    const extracted = {
      competitors: Array.from({ length: 8 }, (_, i) => ({ name: `Rival ${i % 3}`, mentioned: true }))
    };
    const result = extractMentionedCompetitors(extracted);
    expect(new Set(result).size).toBe(result.length);
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it("returns an empty array for null, non-object, or missing competitors", () => {
    expect(extractMentionedCompetitors(null)).toEqual([]);
    expect(extractMentionedCompetitors("not an object")).toEqual([]);
    expect(extractMentionedCompetitors({})).toEqual([]);
  });

  it("includes untracked brands from other_brands_mentioned, not just tracked competitors", () => {
    // Real-world case that surfaced the bug: a telecom project tracks
    // Orange/Vodafone/Yoigo/MásMóvil, but the AI's actual top answer leads
    // with Movistar — untracked, so it only ever appears in
    // other_brands_mentioned, never in competitors[].
    const extracted = {
      competitors: [
        { name: "Orange España", mentioned: true },
        { name: "Vodafone España", mentioned: true }
      ],
      other_brands_mentioned: ["Movistar"]
    };
    expect(extractMentionedCompetitors(extracted)).toEqual(["Orange España", "Vodafone España", "Movistar"]);
  });

  it("dedupes case-insensitively across tracked and untracked names", () => {
    const extracted = {
      competitors: [{ name: "Movistar", mentioned: true }],
      other_brands_mentioned: ["movistar", "Movistar "]
    };
    expect(extractMentionedCompetitors(extracted)).toEqual(["Movistar"]);
  });
});
