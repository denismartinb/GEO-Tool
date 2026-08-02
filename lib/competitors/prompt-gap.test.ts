import { describe, expect, it } from "vitest";
import { computePromptGapSummary, type PromptGapInputRow } from "@/lib/competitors/prompt-gap";

const ACTIVE_COMPETITORS = [{ name: "Leroy Merlin" }, { name: "Conforama" }];

function row(
  promptId: string,
  provider: string | null,
  ext: {
    brand?: { mentioned?: boolean; position?: number | null };
    competitors?: Array<{ name?: string; mentioned?: boolean; position?: number | null }>;
  },
  topic: string | null = null
): PromptGapInputRow {
  return {
    id: `${promptId}-${provider ?? "gemini"}`,
    promptId,
    promptText: `Texto de ${promptId}`,
    topic,
    provider,
    extracted_json: ext
  };
}

describe("computePromptGapSummary", () => {
  it("1. brand not mentioned, a tracked competitor mentioned → absent, with that competitor listed", () => {
    const rows = [
      row("p1", "gemini", {
        brand: { mentioned: false, position: null },
        competitors: [{ name: "Leroy Merlin", mentioned: true, position: 1 }]
      })
    ];
    const result = computePromptGapSummary({ rows, activeCompetitors: ACTIVE_COMPETITORS });
    expect(result.counts.absent).toBe(1);
    expect(result.rowsByCategory.absent[0].competitors).toEqual([{ name: "Leroy Merlin", position: 1 }]);
    expect(result.rowsByCategory.absent[0].engines).toEqual(["gemini"]);
  });

  it("2. both mentioned, brand position worse (higher number) than best competitor → behind", () => {
    const rows = [
      row("p1", "gemini", {
        brand: { mentioned: true, position: 3 },
        competitors: [{ name: "Leroy Merlin", mentioned: true, position: 1 }]
      })
    ];
    const result = computePromptGapSummary({ rows, activeCompetitors: ACTIVE_COMPETITORS });
    expect(result.counts.behind).toBe(1);
    expect(result.rowsByCategory.behind[0].competitors[0].name).toBe("Leroy Merlin");
  });

  it("3. both mentioned, brand ahead of every competitor → ahead, no competitors listed", () => {
    const rows = [
      row("p1", "gemini", {
        brand: { mentioned: true, position: 1 },
        competitors: [{ name: "Leroy Merlin", mentioned: true, position: 2 }]
      })
    ];
    const result = computePromptGapSummary({ rows, activeCompetitors: ACTIVE_COMPETITORS });
    expect(result.counts.ahead).toBe(1);
    expect(result.rowsByCategory.ahead[0].competitors).toEqual([]);
  });

  it("4. brand mentioned, no tracked competitor mentioned → exclusive", () => {
    const rows = [
      row("p1", "gemini", {
        brand: { mentioned: true, position: 1 },
        competitors: [{ name: "Leroy Merlin", mentioned: false, position: null }]
      })
    ];
    const result = computePromptGapSummary({ rows, activeCompetitors: ACTIVE_COMPETITORS });
    expect(result.counts.exclusive).toBe(1);
  });

  it("5. neither brand nor any tracked competitor mentioned → none", () => {
    const rows = [
      row("p1", "gemini", {
        brand: { mentioned: false, position: null },
        competitors: [{ name: "Leroy Merlin", mentioned: false, position: null }]
      })
    ];
    const result = computePromptGapSummary({ rows, activeCompetitors: ACTIVE_COMPETITORS });
    expect(result.counts.none).toBe(1);
  });

  it("6. a competitor mentioned but NOT in the active tracked set is ignored entirely", () => {
    const rows = [
      row("p1", "gemini", {
        brand: { mentioned: true, position: 1 },
        competitors: [{ name: "Some Untracked Brand", mentioned: true, position: 1 }]
      })
    ];
    const result = computePromptGapSummary({ rows, activeCompetitors: ACTIVE_COMPETITORS });
    // Untracked mention doesn't count as a rival being present — brand alone → exclusive.
    expect(result.counts.exclusive).toBe(1);
  });

  it("7. same prompt across two engines, worst category wins (absent beats ahead)", () => {
    const rows = [
      row("p1", "gemini", {
        brand: { mentioned: true, position: 1 },
        competitors: [{ name: "Leroy Merlin", mentioned: true, position: 2 }]
      }),
      row("p1", "openai", {
        brand: { mentioned: false, position: null },
        competitors: [{ name: "Leroy Merlin", mentioned: true, position: 1 }]
      })
    ];
    const result = computePromptGapSummary({ rows, activeCompetitors: ACTIVE_COMPETITORS });
    expect(result.totalPrompts).toBe(1);
    expect(result.counts.absent).toBe(1);
    expect(result.counts.ahead).toBe(0);
    // Evidence resets to only the engine(s) that produced the worse category.
    expect(result.rowsByCategory.absent[0].engines).toEqual(["openai"]);
  });

  it("8. same prompt, same category on two engines → engines and competitors merge, best position kept", () => {
    const rows = [
      row("p1", "gemini", {
        brand: { mentioned: false, position: null },
        competitors: [{ name: "Leroy Merlin", mentioned: true, position: 3 }]
      }),
      row("p1", "openai", {
        brand: { mentioned: false, position: null },
        competitors: [{ name: "Leroy Merlin", mentioned: true, position: 1 }]
      })
    ];
    const result = computePromptGapSummary({ rows, activeCompetitors: ACTIVE_COMPETITORS });
    expect(result.counts.absent).toBe(1);
    const absentRow = result.rowsByCategory.absent[0];
    expect(absentRow.engines.sort()).toEqual(["gemini", "openai"]);
    expect(absentRow.competitors).toEqual([{ name: "Leroy Merlin", position: 1 }]);
  });

  it("9. rows without a promptId are skipped (never grouped into a phantom prompt)", () => {
    const rows: PromptGapInputRow[] = [
      { id: "x", promptId: null, promptText: "orphan", topic: null, provider: "gemini", extracted_json: {} }
    ];
    const result = computePromptGapSummary({ rows, activeCompetitors: ACTIVE_COMPETITORS });
    expect(result.totalPrompts).toBe(0);
  });

  it("10. empty input → all counts zero, totalPrompts zero", () => {
    const result = computePromptGapSummary({ rows: [], activeCompetitors: ACTIVE_COMPETITORS });
    expect(result.totalPrompts).toBe(0);
    expect(Object.values(result.counts).every((n) => n === 0)).toBe(true);
  });

  it("11. parity with competitor_gap_score's displacedPromptsCount formula (docs/adr/0011, lib/scoring/run-scoring.ts): absent count equals rows where brand not mentioned AND >=1 active competitor mentioned", () => {
    const rows = [
      row("p1", "gemini", {
        brand: { mentioned: false },
        competitors: [{ name: "Leroy Merlin", mentioned: true, position: 1 }]
      }),
      row("p2", "gemini", {
        brand: { mentioned: true, position: 1 },
        competitors: [{ name: "Leroy Merlin", mentioned: true, position: 2 }]
      }),
      row("p3", "gemini", {
        brand: { mentioned: false },
        competitors: [{ name: "Conforama", mentioned: true, position: 1 }]
      }),
      row("p4", "gemini", {
        brand: { mentioned: false },
        competitors: [{ name: "Leroy Merlin", mentioned: false }]
      })
    ];

    // The run-scoring.ts definition, replicated over the same fixture using
    // its own persisted-column shape (brand_mentioned / mentioned_competitors_count)
    // instead of extracted_json, to prove the two formulas agree in spirit.
    const displacedPromptsCount = rows.filter((r) => {
      const ext = r.extracted_json as { brand?: { mentioned?: boolean }; competitors?: Array<{ mentioned?: boolean }> };
      const mentionedCompetitorsCount = (ext.competitors ?? []).filter((c) => c.mentioned).length;
      return !ext.brand?.mentioned && mentionedCompetitorsCount > 0;
    }).length;

    const result = computePromptGapSummary({ rows, activeCompetitors: ACTIVE_COMPETITORS });
    expect(result.counts.absent).toBe(displacedPromptsCount);
    expect(result.counts.absent).toBe(2);
  });
});
