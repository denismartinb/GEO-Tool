import "server-only";
import { extractClaudeStructuredData, generateClaudeVisibilityAnswer } from "@/lib/llm/claude";
import { extractGeminiStructuredData, generateGeminiVisibilityAnswer } from "@/lib/llm/gemini";
import { extractOpenAIStructuredData, generateOpenAIVisibilityAnswer } from "@/lib/llm/openai";
import { verifyExtractedMentions } from "@/lib/scan/extraction";
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
          : generateClaudeVisibilityAnswer;
    const answer = await generate({ prompt, country: sector.country, language: sector.language });

    const extract =
      engine === "gemini"
        ? extractGeminiStructuredData
        : engine === "openai"
          ? extractOpenAIStructuredData
          : extractClaudeStructuredData;
    const extracted = await extract({
      brand: STUDY_SENTINEL_BRAND,
      competitors: sector.seedBrands,
      rawResponseText: answer.text,
      promptText: prompt,
      deadlineAt
    });
    const verified = verifyExtractedMentions(extracted.data, answer.text, STUDY_SENTINEL_BRAND);
    return {
      ...base,
      model: answer.model,
      error: null,
      rawText: answer.text,
      seedMentions: verified.competitors
        .filter((competitor) => competitor.mentioned)
        .map((competitor) => ({ name: competitor.name, position: competitor.position })),
      otherBrands: verified.other_brands_mentioned
    };
  } catch (error) {
    const kind = error instanceof Error ? error.name : "UnknownError";
    const detail = (error as { category?: unknown })?.category;
    const category = typeof detail === "string" ? `${kind}:${detail}` : kind;
    return { ...base, model: null, error: category, rawText: null, seedMentions: [], otherBrands: [] };
  }
}
