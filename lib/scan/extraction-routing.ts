/**
 * EXTRACTION-SINGLE-MODEL-1 (log §253) — which model turns a stored answer
 * into structured data.
 *
 * Pure: reads only the env object it is given, so the routing is testable
 * without a provider.
 *
 * Extraction has always used the provider that generated the answer
 * (Gemini→Gemini, Claude→Claude, OpenAI→OpenAI), with no technical reason:
 * its input is `raw_response_text`, plain text already persisted
 * (`docs/llm-cost-analysis-2026-08.md` §3). Since Gemini moved to 3.6 Flash,
 * the two extractors that run on most rows (Gemini and Claude Haiku 4.5) are
 * also the expensive ones. `SCAN_EXTRACTION_CLAUDE_MODEL` sends every row to
 * one Claude model instead — the intended value is a small, cheap one.
 *
 * Unset by default, on purpose. Extraction decides `brand_mentioned`,
 * the competitor count and the sentiment, so it feeds the GEO score; the
 * switch is flipped only after `pnpm bench:extraction` shows the candidate
 * agrees with production (`docs/extraction-cost-bench-2026-08.md`). Unsetting
 * it is the rollback, with no deploy of code.
 *
 * What it can never change: the answer itself (generation is untouched) and
 * `citations_count`/`citation_found`, which come from the grounding metadata
 * frozen at generation time.
 */

export type ExtractionProvider = "gemini" | "claude" | "openai";

export type ExtractionRoute = {
  provider: ExtractionProvider;
  /** Model override for that provider; absent means the provider's own default. */
  model?: string;
};

export const SINGLE_EXTRACTOR_ENV = "SCAN_EXTRACTION_CLAUDE_MODEL";

export function resolveExtractionRoute(
  rowProvider: string,
  env: Record<string, string | undefined> = process.env
): ExtractionRoute {
  const single = env[SINGLE_EXTRACTOR_ENV]?.trim();
  if (single) return { provider: "claude", model: single };
  if (rowProvider === "claude" || rowProvider === "openai") return { provider: rowProvider };
  return { provider: "gemini" };
}
