import { describe, expect, it } from "vitest";
import { computeEmergingBrands, type EmergingBrandInputRow } from "@/lib/competitors/emerging-brands";

function row(names: string[]): EmergingBrandInputRow {
  return { extracted_json: { other_brands_mentioned: names } };
}

describe("computeEmergingBrands", () => {
  it("1. a brand named twice, not tracked, not the project brand → included with correct occurrence count", () => {
    const rows = [row(["Sklum"]), row(["Sklum"])];
    const result = computeEmergingBrands({ rows, brandName: "Ikea", trackedCompetitorNames: ["Leroy Merlin"] });
    expect(result).toEqual([{ name: "Sklum", occurrences: 2 }]);
  });

  it("2. a single occurrence is filtered out as noise", () => {
    const rows = [row(["Sklum"])];
    const result = computeEmergingBrands({ rows, brandName: "Ikea", trackedCompetitorNames: [] });
    expect(result).toEqual([]);
  });

  it("3. the project's own brand name is excluded even if case/whitespace differs", () => {
    const rows = [row([" ikea "]), row(["IKEA"])];
    const result = computeEmergingBrands({ rows, brandName: "Ikea", trackedCompetitorNames: [] });
    expect(result).toEqual([]);
  });

  it("4. an already-tracked competitor (even if inactive) is excluded", () => {
    const rows = [row(["Leroy Merlin"]), row(["Leroy Merlin"])];
    const result = computeEmergingBrands({ rows, brandName: "Ikea", trackedCompetitorNames: ["Leroy Merlin"] });
    expect(result).toEqual([]);
  });

  it("5. sorted by occurrences desc, capped at the limit", () => {
    const rows = [
      row(["A", "B"]),
      row(["A", "B"]),
      row(["A", "C"]),
      row(["A", "C"]),
      row(["A"]),
      row(["D", "D"]) // duplicate within one row's array counts once per row, not twice
    ];
    const result = computeEmergingBrands({ rows, brandName: "Ikea", trackedCompetitorNames: [], limit: 2 });
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("A");
    expect(result[0].occurrences).toBe(5);
  });

  it("6. empty other_brands_mentioned / missing field never throws", () => {
    const rows: EmergingBrandInputRow[] = [{ extracted_json: {} }, { extracted_json: null }];
    const result = computeEmergingBrands({ rows, brandName: "Ikea", trackedCompetitorNames: [] });
    expect(result).toEqual([]);
  });

  it("7. blank/whitespace-only entries are ignored", () => {
    const rows = [row(["   "]), row([""])];
    const result = computeEmergingBrands({ rows, brandName: "Ikea", trackedCompetitorNames: [] });
    expect(result).toEqual([]);
  });
});
