/**
 * MODEL-COMPARE-1 (log §263) — the models the operator's comparison may call,
 * and what each costs. Pure: no environment, no network.
 *
 * A closed list on purpose. The server action only ever calls an id from
 * here, so a forged request cannot point the operator's keys at an arbitrary
 * model, and every option has a price to compute its cost from. "current"
 * means "whatever production runs today" (`GEMINI_MODEL`, `OPENAI_MODEL`,
 * `ANTHROPIC_MODEL` or their code defaults) and is resolved on the server.
 *
 * Prices are USD per million tokens, from the providers' public pricing pages
 * as consulted on 2026-10-09 (`docs/llm-cost-analysis-2026-08.md` §8). Search
 * fees are per query (Gemini 3 grounding, outside the 5,000 free monthly
 * queries) and per call (OpenAI web_search). They are estimates for
 * comparing two passes against each other, not an invoice.
 */

import type { CompareAnswerOk } from "@/lib/model-compare/compare";

export const COMPARE_ENGINES = ["gemini", "openai", "claude"] as const;
export type CompareEngine = (typeof COMPARE_ENGINES)[number];

export const COMPARE_ENGINE_LABEL: Record<CompareEngine, string> = {
  gemini: "Gemini",
  openai: "ChatGPT",
  claude: "Claude"
};

export type ModelPrice = { inPerM: number; outPerM: number };

export type ModelOption = { id: string; label: string; price: ModelPrice };

