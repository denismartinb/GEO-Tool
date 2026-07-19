/**
 * Shared, client-safe metadata for LLM engines (providers). Consumed by both
 * server code (Overview page) and client components (Prompts table, prompt
 * drawer) — do NOT import "server-only" here.
 *
 * See docs/specs/engines-value-1.md (ENGINES-VALUE-1) for the rationale:
 * the multi-engine data (one scan_prompt_results row per provider) was
 * already paid for on every scan but the UI only surfaced it in two
 * hardcoded, drifting places. This module is the single source of truth for
 * engine label/color/short/grounded so a third engine (OpenAI, ENGINES-2)
 * only needs one new entry here.
 */

export type EngineMeta = {
  /** Visible engine name. */
  label: string;
  /** Brand color used across Overview, Prompts chips, and the drawer. */
  color: string;
  /** Single-letter initial for compact chips. */
  short: string;
  /**
   * Whether this engine's generation call includes real grounding (Google
   * Search) and can therefore produce genuine citation evidence.
   *
   * This deliberately duplicates the semantics of GROUNDED_PROVIDERS in
   * lib/scoring/run-scoring.ts (docs/adr/0012-grounding-aware-citation-score.md)
   * WITHOUT importing it — that module belongs to scoring and must not
   * become a dependency of UI code. If an engine gains real grounding,
   * update BOTH this map and GROUNDED_PROVIDERS in run-scoring.ts.
   */
  grounded: boolean;
};

export const ENGINE_META: Record<string, EngineMeta> = {
  gemini: { label: "Gemini", color: "#4285f4", short: "G", grounded: true },
  claude: { label: "Claude", color: "#d97757", short: "C", grounded: false },
  // ENGINES-2a: OpenAI generates with the Responses API `web_search` tool
  // (lib/llm/openai.ts), so it produces real url_citation grounding — same
  // grounded semantics as GROUNDED_PROVIDERS in lib/scoring/run-scoring.ts.
  openai: { label: "ChatGPT", color: "#10a37f", short: "O", grounded: true }
};

const FALLBACK_META: EngineMeta = { label: "", color: "#9333a8", short: "?", grounded: false };

/**
 * Rows persisted before migration 0009 (multi-engine) have provider: null
 * and were always Gemini — same fallback the Overview page already applies.
 */
export function normalizeProvider(provider: string | null | undefined): string {
  return provider ?? "gemini";
}

/**
 * Returns the metadata for a provider, normalizing null/undefined to
 * "gemini" first. Unknown providers fall back to a neutral, non-branded
 * look rather than throwing — the label defaults to the raw provider string
 * so unexpected values are still legible.
 */
export function getEngineMeta(provider: string | null | undefined): EngineMeta {
  const normalized = normalizeProvider(provider);
  const meta = ENGINE_META[normalized];
  if (meta) return meta;
  return { ...FALLBACK_META, label: normalized };
}
