import { describe, expect, it } from "vitest";
import {
  computeEntityEngineBreakdown,
  filterComparableEngines,
  type EntityEngineBreakdown,
  type EntityEngineInputRow,
  type ExtractedJsonLike
} from "@/lib/competitors/engine-share";

function row(provider: string | null, ext: ExtractedJsonLike): EntityEngineInputRow {
  return { provider, extracted_json: ext };
}

const brandMentioned = (ext: ExtractedJsonLike) => Boolean(ext.brand?.mentioned);

function competitorMentioned(name: string) {
  return (ext: ExtractedJsonLike) =>
    (ext.competitors ?? []).some(
      (c) => c.mentioned && c.name && c.name.trim().toLowerCase() === name.trim().toLowerCase()
    );
}

describe("computeEntityEngineBreakdown", () => {
  it("1. two engines with different mention rates for the same entity → correct entries, each rate over its own total", () => {
    const rows: EntityEngineInputRow[] = [
      row("gemini", { brand: { mentioned: true } }),
      row("gemini", { brand: { mentioned: true } }),
      row("gemini", { brand: { mentioned: false } }),
      row("gemini", { brand: { mentioned: false } }),
      row("claude", { brand: { mentioned: true } }),
      row("claude", { brand: { mentioned: false } }),
      row("claude", { brand: { mentioned: false } }),
      row("claude", { brand: { mentioned: false } })
    ];

    const result = computeEntityEngineBreakdown({ rows, isEntityMentioned: brandMentioned });

    expect(result).toHaveLength(2);
    const gemini = result.find((e) => e.provider === "gemini")!;
    const claude = result.find((e) => e.provider === "claude")!;
    expect(gemini.mentionRate).toBe(50); // 2/4, not 3/8
    expect(claude.mentionRate).toBe(25); // 1/4, not 3/8
  });

  it("2. an engine with no rows at all → does not appear in the result", () => {
    const rows: EntityEngineInputRow[] = [
      row("gemini", { brand: { mentioned: true } }),
      row("gemini", { brand: { mentioned: false } })
    ];

    const result = computeEntityEngineBreakdown({ rows, isEntityMentioned: brandMentioned });

    expect(result).toHaveLength(1);
    expect(result.find((e) => e.provider === "openai")).toBeUndefined();
  });

  it("3. provider: null is aggregated under 'gemini'", () => {
    const rows: EntityEngineInputRow[] = [
      row(null, { brand: { mentioned: true } }),
      row("gemini", { brand: { mentioned: false } })
    ];

    const result = computeEntityEngineBreakdown({ rows, isEntityMentioned: brandMentioned });

    expect(result).toHaveLength(1);
    expect(result[0].provider).toBe("gemini");
    expect(result[0].mentions).toBe(1);
    expect(result[0].mentionRate).toBe(50);
  });

  it("4. grounded-first display order with 3 engines (gemini/openai/claude)", () => {
    const rows: EntityEngineInputRow[] = [
      row("gemini", { competitors: [{ name: "Acme", mentioned: true }] }),
      row("gemini", { competitors: [{ name: "Acme", mentioned: true }] }),
      row("openai", { competitors: [{ name: "Acme", mentioned: false }] }),
      row("openai", { competitors: [{ name: "Acme", mentioned: false }] }),
      row("claude", { competitors: [{ name: "Acme", mentioned: true }] }),
      row("claude", { competitors: [{ name: "Acme", mentioned: true }] })
    ];

    const result = computeEntityEngineBreakdown({ rows, isEntityMentioned: competitorMentioned("Acme") });

    expect(result).toHaveLength(3);
    // Claude has the highest mentionRate (100%) but display order is still
    // grounded-first (gemini, openai), ungrounded (claude) last.
    expect(result.map((e) => e.provider)).toEqual(["gemini", "openai", "claude"]);
    expect(result.find((e) => e.provider === "claude")!.mentionRate).toBe(100);
  });

  it("5. empty input → []", () => {
    expect(computeEntityEngineBreakdown({ rows: [], isEntityMentioned: brandMentioned })).toEqual([]);
  });

  it("6. a single engine with rows → array of one entry", () => {
    const rows: EntityEngineInputRow[] = [
      row("gemini", { brand: { mentioned: true } }),
      row("gemini", { brand: { mentioned: false } })
    ];

    const result = computeEntityEngineBreakdown({ rows, isEntityMentioned: brandMentioned });

    expect(result).toHaveLength(1);
    expect(result[0].provider).toBe("gemini");
    expect(result[0].mentionRate).toBe(50);
  });
});

describe("filterComparableEngines", () => {
  function eng(provider: string, mentionRate: number): EntityEngineBreakdown {
    return { provider, mentions: mentionRate > 0 ? 1 : 0, mentionRate };
  }

  it("1. an engine where nobody was mentioned is dropped", () => {
    const result = filterComparableEngines({
      brandBreakdown: [eng("gemini", 44), eng("openai", 0), eng("claude", 44)],
      competitorBreakdowns: [
        [eng("gemini", 30), eng("openai", 0), eng("claude", 20)],
        [eng("gemini", 10), eng("openai", 0), eng("claude", 5)]
      ]
    });
    expect(result.map((e) => e.provider)).toEqual(["gemini", "claude"]);
  });

  it("2. an engine where only a COMPETITOR was mentioned is kept — that's a real gap, not dead space", () => {
    const result = filterComparableEngines({
      brandBreakdown: [eng("gemini", 40), eng("openai", 0)],
      competitorBreakdowns: [[eng("gemini", 10), eng("openai", 55)]]
    });
    expect(result.map((e) => e.provider)).toEqual(["gemini", "openai"]);
  });

  it("3. an engine where only the BRAND was mentioned is kept", () => {
    const result = filterComparableEngines({
      brandBreakdown: [eng("gemini", 40), eng("claude", 12)],
      competitorBreakdowns: [[eng("gemini", 10), eng("claude", 0)]]
    });
    expect(result.map((e) => e.provider)).toEqual(["gemini", "claude"]);
  });

  it("4. all engines at zero for everyone → empty (caller's >=2 guard then hides the matrix)", () => {
    const result = filterComparableEngines({
      brandBreakdown: [eng("gemini", 0), eng("openai", 0)],
      competitorBreakdowns: [[eng("gemini", 0), eng("openai", 0)]]
    });
    expect(result).toEqual([]);
  });

  it("5. no competitors at all → falls back to the brand's own non-zero engines", () => {
    const result = filterComparableEngines({
      brandBreakdown: [eng("gemini", 40), eng("openai", 0)],
      competitorBreakdowns: []
    });
    expect(result.map((e) => e.provider)).toEqual(["gemini"]);
  });

  it("6. surviving engines keep their original order and values untouched", () => {
    const brandBreakdown = [eng("gemini", 44), eng("openai", 0), eng("claude", 44)];
    const result = filterComparableEngines({ brandBreakdown, competitorBreakdowns: [] });
    expect(result).toEqual([brandBreakdown[0], brandBreakdown[2]]);
  });
});
