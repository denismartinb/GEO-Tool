import type { SearchConsoleOverview } from "@/lib/search-console/load";

/**
 * EXT-GSC-1 (log §409): the Search Console state of one project, as the
 * Chrome panel shows it. The same overview Visión general reads
 * (`loadSearchConsoleOverview`: our database first, then Google with the
 * 30-minute cache), reduced to what the panel paints. A figure Google did not
 * give is never invented; a feature that cannot work ("off") paints nothing.
 */
export type ExtSearchConsole =
  | { state: "connected"; clicks: number; position: number | null; nearPage1: number; empty: boolean }
  | { state: "disconnected" | "reconnect" | "pick_property" | "error" | "off" };

export function toExtSearchConsole(overview: SearchConsoleOverview | null): ExtSearchConsole {
  if (!overview) return { state: "error" };
  switch (overview.kind) {
    case "ready": {
      const r = overview.report;
      return {
        state: "connected",
        clicks: r.clicks.value,
        position: r.position.value,
        nearPage1: r.nearPage1.length,
        empty: r.empty
      };
    }
    case "disconnected":
    case "reconnect":
    case "pick_property":
    case "error":
      return { state: overview.kind };
    default:
      return { state: "off" };
  }
}
