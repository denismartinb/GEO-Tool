import { describe, expect, it } from "vitest";
import { orderByLatestRank, rankLatestPositions, type LatestPositionEntity } from "./latest-positions";
import type { PersistedRankingEntry } from "@/lib/scoring/brand-position-ranking";

function entry(
  name: string,
  avg: number | null | undefined,
  mentionRate?: number,
  isBrand = false
): PersistedRankingEntry {
  return {
    name,
    is_brand: isBrand,
    ...(avg === undefined ? {} : { avg_position_when_mentioned: avg }),
    ...(mentionRate === undefined ? {} : { mention_rate: mentionRate })
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
    // Proton VPN and Amazon both average 1,00 on the founder's Mozilla project.
    // Ordered by position alone the winner is whoever the array happened to
    // hold first, which is how the Overview showed Proton VPN 1º while
    // Competidores showed Amazon 1º for the same scan.
    const out = rankLatestPositions({
      entities: [rival("Proton VPN"), rival("Amazon")],
      ranking: [entry("Proton VPN", 1.0, 5), entry("Amazon", 1.0, 14)]
    });

    expect(out.map((r) => r.label)).toEqual(["Amazon", "Proton VPN"]);
  });

  it("3. is stable regardless of the caller's array order", () => {
    const ranking = [entry("Proton VPN", 1.0, 5), entry("Amazon", 1.0, 14)];
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
      "2º Proton VPN",
      "3º Google Chrome",
      "4º Brave",
      "5º Mozilla"
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
