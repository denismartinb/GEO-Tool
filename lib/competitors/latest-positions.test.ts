import { describe, expect, it } from "vitest";
import { rankLatestPositions, type LatestPositionEntity } from "./latest-positions";
import type { PersistedRankingEntry } from "@/lib/scoring/brand-position-ranking";

function entry(
  name: string,
  avg: number | null | undefined,
  mentionRate?: number,
  isBrand = false,
  mentionCount?: number
): PersistedRankingEntry {
  return {
    name,
    is_brand: isBrand,
    ...(avg === undefined ? {} : { avg_position_when_mentioned: avg }),
    ...(mentionRate === undefined ? {} : { mention_rate: mentionRate }),
    ...(mentionCount === undefined ? {} : { mention_count: mentionCount })
  };
}

const brand: LatestPositionEntity = { key: "brand", label: "Mozilla", isBrand: true };
function rival(label: string): LatestPositionEntity {
  return { key: `id-${label}`, label };
}

describe("rankLatestPositions", () => {
  it("1. ranks 1..N with no repeats, best mean rank first", () => {
    const out = rankLatestPositions({
      entities: [brand, rival("Amazon"), rival("Google Chrome")],
      ranking: [
        entry("Mozilla", 1.5, 48, true),
        entry("Amazon", 1.0, 14),
        entry("Google Chrome", 1.25, 19)
      ]
    });

    expect(out.map((r) => [r.label, r.rank])).toEqual([
      ["Amazon", 1],
      ["Google Chrome", 2],
      ["Mozilla", 3]
    ]);
  });

  it("2. breaks a tie by mention rate — the real case that made two screens disagree", () => {
    // Both average 1,00. Ordered by position alone the winner is whoever the
    // array happened to hold first, which is how the Overview showed Proton VPN
    // 1º while Competidores showed Amazon 1º for the same scan.
    // Both are above the sample floor here, so this exercises the tiebreak and
    // only the tiebreak — the original pair (5% vs 14%) now separates one step
    // earlier, on the floor, and would have stopped testing this.
    const out = rankLatestPositions({
      entities: [rival("Proton VPN"), rival("Amazon")],
      ranking: [entry("Proton VPN", 1.0, 11), entry("Amazon", 1.0, 14)]
    });

    expect(out.map((r) => r.label)).toEqual(["Amazon", "Proton VPN"]);
  });

  it("3. is stable regardless of the caller's array order", () => {
    const ranking = [entry("Proton VPN", 1.0, 11), entry("Amazon", 1.0, 14)];
    const a = rankLatestPositions({ entities: [rival("Proton VPN"), rival("Amazon")], ranking });
    const b = rankLatestPositions({ entities: [rival("Amazon"), rival("Proton VPN")], ranking });

    expect(a.map((r) => r.label)).toEqual(b.map((r) => r.label));
  });

  it("4. falls back to the name only when position AND mention rate tie", () => {
    const out = rankLatestPositions({
      entities: [rival("Zeta"), rival("Alfa")],
      ranking: [entry("Zeta", 2, 10), entry("Alfa", 2, 10)]
    });

    expect(out.map((r) => r.label)).toEqual(["Alfa", "Zeta"]);
  });

  it("5. drops an entity the AI never named instead of inventing a rank for it", () => {
    // geo-score-v3 (docs/adr/0026): no mention, no position, no row.
    const out = rankLatestPositions({
      entities: [brand, rival("Amazon")],
      ranking: [entry("Mozilla", 1.5, 48, true), entry("Amazon", null, 0)]
    });

    expect(out.map((r) => r.label)).toEqual(["Mozilla"]);
    expect(out[0].rank).toBe(1);
  });

  it("6. treats a pre-v3 entry with no position key at all the same as null", () => {
    const out = rankLatestPositions({
      entities: [brand, rival("Amazon")],
      ranking: [entry("Mozilla", undefined, 48, true), entry("Amazon", undefined, 14)]
    });

    expect(out).toEqual([]);
  });

  it("7. matches the brand by is_brand, not by name", () => {
    // The persisted name is whatever was stored when the run was scored, so a
    // brand renamed since then must still find its own row.
    const out = rankLatestPositions({
      entities: [{ key: "brand", label: "Mozilla Firefox", isBrand: true }],
      ranking: [entry("Mozilla", 1.5, 48, true)]
    });

    expect(out).toHaveLength(1);
    expect(out[0].mentionRate).toBe(48);
  });

  it("8. never matches a competitor against the brand's own entry", () => {
    // A competitor tracked under the same name as the brand must not inherit
    // the brand's position; only `is_brand: false` entries are eligible.
    const out = rankLatestPositions({
      entities: [rival("Mozilla")],
      ranking: [entry("Mozilla", 1.5, 48, true)]
    });

    expect(out).toEqual([]);
  });

  it("9. ignores a ranking entry for an entity the caller did not ask about", () => {
    // A competitor deactivated after the scan is still in the persisted
    // ranking; both screens must stop showing it at the same time.
    const out = rankLatestPositions({
      entities: [brand],
      ranking: [entry("Mozilla", 1.5, 48, true), entry("Retirado", 1.0, 30)]
    });

    expect(out.map((r) => r.label)).toEqual(["Mozilla"]);
  });

  it("10. carries the caller's own fields through untouched", () => {
    const out = rankLatestPositions({
      entities: [{ key: "id-1", label: "Amazon", domain: "amazon.com", isBrand: false }],
      ranking: [entry("Amazon", 1.0, 14)]
    });

    expect(out[0].domain).toBe("amazon.com");
    expect(out[0].key).toBe("id-1");
    expect(out[0].position).toBe(1.0);
  });

  it("11. survives a missing ranking (no run_scores row for that run)", () => {
    expect(rankLatestPositions({ entities: [brand], ranking: null })).toEqual([]);
    expect(rankLatestPositions({ entities: [brand], ranking: undefined })).toEqual([]);
  });

  it("12. gives both screens the same order for the same scan (PANORAMA-PARITY-1)", () => {
    // The Overview builds its entity list from `project_competitors` order;
    // Competidores builds it sorted by cumulative SoV. Same scan, same ranking
    // → the two lists must be identical, or one of them is lying.
    const ranking = [
      entry("Mozilla", 1.5, 48, true),
      entry("Proton VPN", 1.0, 5),
      entry("Amazon", 1.0, 14),
      entry("Google Chrome", 1.25, 19),
      entry("Brave", 1.33, 14)
    ];
    const names = ["Proton VPN", "Amazon", "Google Chrome", "Brave"];

    const overview = rankLatestPositions({ entities: [brand, ...names.map(rival)], ranking });
    const competitors = rankLatestPositions({
      entities: [...[...names].reverse().map(rival), brand],
      ranking
    });

    expect(overview.map((r) => [r.label, r.rank, r.mentionRate])).toEqual(
      competitors.map((r) => [r.label, r.rank, r.mentionRate])
    );
    expect(overview.map((r) => `${r.rank}º ${r.label}`)).toEqual([
      "1º Amazon",
      "2º Google Chrome",
      "3º Brave",
      "4º Mozilla",
      // Proton VPN averages 1,00 — the best mean on the board — over 5% of the
      // answers. SAMPLE-FLOOR-1 puts it last instead of first (it used to be
      // 2º here purely because the mention-rate tiebreak ran after position).
      "5º Proton VPN"
    ]);
  });

  it("13. SAMPLE-FLOOR-1: the movistar.es scan the founder reported", () => {
    // 30 answers. Euskaltel was named ONCE, came first in that one answer, and
    // therefore led both screens at 1,00 — above Movistar, named in 26 of the
    // 30. "Euskaltel 1º · 3% de mención" is not a sentence any reader parses
    // as "we saw it once" (founder, 2026-08-27).
    const out = rankLatestPositions({
      entities: [
        { key: "b", label: "Movistar", isBrand: true },
        rival("Vodafone España"),
        rival("Orange España"),
        rival("MásMóvil"),
        rival("Digi"),
        rival("O2"),
        rival("Euskaltel")
      ],
      ranking: [
        entry("Movistar", 1.4, 87, true, 26),
        entry("Vodafone España", 1.8, 73, false, 22),
        entry("Orange España", 2.1, 57, false, 17),
        entry("MásMóvil", 2.6, 33, false, 10),
        entry("Digi", 2.9, 30, false, 9),
        entry("O2", 3.4, 20, false, 6),
        entry("Euskaltel", 1.0, 3, false, 1)
      ]
    });

    expect(out.map((r) => `${r.rank}º ${r.label}`)).toEqual([
      "1º Movistar",
      "2º Vodafone España",
      "3º Orange España",
      "4º MásMóvil",
      "5º Digi",
      "6º O2",
      "7º Euskaltel"
    ]);
    // Demoted, never dropped, and its real figures are untouched — the row has
    // to be able to explain itself.
    expect(out.at(-1)).toMatchObject({ label: "Euskaltel", qualified: false, position: 1.0, mentionRate: 3 });
    expect(out.slice(0, -1).every((r) => r.qualified)).toBe(true);
  });

  it("14. the floor is a rate, so it holds at both ends of the scan-size range", () => {
    // 3 mentions is 10% of a 30-answer scan and 0,6% of a 500-answer one. A
    // fixed count would have called the second one qualified.
    const big = rankLatestPositions({
      entities: [rival("Ruido"), rival("Real")],
      ranking: [entry("Ruido", 1.0, 0.6, false, 3), entry("Real", 2.0, 40, false, 200)]
    });
    expect(big.map((r) => r.label)).toEqual(["Real", "Ruido"]);

    // And the absolute half guards the other extreme: on a 10-answer first
    // scan, 10% is a single answer — the very thing the floor exists to stop.
    const small = rankLatestPositions({
      entities: [rival("UnaVez"), rival("Constante")],
      ranking: [entry("UnaVez", 1.0, 10, false, 1), entry("Constante", 2.0, 60, false, 6)]
    });
    expect(small.map((r) => r.label)).toEqual(["Constante", "UnaVez"]);
  });

  it("15. an entry carrying neither figure is left qualified, not demoted on a gap", () => {
    // Demoting for a key that was never written would be inventing a verdict
    // out of missing data — the opposite fail direction from the one we want.
    const out = rankLatestPositions({
      entities: [rival("SinCifras"), rival("ConCifras")],
      ranking: [entry("SinCifras", 1.0), entry("ConCifras", 2.0, 50, false, 15)]
    });
    expect(out.map((r) => [r.label, r.qualified])).toEqual([
      ["SinCifras", true],
      ["ConCifras", true]
    ]);
  });

  it("16. judges the floor on the ROUNDED rate the row actually prints", () => {
    // 9,6% renders as "10%". Judged raw it would sit last carrying "pocas
    // menciones" beside a figure that reads as meeting the floor exactly —
    // the screen contradicting itself in one line (Apple Safari, proyecto
    // Mozilla, 2026-08-27).
    const out = rankLatestPositions({
      entities: [rival("Redondea"), rival("Justo")],
      ranking: [entry("Redondea", 1.0, 9.6, false, 5), entry("Justo", 2.0, 40, false, 20)]
    });
    expect(out.map((r) => [r.label, r.qualified])).toEqual([
      ["Redondea", true],
      ["Justo", true]
    ]);

    // Y 9,4% se pinta como "9%", que sí contradice el suelo a la vista.
    const below = rankLatestPositions({
      entities: [rival("Baja"), rival("Justo")],
      ranking: [entry("Baja", 1.0, 9.4, false, 5), entry("Justo", 2.0, 40, false, 20)]
    });
    expect(below.map((r) => [r.label, r.qualified])).toEqual([
      ["Justo", true],
      ["Baja", false]
    ]);
  });
});
