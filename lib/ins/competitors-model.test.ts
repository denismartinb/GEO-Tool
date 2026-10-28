import { describe, expect, it } from "vitest";
import { competitorsLead, heatTone, orderRanking, segments, spreadLabels, type RankEntry } from "./competitors-model";

const e = (name: string, mentionRate: number, meanRank: number | null, qualified = true, you = false): RankEntry => ({
  key: name,
  name,
  domain: `${name}.es`,
  you,
  mentionRate,
  citationRate: 0,
  meanRank,
  qualified,
});

describe("orderRanking", () => {
  it("orders by mentions and uses the mean position only to break ties", () => {
    const out = orderRanking([e("a", 30, 1.2), e("b", 50, 3), e("c", 30, 2.5)]);
    expect(out.map((x) => x.name)).toEqual(["b", "a", "c"]);
  });
  it("never lets an unqualified mean outrank a qualified one", () => {
    const out = orderRanking([e("thin", 20, 1, false), e("solid", 20, 3)]);
    expect(out[0].name).toBe("solid");
  });
});

describe("heatTone", () => {
  it("runs from 8 to 80 and is safe on an empty scale", () => {
    expect(heatTone(0, 65)).toBe(8);
    expect(heatTone(65, 65)).toBe(80);
    expect(heatTone(10, 0)).toBe(80);
  });
});

describe("competitorsLead", () => {
  it("says nothing without data", () => {
    expect(competitorsLead({ brand: "N", hasData: false, brandMentionRate: 0, top: null, winsOn: null })).toEqual([]);
  });
  it("names the stronger rival and where the brand wins, only when it does", () => {
    const text = (winsOn: string | null) =>
      competitorsLead({ brand: "N", hasData: true, brandMentionRate: 41, top: { name: "Cuentix", mentionRate: 54 }, winsOn })
        .map((p) => p.text)
        .join("");
    expect(text("Claude")).toContain("Le ganas en Claude.");
    expect(text(null)).not.toContain("Le ganas");
  });
  it("does not claim leadership beyond what the figures say", () => {
    const t = competitorsLead({ brand: "N", hasData: true, brandMentionRate: 60, top: { name: "C", mentionRate: 40 }, winsOn: null })
      .map((p) => p.text)
      .join("");
    expect(t).toContain("60%");
    expect(t).not.toMatch(/lideras|mayor visibilidad/i);
  });
});

describe("segments and labels", () => {
  it("breaks a line at a scan with no position", () => {
    expect(segments([1, 2, null, 3]).map((s) => s.length)).toEqual([2, 1]);
  });
  it("keeps end labels apart", () => {
    const out = spreadLabels([{ y: 10 }, { y: 12 }, { y: 40 }]);
    expect(out[1].y - out[0].y).toBeGreaterThanOrEqual(16);
  });
});
