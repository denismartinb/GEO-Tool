// Types for the generated copy of the extension's score.js (MCP-SERVER-1, log §418).
declare namespace PageScore {
  type Lane = "ia" | "google" | "agent";
  type Criterion = { id: string; lane: Lane; w: number; v: number | null; label: string; value: string };
  type Fix = {
    id: string;
    lane: Lane;
    pts: number;
    unit: "pt" | "en Agentes";
    t: string;
    why?: string;
    how?: string;
    snippet?: string | null;
    copyWhat?: string;
    where?: string;
  };
  type Result = {
    nota: number;
    lanes: { ia: number | null; google: number | null; agent: number | null };
    criteria: Criterion[];
    fixes: Fix[];
    alert: { id: string; t: string; s: string } | null;
    say: string;
    commerce: boolean;
    service: boolean;
    shop: { state: "found"; path: string; url: string; service?: boolean; criteria: Criterion[]; fixes: Fix[] } | { state: "none" } | null;
    /** Why Agentes has no score on this page (log §465); null when it has one. */
    agentWhy: string | null;
    readers: string[];
    blockedEngines: string[];
  };
}
declare const api: {
  scorePage(facts: unknown, now?: number): PageScore.Result;
  ENGINES: string[];
  ENGINE_NAME: Record<string, string>;
};
export = api;
