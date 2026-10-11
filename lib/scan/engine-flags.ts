/**
 * Per-project engine switches from /debug (ENGINE-DEBUG-TOGGLE-1, migration
 * 0033; Perplexity added in PERPLEXITY-ENGINE-1 Fase 2, migration 0040).
 *
 * Both `createPendingScanRunCore` and `executePendingScan` read these on the
 * critical path of every scan, so the read FAILS OPEN: a missing column or a
 * transient error means "no project override", never "engine switched off".
 *
 * Perplexity's column lives in its own query, apart from the other three:
 * migration 0040 is applied by hand, and a column PostgREST does not know
 * about fails the WHOLE select it is part of. Merged, an unapplied 0040 would
 * silently discard the founder's Gemini/Claude/OpenAI switches too.
 */
import type { LLMScanProvider } from "./providers";

export function enginesFromFlags(
  coreFlags: Record<string, unknown> | null,
  perplexityFlag: Record<string, unknown> | null
): LLMScanProvider[] | undefined {
  if (!coreFlags) return undefined;
  return [
    coreFlags.engine_gemini_enabled !== false ? "gemini" : null,
    coreFlags.engine_claude_enabled !== false ? "claude" : null,
    coreFlags.engine_openai_enabled !== false ? "openai" : null,
    perplexityFlag?.engine_perplexity_enabled !== false ? "perplexity" : null
  ].filter(Boolean) as LLMScanProvider[];
}
