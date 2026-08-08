import { describe, expect, it } from "vitest";
import { computePanoramaState, type PanoramaEntityInput } from "./panorama-state";
import type { PersistedRankingEntry } from "@/lib/scoring/brand-position-ranking";

function entity(
  key: string,
  isBrand: boolean,
  fallbackMentionRate: number,
  domain: string | null = null
): PanoramaEntityInput {
  return { key, name: key, domain, isBrand, fallbackMentionRate };
}

function ranked(
  name: string,
  avg: number | null | undefined,
  mentionRate: number,
  isBrand = false
): PersistedRankingEntry {
  return {
    name,
    is_brand: isBrand,
    ...(avg === undefined ? {} : { avg_position_when_mentioned: avg }),
    mention_rate: mentionRate
  };
}

describe("computePanoramaState", () => {
  it("1. empty: nobody was mentioned, even though position data exists (the real genscore.es case)", () => {
    // computeBrandPosition would still set prompts_with_position_data > 0
    // here (extraction succeeded), so hasPositionData is true — the fix is
    // that mentionRate, not the ranking, is what decides "empty".
    const state = computePanoramaState({
      entities: [entity("brand", true, 0), entity("a", false, 0), entity("b", false, 0)],
      ranking: [ranked("brand", null, 0, true), ranked("a", null, 0), ranked("b", null, 0)],
      hasPositionData: true
    });
    expect(state.kind).toBe("empty");
  });

  it("2. empty: nobody was mentioned and there is no position data at all (pre-v3, zero mentions)", () => {
    const state = computePanoramaState({
      entities: [entity("brand", true, 0), entity("a", false, 0)],
      ranking: undefined,
      hasPositionData: false
    });
    expect(state.kind).toBe("empty");
  });

  it("3. NOT empty when only the brand has zero mentions but a competitor doesn't", () => {
    const state = computePanoramaState({
      entities: [entity("brand", true, 0), entity("a", false, 12)],
      ranking: [ranked("a", 1.0, 12)],
      hasPositionData: true
    });
    expect(state.kind).not.toBe("empty");
  });

  it("4. unranked: pre-v3 scan with real mentions falls back to a mention-only list, brand pinned first", () => {
    const state = computePanoramaState({
      entities: [entity("brand", true, 20), entity("a", false, 55), entity("b", false, 10)],
      ranking: undefined,
      hasPositionData: false
    });
    expect(state.kind).toBe("unranked");
    if (state.kind !== "unranked") throw new Error("unreachable");
    // Brand first regardless of its own rate; competitors sorted by rate desc.
    expect(state.rows.map((r) => r.key)).toEqual(["brand", "a", "b"]);
    expect(state.rows.every((r) => r.rank === null && r.position === null)).toBe(true);
    expect(state.rows[0].mentionRate).toBe(20);
  });

  it("5. ranked: brand within the top 5 — topRows and listRows are identical, nothing appended", () => {
    const state = computePanoramaState({
      entities: [entity("brand", true, 48), entity("a", false, 14), entity("b", false, 19)],
      ranking: [ranked("brand", 1.5, 48, true), ranked("a", 1.0, 14), ranked("b", 1.25, 19)],
      hasPositionData: true
    });
    expect(state.kind).toBe("ranked");
    if (state.kind !== "ranked") throw new Error("unreachable");
    expect(state.brandRank).toBe(3);
    expect(state.totalRanked).toBe(3);
    expect(state.brandAppended).toBe(false);
    expect(state.listRows).toBe(state.topRows);
  });

  it("6. ranked, brand beyond the top 5: topRows stays the real top 5, brand appends to listRows only", () => {
    const entities: PanoramaEntityInput[] = [
      entity("brand", true, 5),
      ...["a", "b", "c", "d", "e"].map((k, i) => entity(k, false, 90 - i))
    ];
    const rankingEntries: PersistedRankingEntry[] = [
      ranked("brand", 4.0, 5, true),
      ...["a", "b", "c", "d", "e"].map((k, i) => ranked(k, 1.0 + i * 0.1, 90 - i))
    ];
    const state = computePanoramaState({ entities, ranking: rankingEntries, hasPositionData: true });
    expect(state.kind).toBe("ranked");
    if (state.kind !== "ranked") throw new Error("unreachable");

    expect(state.topRows).toHaveLength(5);
    expect(state.topRows.some((r) => r.isBrand)).toBe(false);
    expect(state.brandRank).toBe(6);
    expect(state.totalRanked).toBe(6);
    expect(state.brandAppended).toBe(true);
    expect(state.listRows).toHaveLength(6);
    expect(state.listRows[state.listRows.length - 1].isBrand).toBe(true);
  });

  it("7. ranked, brand never named while competitors were: no brand row anywhere, rank is null", () => {
    const state = computePanoramaState({
      entities: [entity("brand", true, 0), entity("a", false, 14), entity("b", false, 19)],
      ranking: [ranked("brand", null, 0, true), ranked("a", 1.0, 14), ranked("b", 1.25, 19)],
      hasPositionData: true
    });
    expect(state.kind).toBe("ranked");
    if (state.kind !== "ranked") throw new Error("unreachable");
    expect(state.brandRank).toBeNull();
    expect(state.rows.some((r) => r.isBrand)).toBe(false);
    expect(state.listRows.some((r) => r.isBrand)).toBe(false);
    expect(state.brandAppended).toBe(false);
    expect(state.totalRanked).toBe(2);
  });

  it("8. a deactivated competitor absent from `entities` does not leak into the rows even if still in the ranking", () => {
    const state = computePanoramaState({
      entities: [entity("brand", true, 48), entity("a", false, 14)],
      ranking: [ranked("brand", 1.5, 48, true), ranked("a", 1.0, 14), ranked("retirado", 1.0, 30)],
      hasPositionData: true
    });
    expect(state.kind).toBe("ranked");
    if (state.kind !== "ranked") throw new Error("unreachable");
    expect(state.rows.map((r) => r.key)).toEqual(["a", "brand"]);
  });
});
