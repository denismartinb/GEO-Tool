import { describe, expect, it } from "vitest";
import { countRanked, normalizeRanking, readPosition } from "./brand-position-ranking";

describe("readPosition", () => {
  it("treats a missing key exactly like an explicit null — the pre-v3 defect", () => {
    // A run scored before geo-score-v3 never wrote the key at all (no
    // backfill, ADR 0026 decision 4). Readers that used `?? null` saw "no
    // rank" while readers that used `!== null` saw "has a rank", so the same
    // row rendered a numeric rank badge beside a "—" position.
    expect(readPosition({ name: "Mozilla", is_brand: true })).toBeNull();
    expect(readPosition({ name: "Mozilla", avg_position_when_mentioned: null })).toBeNull();
    expect(readPosition(undefined)).toBeNull();
    expect(readPosition(null)).toBeNull();
  });

  it("keeps a real rank, including the best possible one", () => {
    expect(readPosition({ avg_position_when_mentioned: 1 })).toBe(1);
    expect(readPosition({ avg_position_when_mentioned: 2.5 })).toBe(2.5);
  });

  it("rejects non-finite values rather than propagating them into a rank", () => {
    expect(readPosition({ avg_position_when_mentioned: Number.NaN })).toBeNull();
    expect(readPosition({ avg_position_when_mentioned: Number.POSITIVE_INFINITY })).toBeNull();
  });
});

describe("normalizeRanking", () => {
  it("orders by rank and sends unranked entities last", () => {
    const result = normalizeRanking([
      { name: "Brave", avg_position_when_mentioned: 3 },
      { name: "ESET" }, // pre-v3 shape: key absent
      { name: "Mozilla", avg_position_when_mentioned: 1.2 },
      { name: "Opera", avg_position_when_mentioned: null },
      { name: "Chrome", avg_position_when_mentioned: 2 }
    ]);

    expect(result.map((e) => e.name)).toEqual(["Mozilla", "Chrome", "Brave", "ESET", "Opera"]);
    expect(result.map((e) => e.position)).toEqual([1.2, 2, 3, null, null]);
  });

  it("puts every unranked entity past every ranked one, so index+1 is a true ordinal for the ranked ones", () => {
    const result = normalizeRanking([
      { name: "A" },
      { name: "B", avg_position_when_mentioned: 5 },
      { name: "C", avg_position_when_mentioned: null },
      { name: "D", avg_position_when_mentioned: 1 }
    ]);

    const firstUnranked = result.findIndex((e) => e.position === null);
    const lastRanked = result.reduce((acc, e, i) => (e.position !== null ? i : acc), -1);
    expect(lastRanked).toBeLessThan(firstUnranked);
  });

  it("preserves the other fields it does not own", () => {
    const [entry] = normalizeRanking([
      { name: "Mozilla", is_brand: true, avg_position_when_mentioned: 1.5, mention_rate: 80, mention_count: 8 }
    ]);
    expect(entry).toMatchObject({ name: "Mozilla", is_brand: true, mention_rate: 80, mention_count: 8 });
  });

  it("handles an absent ranking", () => {
    expect(normalizeRanking(undefined)).toEqual([]);
    expect(normalizeRanking(null)).toEqual([]);
    expect(normalizeRanking([])).toEqual([]);
  });
});

describe("countRanked", () => {
  it("counts only entities the AI actually named", () => {
    const ranking = normalizeRanking([
      { name: "Mozilla", avg_position_when_mentioned: 1 },
      { name: "Chrome", avg_position_when_mentioned: 2 },
      { name: "ESET" },
      { name: "Amazon", avg_position_when_mentioned: null }
    ]);

    // Four tracked entities, two of them ranked: "1 / 2", never "1 / 4".
    expect(ranking).toHaveLength(4);
    expect(countRanked(ranking)).toBe(2);
  });

  it("is zero when a whole pre-v3 run is read", () => {
    const ranking = normalizeRanking([{ name: "Mozilla", is_brand: true }, { name: "Chrome" }]);
    expect(countRanked(ranking)).toBe(0);
  });
});