/** Generation candidates per engine. The first entry of each list is the model production runs today by default. */
export const GENERATION_MODELS: Record<CompareEngine, ModelOption[]> = {
  gemini: [
    { id: "gemini-3.6-flash", label: "gemini-3.6-flash", price: { inPerM: 0.75, outPerM: 3.75 } },
    { id: "gemini-3.1-flash-lite", label: "gemini-3.1-flash-lite", price: { inPerM: 0.25, outPerM: 1.5 } }
  ],
  openai: [
    { id: "gpt-4o-mini", label: "gpt-4o-mini", price: { inPerM: 0.15, outPerM: 0.6 } },
    { id: "gpt-6-luna", label: "gpt-6-luna", price: { inPerM: 0.1, outPerM: 0.5 } }
    // gpt-4.1-nano is not here: it does not take the web_search tool, so every
    // generation request is rejected (all 10 in the first real run, log §263).
    // It stays an extraction option, which needs no search.
  ],
  claude: [
    { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", price: { inPerM: 1, outPerM: 5 } },
    { id: "claude-haiku-5-5", label: "Haiku 5.5", price: { inPerM: 0.1, outPerM: 0.5 } }
  ]
};

/** Models offered only as extractors (no search needed), priced here so their cost is measured too. */
const EXTRACTION_ONLY_MODELS: ModelOption[] = [
  { id: "gpt-4.1-nano", label: "gpt-4.1-nano", price: { inPerM: 0.1, outPerM: 0.4 } }
];

/** Gemini 3 grounding: per search query, outside the free monthly allowance. */
export const GEMINI_SEARCH_FEE_PER_QUERY = 0.014;
/** OpenAI web_search: per tool call. */
export const OPENAI_SEARCH_FEE_PER_CALL = 0.01;

/**
 * How a pass extracts its answers. `native` is whatever the scan does today
 * (`resolveExtractionRoute`): each engine's own extractor while
 * `SCAN_EXTRACTION_CLAUDE_MODEL` is unset, that model once it is set. Passes
 * A and A2 always use it; only B takes the operator's choice.
 */
export type ExtractionChoice =
  | { kind: "native" }
  | { kind: "single"; provider: "claude" | "gemini" | "openai"; model: string };

export type ExtractionOption = { id: string; label: string; choice: ExtractionChoice };

export const EXTRACTION_OPTIONS: ExtractionOption[] = [
  { id: "native", label: "Como hoy en producción", choice: { kind: "native" } },
  {
    id: "claude:claude-haiku-5-5",
    label: "Haiku 5.5 para todo",
    choice: { kind: "single", provider: "claude", model: "claude-haiku-5-5" }
  },
  {
    id: "gemini:gemini-3.1-flash-lite",
    label: "gemini-3.1-flash-lite para todo",
    choice: { kind: "single", provider: "gemini", model: "gemini-3.1-flash-lite" }
  },
  {
    id: "openai:gpt-4.1-nano",
    label: "gpt-4.1-nano para todo",
    choice: { kind: "single", provider: "openai", model: "gpt-4.1-nano" }
  }
];

/** Selection sent by the browser: a catalogue id per engine, or "current". Validated again on the server. */
export type PassModels = Record<CompareEngine, string>;

export const CURRENT = "current";

/** Server-side limits of one comparison; the page also stops at its spend cap. */
export const COMPARE_LIMITS = { maxPrompts: 20, maxSamples: 3, maxSpendUsd: 10 } as const;

export function isAllowedGenerationModel(engine: CompareEngine, id: string): boolean {
  return id === CURRENT || GENERATION_MODELS[engine].some((option) => option.id === id);
}

export function findExtractionOption(id: string): ExtractionOption | null {
  return EXTRACTION_OPTIONS.find((option) => option.id === id) ?? null;
}

/** Price of a model id the comparison actually called, or null when it is not in the catalogue (e.g. an env override). */
export function priceOf(modelId: string | null | undefined): ModelPrice | null {
  if (!modelId) return null;
  const all = [...GENERATION_MODELS.gemini, ...GENERATION_MODELS.openai, ...GENERATION_MODELS.claude, ...EXTRACTION_ONLY_MODELS];
  // Providers echo versioned ids ("gpt-4o-mini-2024-07-18", "claude-haiku-4-5-20251001"):
  // match the longest catalogue id the reported one starts with.
  const match = all
    .filter((option) => modelId === option.id || modelId.startsWith(`${option.id}-`) || option.id.startsWith(`${modelId}-`))
    .sort((a, b) => b.id.length - a.id.length)[0];
  return match?.price ?? null;
}

export function tokenCost(price: ModelPrice, tokensIn: number, tokensOut: number): number {
  return (tokensIn * price.inPerM + tokensOut * price.outPerM) / 1_000_000;
}

/**
 * Rough per-answer token sizes for the pre-run estimate only. Measured
 * figures replace them as soon as answers come back; the page labels this
 * number "estimado".
 */
const ESTIMATE = { generationIn: 300, generationOut: 900, extractionIn: 1800, extractionOut: 400, geminiSearches: 2, openaiSearches: 1 };

export function estimateAnswerCost(engine: CompareEngine, generationModelId: string, extractionModelId: string): number {
  const generation = priceOf(generationModelId) ?? GENERATION_MODELS[engine][0].price;
  const extraction = priceOf(extractionModelId) ?? GENERATION_MODELS[engine][0].price;
  const searchFee =
    engine === "gemini"
      ? ESTIMATE.geminiSearches * GEMINI_SEARCH_FEE_PER_QUERY
      : engine === "openai"
        ? ESTIMATE.openaiSearches * OPENAI_SEARCH_FEE_PER_CALL
        : 0;
  return (
    tokenCost(generation, ESTIMATE.generationIn, ESTIMATE.generationOut) +
    tokenCost(extraction, ESTIMATE.extractionIn, ESTIMATE.extractionOut) +
    searchFee
  );
}

/** Measured cost of one answer in USD, or null when a model it used has no price in the catalogue. */
export function answerCost(answer: CompareAnswerOk): number | null {
  const generationPrice = priceOf(answer.generationModel);
  const extractionPrice = priceOf(answer.extractionModel);
  if (!generationPrice || !extractionPrice) return null;
  const { usage } = answer;
  const searchFee =
    answer.engine === "gemini"
      ? (usage.searches ?? 0) * GEMINI_SEARCH_FEE_PER_QUERY
      : answer.engine === "openai"
        ? (usage.searches ?? 0) * OPENAI_SEARCH_FEE_PER_CALL
        : 0;
  return (
    tokenCost(generationPrice, usage.generationIn, usage.generationOut) +
    tokenCost(extractionPrice, usage.extractionIn, usage.extractionOut) +
    searchFee
  );
}
