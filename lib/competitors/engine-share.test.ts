import { describe, expect, it } from "vitest";
import {
  computeEntityEngineBreakdown,
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
