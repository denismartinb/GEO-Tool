import { describe, expect, it } from "vitest";
import { toExtSearchConsole } from "./search-console";
import type { SearchConsoleScreen } from "@/lib/search-console/load";

const q = (query: string, position: number, clicks: number, impressions: number, movement: number | null = null) => ({
  query,
  position,
  movement,
  clicks,
  impressions,
  ctr: impressions ? clicks / impressions : 0,
  nearPage1: position > 10 && position <= 20
});

function ready(): SearchConsoleScreen {
  const queries = [q("genscore", 1.2, 9, 40, 0), q("herramienta ia", 8.6, 4, 90, 3), q("como salir en chatgpt", 12.4, 0, 86, 6), q("auditoria geo", 15.8, 0, 41)];
  return {
    kind: "ready",
    property: "sc-domain:genscore.es",
    window: { startDate: "2026-10-04", endDate: "2026-10-31" },
    uninspected: 0,
    report: {
      clicks: { value: 23, deltaPct: 475 },
      impressions: { value: 530, deltaPct: 175 },
      position: { value: 38.8, delta: 4.5 },
      daily: [
        { date: "2026-10-04", clicks: 1, impressions: 12, position: 41.26 },
        { date: "2026-10-05", clicks: 0, impressions: 0, position: 0 }
      ],
      queries,
      nearPage1: [queries[2], queries[3]],
      index: null,
      empty: false
    },
    insights: {
      tiers: [],
      pageByQuery: { genscore: "https://www.genscore.es/", "herramienta ia": "https://www.genscore.es/blog/x" },
      pages: [{ page: "https://www.genscore.es/", path: "/", clicks: 14, impressions: 212, position: 21.33, queryCount: 3, audit: { kind: "unaudited" } }],
      ctr: [],
      questions: [],
      devices: [],
      pageStats: { pages: [], complete: true },
      cannibalization: []
    }
  } as unknown as SearchConsoleScreen;
}

describe("toExtSearchConsole (log §409, §411)", () => {
  it("keeps the flat §409 figures for panels that only know them", () => {
    const g = toExtSearchConsole(ready());
    expect(g).toMatchObject({ state: "connected", clicks: 23, position: 38.8, nearPage1: 2, empty: false });
  });

  it("carries the trend, the top queries and the near-page-1 ones", () => {
    const g = toExtSearchConsole(ready());
    if (g.state !== "connected") throw new Error("expected connected");
    expect(g.trend.clicksDeltaPct).toBe(475);
    expect(g.trend.impressions).toBe(530);
    expect(g.trend.positionDelta).toBe(4.5);
    expect(g.trend.queries.map((x) => x.query)).toEqual(["genscore", "herramienta ia"]);
    expect(g.trend.near.map((x) => x.query)).toEqual(["como salir en chatgpt", "auditoria geo"]);
    // A day without impressions has no position, never a 0.
    expect(g.trend.daily.map((d) => d.position)).toEqual([41.3, null]);
  });

  it("gives the open page its own figures and the queries Google sends to it", () => {
    const g = toExtSearchConsole(ready(), "https://genscore.es");
    if (g.state !== "connected") throw new Error("expected connected");
    expect(g.page).toMatchObject({ clicks: 14, impressions: 212, position: 21.3 });
    expect(g.page?.queries.map((x) => x.query)).toEqual(["genscore"]);
    const other = toExtSearchConsole(ready(), "https://www.genscore.es/precios");
    if (other.state !== "connected") throw new Error("expected connected");
    expect(other.page).toBeNull();
  });

  it("keeps the states the panel acts on, and hides what cannot work", () => {
    expect(toExtSearchConsole({ kind: "disconnected" })).toEqual({ state: "disconnected" });
    expect(toExtSearchConsole({ kind: "reconnect", reason: "revoked" })).toEqual({ state: "reconnect" });
    expect(toExtSearchConsole({ kind: "pick_property", candidates: [], verifiedCount: 0 })).toEqual({ state: "pick_property" });
    expect(toExtSearchConsole({ kind: "not_configured" })).toEqual({ state: "off" });
    expect(toExtSearchConsole({ kind: "unavailable" })).toEqual({ state: "off" });
    expect(toExtSearchConsole(null)).toEqual({ state: "error" });
  });
});
