import { describe, expect, it } from "vitest";
import { computeTopicComparison, type TopicComparisonInputRow } from "@/lib/competitors/topic-comparison";

const ACTIVE = [{ name: "Leroy Merlin" }];

function row(promptId: string, brandMentioned: boolean, competitors: Array<{ name: string; mentioned: boolean }>): TopicComparisonInputRow {
  return { promptId, extracted_json: { brand: { mentioned: brandMentioned }, competitors } };
}

describe("computeTopicComparison", () => {
  it("1. brand leads a topic → positive gap", () => {
    const rows = [
      row("p1", true, [{ name: "Leroy Merlin", mentioned: false }]),
      row("p2", true, [{ name: "Leroy Merlin", mentioned: false }])
    ];
    const map = new Map([
      ["p1", "Cocinas"],
      ["p2", "Cocinas"]
    ]);
    const result = computeTopicComparison({ rows, promptCategoryMap: map, activeCompetitors: ACTIVE });
    expect(result).toHaveLength(1);
    expect(result[0].topic).toBe("Cocinas");
    expect(result[0].brandRate).toBe(100);
    expect(result[0].leaderRate).toBe(0);
    expect(result[0].gap).toBe(100);
  });

  it("2. competitor leads a topic → negative gap, sorted worst-first", () => {
    const rowsBehind = [row("p1", false, [{ name: "Leroy Merlin", mentioned: true }])];
    const rowsAhead = [row("p2", true, [{ name: "Leroy Merlin", mentioned: false }])];
    const map = new Map([
      ["p1", "Cocinas"],
      ["p2", "Iluminación"]
    ]);
    const result = computeTopicComparison({
      rows: [...rowsBehind, ...rowsAhead],
      promptCategoryMap: map,
      activeCompetitors: ACTIVE
    });
    expect(result[0].topic).toBe("Cocinas");
    expect(result[0].gap).toBeLessThan(0);
    expect(result[1].topic).toBe("Iluminación");
  });

  it("3. prompts without a category group under 'Sin tema'", () => {
    const rows = [row("p1", true, [])];
    const result = computeTopicComparison({ rows, promptCategoryMap: new Map(), activeCompetitors: ACTIVE });
    expect(result[0].topic).toBe("Sin tema");
  });

  it("4. an inactive/untracked competitor never becomes the topic leader", () => {
    const rows = [row("p1", false, [{ name: "Untracked Rival", mentioned: true }])];
    const map = new Map([["p1", "Cocinas"]]);
    const result = computeTopicComparison({ rows, promptCategoryMap: map, activeCompetitors: ACTIVE });
    expect(result[0].leaderName).toBeNull();
    expect(result[0].leaderRate).toBe(0);
  });

  it("5. empty input → []", () => {
    expect(computeTopicComparison({ rows: [], promptCategoryMap: new Map(), activeCompetitors: ACTIVE })).toEqual([]);
  });
});
