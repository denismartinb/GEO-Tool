import "server-only";
import { extractClaudeStructuredData, generateClaudeVisibilityAnswer } from "@/lib/llm/claude";
import { extractGeminiStructuredData, generateGeminiVisibilityAnswer } from "@/lib/llm/gemini";
import { extractOpenAIStructuredData, generateOpenAIVisibilityAnswer } from "@/lib/llm/openai";
import { generatePerplexityVisibilityAnswer } from "@/lib/llm/perplexity";
import { verifyExtractedMentions } from "@/lib/scan/extraction";
import { resolveGroundingRedirects } from "@/lib/scan/citation-resolution";
import { isGenericEntityName } from "@/lib/entity-hygiene/generic-entities";
import { STUDY_SENTINEL_BRAND, type AnswerRecord, type Engine, type SectorConfig } from "@/lib/studies/sector-study";

/**
 * SECTOR-STUDY-1 — one answer of the sector study: ask one engine one
 * question, then read it with that engine's extractor (same pairing as a
 * scan) and keep only mentions verified literally against the answer text.
 *
 * Never throws: a failure becomes a record with `error` set, so it is
 * counted as a failure and kept out of the denominator — never as an answer
 * that named no brands. The error is a category this code wrote, never a
 * provider message (.claude/rules/gemini.md).
 */
export async function runSectorAnswer(input: {
  sector: SectorConfig;
  engine: Engine;
  promptIndex: number;
  sample: number;
  /** Absolute epoch-ms budget for the extraction retries. */
  deadlineAt?: number;
}): Promise<AnswerRecord> {
  const { sector, engine, promptIndex, sample, deadlineAt } = input;
  const prompt = sector.prompts[promptIndex];
  const base = { engine, promptIndex, sample };
  try {
    const generate =
      engine === "gemini"
        ? generateGeminiVisibilityAnswer
        : engine === "openai"
          ? generateOpenAIVisibilityAnswer
          : engine === "perplexity"
            ? generatePerplexityVisibilityAnswer
            : generateClaudeVisibilityAnswer;
    const answer = await generate({ prompt, country: sector.country, language: sector.language });

    // Perplexity has no extractor of its own; Gemini reads it, as the scan's
    // routing does for any provider without one (resolveExtractionRoute).
    const extract =
      engine === "gemini" || engine === "perplexity"
        ? extractGeminiStructuredData
        : engine === "openai"
          ? extractOpenAIStructuredData
          : extractClaudeStructuredData;
    // Same rule as the scan (lib/scan/extraction.ts): Gemini's grounding URIs
    // are Google redirect wrappers and get resolved through the SSRF-guarded
    // resolver; OpenAI's and Perplexity's are already final. Runs alongside the extraction.
    const [extracted, citations] = await Promise.all([
      extract({
        brand: sector.brand ?? STUDY_SENTINEL_BRAND,
        competitors: sector.seedBrands,
        rawResponseText: answer.text,
        promptText: prompt,
        deadlineAt
      }),
      resolveCitations(engine, answer.groundingChunks ?? [])
    ]);
    const verified = verifyExtractedMentions(extracted.data, answer.text, sector.brand ?? STUDY_SENTINEL_BRAND);
    // A custom study's own brand is counted like any seed, from the
    // extractor's verified brand slot.
    const brandMention =
      sector.brand && verified.brand.mentioned ? [{ name: sector.brand, position: verified.brand.position }] : [];
    return {
      ...base,
      model: answer.model,
      error: null,
      rawText: answer.text,
      seedMentions: [
        ...brandMention,
        ...verified.competitors
          .filter((competitor) => competitor.mentioned)
          .map((competitor) => ({ name: competitor.name, position: competitor.position }))
      ],
      otherBrands: verified.other_brands_mentioned.filter((name) => !isGenericEntityName(name)),
      sentiment: sector.brand && verified.brand.mentioned ? verified.sentiment : null,
      citations
    };
  } catch (error) {
    const kind = error instanceof Error ? error.name : "UnknownError";
    const detail = (error as { category?: unknown })?.category;
    const category = typeof detail === "string" ? `${kind}:${detail}` : kind;
    return { ...base, model: null, error: category, rawText: null, seedMentions: [], otherBrands: [] };
  }
}

function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

async function resolveCitations(engine: Engine, chunks: Array<{ uri?: string }>): Promise<Array<{ url: string; domain: string | null }>> {
  const uris = [...new Set(chunks.map((chunk) => chunk.uri).filter((uri): uri is string => Boolean(uri)))];
  if (uris.length === 0) return [];
  if (engine !== "gemini") return uris.map((url) => ({ url, domain: domainOf(url) }));
  const resolved = await resolveGroundingRedirects(uris);
  return uris.map((uri) => {
    const url = resolved.get(uri)?.resolvedUrl ?? null;
    // Unresolved: keep the wrapper for traceability, never its host as a domain.
    return url ? { url, domain: domainOf(url) } : { url: uri, domain: null };
  });
}
