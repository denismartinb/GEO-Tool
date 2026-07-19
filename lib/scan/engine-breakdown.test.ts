import { describe, expect, it } from "vitest";
import { computeEngineBreakdown, type EngineBreakdownInputRow } from "@/lib/scan/engine-breakdown";

function row(overrides: Partial<EngineBreakdownInputRow> = {}): EngineBreakdownInputRow {
  return {
    provider: "gemini",
    brand_mentioned: false,
    citation_found: false,
    sentiment: null,
    ...overrides
  };
}

describe("computeEngineBreakdown", () => {
  it("1. two engines with different rates → correct entries, desc order, correct gap", () => {
    const rows: EngineBreakdownInputRow[] = [
      row({ provider: "gemini", brand_mentioned: true }),
      row({ provider: "gemini", brand_mentioned: true }),
      row({ provider: "gemini", brand_mentioned: false }),
      row({ provider: "gemini", brand_mentioned: false }),
      row({ provider: "claude", brand_mentioned: true }),
      row({ provider: "claude", brand_mentioned: false }),
      row({ provider: "claude", brand_mentioned: false }),
      row({ provider: "claude", brand_mentioned: false })
    ];

    const { engines, gap } = computeEngineBreakdown(rows);

    expect(engines).toHaveLength(2);
    expect(engines[0].provider).toBe("gemini");
    expect(engines[0].mentionRate).toBe(50);
    expect(engines[1].provider).toBe("claude");
    expect(engines[1].mentionRate).toBe(25);

    expect(gap).toEqual({ leader: "gemini", laggard: "claude", points: 25 });
  });

  it("2. provider: null is aggregated under 'gemini'", () => {
    const rows: EngineBreakdownInputRow[] = [
      row({ provider: null, brand_mentioned: true }),
      row({ provider: "gemini", brand_mentioned: false })
    ];

    const { engines } = computeEngineBreakdown(rows);

    expect(engines).toHaveLength(1);
    expect(engines[0].provider).toBe("gemini");
    expect(engines[0].total).toBe(2);
    expect(engines[0].mentioned).toBe(1);
    expect(engines[0].mentionRate).toBe(50);
  });

  it("3. non-grounded engine → citationRate null even with citation_found: false everywhere; grounded → numeric rate", () => {
    const rows: EngineBreakdownInputRow[] = [
      row({ provider: "gemini", citation_found: true }),
      row({ provider: "gemini", citation_found: false }),
      row({ provider: "claude", citation_found: false }),
      row({ provider: "claude", citation_found: false })
    ];

    const { engines } = computeEngineBreakdown(rows);
    const gemini = engines.find((e) => e.provider === "gemini")!;
    const claude = engines.find((e) => e.provider === "claude")!;

    expect(gemini.citationRate).toBe(50);
    expect(claude.citationRate).toBeNull();
  });

  it("4. dominantSentiment only counts brand_mentioned: true rows; no mentions → null; ties resolve to insertion order", () => {
    const noMentionRows: EngineBreakdownInputRow[] = [
      row({ provider: "gemini", brand_mentioned: false, sentiment: "positive" }),
      row({ provider: "gemini", brand_mentioned: false, sentiment: "negative" })
    ];
    expect(computeEngineBreakdown(noMentionRows).engines[0].dominantSentiment).toBeNull();

    const clearWinnerRows: EngineBreakdownInputRow[] = [
      row({ provider: "gemini", brand_mentioned: true, sentiment: "positive" }),
      row({ provider: "gemini", brand_mentioned: true, sentiment: "positive" }),
      row({ provider: "gemini", brand_mentioned: true, sentiment: "negative" }),
      row({ provider: "gemini", brand_mentioned: false, sentiment: "negative" }) // excluded
    ];
    expect(computeEngineBreakdown(clearWinnerRows).engines[0].dominantSentiment).toBe("positive");

    // Tie: "positive" inserted before "negative" → Map insertion order wins,
    // same documented behavior as the global sentiment KPI (page.tsx).
    const tieRows: EngineBreakdownInputRow[] = [
      row({ provider: "gemini", brand_mentioned: true, sentiment: "positive" }),
      row({ provider: "gemini", brand_mentioned: true, sentiment: "negative" })
    ];
    expect(computeEngineBreakdown(tieRows).engines[0].dominantSentiment).toBe("positive");
  });

  it("5. a single engine → gap: null", () => {
    const rows: EngineBreakdownInputRow[] = [
      row({ provider: "gemini", brand_mentioned: true }),
      row({ provider: "gemini", brand_mentioned: false })
    ];

    const { gap } = computeEngineBreakdown(rows);
    expect(gap).toBeNull();
  });

  it("6. empty input → { engines: [], gap: null }", () => {
    expect(computeEngineBreakdown([])).toEqual({ engines: [], gap: null });
  });

  it("7. three engines (gemini/claude/openai) → forward-compat: three entries, gap between max and min", () => {
    const rows: EngineBreakdownInputRow[] = [
      row({ provider: "gemini", brand_mentioned: true }),
      row({ provider: "gemini", brand_mentioned: true }),
      row({ provider: "claude", brand_mentioned: true }),
      row({ provider: "claude", brand_mentioned: false }),
      row({ provider: "openai", brand_mentioned: false }),
      row({ provider: "openai", brand_mentioned: false })
    ];

    const { engines, gap } = computeEngineBreakdown(rows);

    expect(engines).toHaveLength(3);
    expect(engines.map((e) => e.provider)).toEqual(["gemini", "claude", "openai"]);
    expect(gap).toEqual({ leader: "gemini", laggard: "openai", points: 100 });

    // ENGINES-2a: openai generates with real web search, so it is grounded —
    // numeric citationRate (0 here, no citation_found rows), never null.
    expect(engines.find((e) => e.provider === "openai")!.citationRate).toBe(0);
    expect(engines.find((e) => e.provider === "claude")!.citationRate).toBeNull();
  });
});
