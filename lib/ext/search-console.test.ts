import { describe, expect, it } from "vitest";
import { toExtSearchConsole } from "./search-console";
import type { SearchConsoleOverview } from "@/lib/search-console/load";

describe("toExtSearchConsole (log §409)", () => {
  it("reads a connected project's Google figures", () => {
    const ready = {
      kind: "ready",
      report: {
        clicks: { value: 23, deltaPct: null },
        position: { value: 38.8 },
        nearPage1: [{}, {}],
        empty: false
      }
    } as unknown as SearchConsoleOverview;
    expect(toExtSearchConsole(ready)).toEqual({ state: "connected", clicks: 23, position: 38.8, nearPage1: 2, empty: false });
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
