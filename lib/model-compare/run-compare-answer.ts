import "server-only";
import { CLAUDE_GENERATION_MAX_TOKENS, extractClaudeStructuredData, generateClaudeVisibilityAnswer } from "@/lib/llm/claude";
import { extractGeminiStructuredData, generateGeminiVisibilityAnswer } from "@/lib/llm/gemini";
import { extractOpenAIStructuredData, generateOpenAIVisibilityAnswer } from "@/lib/llm/openai";
import { buildExtractionUpdate } from "@/lib/scan/extraction";
import { resolveExtractionRoute } from "@/lib/scan/extraction-routing";
import { isGenericEntityName } from "@/lib/entity-hygiene/generic-entities";
import type { BusinessProfile } from "@/lib/llm/contracts";
import { CURRENT, type CompareEngine, type ExtractionChoice } from "@/lib/model-compare/catalogue";
import { slimExtracted, type CompareAnswer, type ComparePass } from "@/lib/model-compare/compare";

export type CompareProject = {
  brand: string;
  brandAliases: string[];
  domain: string;
  country: string;
  language: string;
  competitors: string[];
  profile?: BusinessProfile;
};

/**
 * MODEL-COMPARE-1 (log §269) — one answer of the operator's model
 * comparison: the scan's own generation call (same brand-blind instruction),
 * the chosen extractor, then `buildExtractionUpdate`, the exact code that
 * turns an extraction into the row a scan persists. So the two passes differ
 * only in the models, never in how an answer is read or scored.
 *
 * Never throws: a failure becomes a record with `error` set, kept out of
 * every denominator — never counted as an answer that did not name the
 * brand. The error is a category this code wrote (.claude/rules/gemini.md).
 * Nothing is written anywhere.
 */
export async function runCompareAnswer(input: {
  project: CompareProject;
  engine: CompareEngine;
  pass: ComparePass;
  /** A catalogue id, or CURRENT for production's own model. Already validated. */
  generationModel: string;
  extraction: ExtractionChoice;
  promptIndex: number;
  promptText: string;
  sample: number;
  deadlineAt: number;
}): Promise<CompareAnswer> {
  const { project, engine, pass, promptIndex, sample } = input;
  const base = { engine, pass, promptIndex, sample };
  const model = input.generationModel === CURRENT ? undefined : input.generationModel;
  try {
    const generate =
      engine === "gemini"
        ? generateGeminiVisibilityAnswer
        : engine === "openai"
          ? generateOpenAIVisibilityAnswer
          : generateClaudeVisibilityAnswer;
    const answer = await generate({ prompt: input.promptText, country: project.country, language: project.language, model });

    const extractionArgs = {
      brand: project.brand,
      competitors: project.competitors,
      rawResponseText: answer.text,
      promptText: input.promptText,
      profile: project.profile,
      deadlineAt: input.deadlineAt
    };
    // "native" is production's own routing, whatever it is today — including
    // SCAN_EXTRACTION_CLAUDE_MODEL once it is set — so pass A stays the baseline.
    const route =
      input.extraction.kind === "native"
        ? resolveExtractionRoute(engine)
        : { provider: input.extraction.provider, model: input.extraction.model };
    const extractor = route.provider;
    const extractionModel = route.model;
    const extracted =
      extractor === "claude"
        ? await extractClaudeStructuredData({ ...extractionArgs, model: extractionModel })
        : extractor === "openai"
          ? await extractOpenAIStructuredData({ ...extractionArgs, model: extractionModel })
          : await extractGeminiStructuredData({ ...extractionArgs, model: extractionModel });

    const fields = await buildExtractionUpdate({
      extracted: extracted.data,
      rawResponseText: answer.text,
      brand: project.brand,
      brandAliases: project.brandAliases,
      competitors: project.competitors,
      groundingChunks: answer.groundingChunks ?? [],
      provider: engine
    });
    const data = fields.extracted_json;

    return {
      ...base,
      error: null,
      generationModel: answer.model,
      extractionModel: extracted.model,
      usage: {
        generationIn: answer.tokensIn ?? 0,
        generationOut: answer.tokensOut ?? 0,
        searches: answer.searchQueries ?? null,
        extractionIn: extracted.tokensIn ?? 0,
        extractionOut: extracted.tokensOut ?? 0
      },
      row: {
        brand_mentioned: fields.brand_mentioned,
        citation_found: fields.citation_found,
        mentioned_competitors_count: fields.mentioned_competitors_count,
        citations_count: fields.citations_count,
        sentiment: fields.sentiment,
        extracted_json: slimExtracted(data)
      },
      truncated: engine === "claude" && (answer.tokensOut ?? 0) >= CLAUDE_GENERATION_MAX_TOKENS,
      brandPosition: data.brand.mentioned ? data.brand.position : null,
      namedBrands: [
        ...data.competitors.filter((competitor) => competitor.mentioned).map((competitor) => competitor.name),
        ...data.other_brands_mentioned.filter((name) => !isGenericEntityName(name))
      ],
      citedDomains: [
        ...new Set(
          data.citations
            .filter((citation) => citation.source === "grounding" && citation.domain)
            .map((citation) => citation.domain as string)
        )
      ]
    };
  } catch (error) {
    const kind = error instanceof Error ? error.name : "UnknownError";
    const detail = (error as { category?: unknown })?.category;
    // A provider's non-OK status reaches here as one of our own constant
    // messages (getGeminiApiError & co.) — the useful part when a candidate
    // model id is not served. Anything else is reduced to its class name.
    const ownMessage =
      error instanceof Error && /^(Gemini|OpenAI|Claude) (API|returned)/.test(error.message) ? error.message : null;
    return { ...base, error: typeof detail === "string" ? `${kind}:${detail}` : (ownMessage ?? kind) };
  }
}
