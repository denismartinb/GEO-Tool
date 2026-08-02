import { describe, expect, it } from "vitest";
import { computeEmergingBrands, type EmergingBrandInputRow } from "@/lib/competitors/emerging-brands";

function row(promptId: string | null, names: string[]): EmergingBrandInputRow {
  return { promptId, extracted_json: { other_brands_mentioned: names } };
}

describe("computeEmergingBrands", () => {
  it("1. counts DISTINCT prompts, not rows — the same prompt across engines/runs counts once", () => {
    // 2 prompts × 3 engines = 6 rows, but only 2 distinct prompts.
    const rows = [
      row("p1", ["Sklum"]),
      row("p1", ["Sklum"]),
      row("p1", ["Sklum"]),
      row("p2", ["Sklum"]),
      row("p2", ["Sklum"]),
      row("p2", ["Sklum"])
    ];
    const result = computeEmergingBrands({ rows, brandName: "Ikea", trackedCompetitorNames: [] });
    expect(result).toEqual([{ name: "Sklum", promptCount: 2 }]);
  });

  it("2. a brand seen in only one distinct prompt is filtered out, however many rows repeat it", () => {
    const rows = [row("p1", ["Sklum"]), row("p1", ["Sklum"]), row("p1", ["Sklum"])];
    const result = computeEmergingBrands({ rows, brandName: "Ikea", trackedCompetitorNames: [] });
    expect(result).toEqual([]);
  });

  it("3. the project's own brand name is excluded even if case/whitespace differs", () => {
    const rows = [row("p1", [" ikea "]), row("p2", ["IKEA"])];
    const result = computeEmergingBrands({ rows, brandName: "Ikea", trackedCompetitorNames: [] });
    expect(result).toEqual([]);
  });

  it("4. an already-tracked competitor (even if inactive) is excluded", () => {
    const rows = [row("p1", ["Leroy Merlin"]), row("p2", ["Leroy Merlin"])];
    const result = computeEmergingBrands({ rows, brandName: "Ikea", trackedCompetitorNames: ["Leroy Merlin"] });
    expect(result).toEqual([]);
  });

  it("5. sorted by distinct-prompt count desc, capped at the limit", () => {
    const rows = [
      row("p1", ["A", "B"]),
      row("p2", ["A", "B"]),
      row("p3", ["A", "C"]),
      row("p4", ["A", "C"]),
      row("p5", ["A"])
    ];
    const result = computeEmergingBrands({ rows, brandName: "Ikea", trackedCompetitorNames: [], limit: 2 });
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: "A", promptCount: 5 });
  });

  it("6. rows without a promptId are skipped — they cannot be attributed to a prompt", () => {
    const rows = [row(null, ["Sklum"]), row(null, ["Sklum"]), row("p1", ["Sklum"])];
    const result = computeEmergingBrands({ rows, brandName: "Ikea", trackedCompetitorNames: [] });
    expect(result).toEqual([]);
  });

  it("7. empty / missing other_brands_mentioned never throws", () => {
    const rows: EmergingBrandInputRow[] = [
      { promptId: "p1", extracted_json: {} },
      { promptId: "p2", extracted_json: null }
    ];
    const result = computeEmergingBrands({ rows, brandName: "Ikea", trackedCompetitorNames: [] });
    expect(result).toEqual([]);
  });

  it("8. blank/whitespace-only entries are ignored", () => {
    const rows = [row("p1", ["   "]), row("p2", [""])];
    const result = computeEmergingBrands({ rows, brandName: "Ikea", trackedCompetitorNames: [] });
    expect(result).toEqual([]);
  });

  it("9. ties break alphabetically so the order is stable across renders", () => {
    const rows = [row("p1", ["Zeta", "Alfa"]), row("p2", ["Zeta", "Alfa"])];
    const result = computeEmergingBrands({ rows, brandName: "Ikea", trackedCompetitorNames: [] });
    expect(result.map((r) => r.name)).toEqual(["Alfa", "Zeta"]);
  });
});
