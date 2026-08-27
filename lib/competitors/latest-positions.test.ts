import { describe, expect, it } from "vitest";
import { defaultVisibleSeriesKeys, orderByLatestRank, rankLatestPositions, type LatestPositionEntity } from "./latest-positions";
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

/**
 * MEAN-RANK-READS-TRUE-1 (2026-08-27, log §177).
 *
 * El fallo que fijan: el gráfico y la tabla comparten tarjeta en Competidores y
 * no compartían conjunto. La tabla se ordena por `rankLatestPositions`; el
 * gráfico recibía sus series por cuota de voz acumulada y sólo enciende las
 * cuatro primeras. En el proyecto Mozilla del fundador eso daba Amazon/Chrome/
 * Brave en la tabla contra Mozilla/Chrome/Safari/Edge en el gráfico.
 */
describe("orderByLatestRank", () => {
  type Series = { key: string; label: string; isBrand?: boolean };
  /** Las series como las construía la pantalla: marca primero, resto por cuota. */
  const MOZILLA_SERIES: Series[] = [
    { key: "brand", label: "Mozilla", isBrand: true },
    { key: "chrome", label: "Google Chrome" },
    { key: "safari", label: "Apple Safari" },
    { key: "edge", label: "Microsoft Edge" },
    { key: "brave", label: "Brave" },
    { key: "proton", label: "Proton VPN" },
    { key: "amazon", label: "Amazon" },
    { key: "eset", label: "ESET" }
  ];
  /** El orden de la tabla en ese mismo escaneo (ver log §175 y §177). */
  const TABLE_ORDER = ["amazon", "chrome", "brave", "brand", "edge", "safari", "proton"];

  it("el caso real: las cuatro visibles pasan a ser las de la tabla", () => {
    const ordered = orderByLatestRank({ items: MOZILLA_SERIES, rankedKeys: TABLE_ORDER });
    // El gráfico enciende las 4 primeras. Antes: Mozilla, Chrome, Safari, Edge.
    expect(ordered.slice(0, 4).map((s) => s.key)).toEqual(["brand", "amazon", "chrome", "brave"]);
  });

  it("la marca propia va primera aunque la tabla la ponga cuarta", () => {
    const ordered = orderByLatestRank({ items: MOZILLA_SERIES, rankedKeys: TABLE_ORDER });
    expect(ordered[0].isBrand, "la línea de tu propia marca no puede nacer apagada").toBe(true);
  });

  it("una marca sin puesto en el último escaneo conserva su línea, detrás", () => {
    const ordered = orderByLatestRank({ items: MOZILLA_SERIES, rankedKeys: TABLE_ORDER });
    // ESET no está en TABLE_ORDER: no tuvo posición en el último escaneo, pero
    // puede tenerla en los anteriores, así que sigue teniendo serie.
    expect(ordered.map((s) => s.key)).toContain("eset");
    expect(ordered[ordered.length - 1].key).toBe("eset");
  });

  it("no pierde ni duplica ninguna serie", () => {
    const ordered = orderByLatestRank({ items: MOZILLA_SERIES, rankedKeys: TABLE_ORDER });
    expect(ordered).toHaveLength(MOZILLA_SERIES.length);
    expect(new Set(ordered.map((s) => s.key)).size).toBe(MOZILLA_SERIES.length);
  });

  it("sin ranking, deja el orden que traía", () => {
    const ordered = orderByLatestRank({ items: MOZILLA_SERIES, rankedKeys: [] });
    expect(ordered.map((s) => s.key)).toEqual(MOZILLA_SERIES.map((s) => s.key));
  });

  it("una clave del ranking que no tiene serie no rompe nada", () => {
    const ordered = orderByLatestRank({
      items: MOZILLA_SERIES,
      rankedKeys: ["fantasma", ...TABLE_ORDER]
    });
    expect(ordered.slice(0, 4).map((s) => s.key)).toEqual(["brand", "amazon", "chrome", "brave"]);
  });
});

/**
 * MEAN-RANK-READS-TRUE-1, segunda pasada (log §177).
 *
 * El fallo que fijan lo encontró el fundador mirando el preview de la primera:
 * Brave era 4º y Mozilla 5ª, y Brave no salía encendido. Con la marca propia
 * ocupando el primer hueco, encender «las cuatro primeras» del orden dejaba
 * fuera al 4º de la clasificación — alguien que te está ganando.
 */
describe("defaultVisibleSeriesKeys", () => {
  /** El orden de la tabla en el escaneo real de Mozilla. */
  const TABLE_ORDER = ["amazon", "proton", "chrome", "brave", "brand", "edge", "safari"];

  it("el caso del fundador: Brave (4º) se enciende aunque la marca sea 5ª", () => {
    const visible = defaultVisibleSeriesKeys({ rankedKeys: TABLE_ORDER, brandKey: "brand", cap: 4 });
    expect(visible).toContain("brave");
    expect(visible).toEqual(["amazon", "proton", "chrome", "brave", "brand"]);
  });

  it("nadie que te adelante nace apagado", () => {
    const visible = new Set(defaultVisibleSeriesKeys({ rankedKeys: TABLE_ORDER, brandKey: "brand", cap: 4 }));
    const brandRank = TABLE_ORDER.indexOf("brand");
    for (const key of TABLE_ORDER.slice(0, brandRank)) {
      expect(visible.has(key), `${key} va por delante de la marca y nacía apagado`).toBe(true);
    }
  });

  it("la marca propia nunca nace apagada", () => {
    for (const order of [TABLE_ORDER, ["brand", ...TABLE_ORDER.filter((k) => k !== "brand")], []]) {
      expect(defaultVisibleSeriesKeys({ rankedKeys: order, brandKey: "brand", cap: 4 })).toContain("brand");
    }
  });

  it("dentro del corte no gasta una quinta línea", () => {
    const order = ["amazon", "brand", "chrome", "brave", "edge"];
    const visible = defaultVisibleSeriesKeys({ rankedKeys: order, brandKey: "brand", cap: 4 });
    expect(visible).toHaveLength(4);
    expect(visible).toEqual(["amazon", "brand", "chrome", "brave"]);
  });

  it("nunca duplica la marca ni pasa de cap + 1", () => {
    for (const cap of [1, 2, 3, 4, 6]) {
      const visible = defaultVisibleSeriesKeys({ rankedKeys: TABLE_ORDER, brandKey: "brand", cap });
      expect(new Set(visible).size).toBe(visible.length);
      expect(visible.length).toBeLessThanOrEqual(cap + 1);
    }
  });
});
