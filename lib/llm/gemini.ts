import "server-only";
import { z } from "zod";
import { extractionOutputSchema, type ExtractionOutput } from "@/lib/extraction/schema";
import { PROMPT_CATEGORIES, type PromptCategory } from "@/lib/projects/prompt-categories";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
// Pinned per docs/adr/0009-gemini-2.5-flash-model-pin.md — gemini-2.0-flash-001
// was shut down by Google on 2026-06-01. gemini-2.5-flash is the recommended
// replacement and has its own cutover date of 2026-10-16 to watch.
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_MODEL_ERROR = "Invalid GEMINI_MODEL. Use a valid Gemini model id such as gemini-2.5-flash.";
const RATE_LIMIT_RETRY_DELAY_MS = 1500;

/**
 * Hard per-call timeout for `generateGeminiVisibilityAnswer`, the call made
 * once per prompt by the scan executor (`lib/scan/executor.ts`), which since
 * SCAN-ROBUST-2 dispatches all `MAX_REAL_SCAN_PROMPTS=10` calls concurrently
 * inside the ~60s Vercel `maxDuration`
 * (docs/adr/0003-sync-scan-execution-and-maxduration.md). A single slow call
 * must not be allowed to consume the entire run budget — that would starve
 * the remaining prompts and risk tripping `SCAN_RUNNING_TIMEOUT_SECONDS`,
 * failing the whole run instead of just one prompt.
 *
 * 20s ceiling: generous enough that normal Gemini latency (typically a few
 * seconds) never hits it, while bounding how long a single stuck call can
 * block progress. The 60s budget is a *typical-case* target, not a guarantee:
 * a pathological run where every prompt times out (and retries once, see
 * PROMPT_RETRY_MAX_TOTAL_ATTEMPTS) can still exceed 60s. That worst case is
 * bounded instead by `SCAN_RUNNING_TIMEOUT_SECONDS` + reconciliation's
 * auto-retry (docs/scan-lifecycle.md), not by this per-call timeout alone.
 * A timeout here surfaces as `GeminiTimeoutError`, which the executor treats
 * as a normal recoverable per-prompt error: the prompt's job is recorded as
 * failed with a sanitized `last_error` and the run continues with the next
 * prompt — it must never crash the run.
 */
const GEMINI_CALL_TIMEOUT_MS = 20_000;

/**
 * Thrown when a Gemini API call is aborted after `GEMINI_CALL_TIMEOUT_MS`.
 * Treated as a recoverable per-prompt error by the scan executor — same
 * handling as an HTTP failure or empty response.
 */
export class GeminiTimeoutError extends Error {
  constructor(message = "Gemini API request timed out.") {
    super(message);
    this.name = "GeminiTimeoutError";
  }
}

/**
 * `fetch` wrapped with a hard AbortController-based timeout. Throws
 * `GeminiTimeoutError` if the request does not complete within `timeoutMs`,
 * instead of letting the call hang for the rest of the run budget or
 * surfacing a raw `AbortError`.
 */
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new GeminiTimeoutError();
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Thrown for misconfiguration (missing API key, invalid model id) that
 * affects every request equally — retrying or skipping to the next prompt
 * cannot help, so callers should treat this as fatal for the whole run.
 */
export class GeminiConfigError extends Error {}

function getGeminiModel() {
  const configuredValue = process.env.GEMINI_MODEL;
  const configuredModel = configuredValue === undefined ? DEFAULT_GEMINI_MODEL : configuredValue.trim();
  const model = configuredModel.startsWith("models/") ? configuredModel.slice("models/".length) : configuredModel;

  if (!/^gemini-[a-z0-9][a-z0-9._-]*$/i.test(model)) {
    throw new GeminiConfigError(GEMINI_MODEL_ERROR);
  }

  return model;
}

function getGeminiApiError(status: number) {
  if (status === 429) return "Gemini API quota or rate limit reached.";
  if (status === 400) return "Gemini API rejected the request. Check GEMINI_MODEL and request configuration.";
  return `Gemini API request failed with status ${status}.`;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type GeminiVisibilityResponse = {
  text: string;
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
  totalTokens: number | null;
  /**
   * Google Search grounding sources returned by Gemini when the
   * `google_search` tool is enabled, per
   * docs/adr/0004-gemini-search-grounding.md. Absent/empty when the model
   * did not ground its answer in a search result.
   */
  groundingChunks?: Array<{ uri: string; title?: string }>;
};

export type GeminiStructuredExtractionResponse = {
  data: ExtractionOutput;
  model: string;
};

export async function generateGeminiVisibilityAnswer(input: {
  prompt: string;
  country: string;
  language: string;
}): Promise<GeminiVisibilityResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiConfigError("Missing GEMINI_API_KEY");

  const model = getGeminiModel();
  const endpoint = `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`;

  // Brand-blind, neutral simulation prompt (docs/adr/0007-neutral-visibility-simulation.md).
  // This call must NOT know which brand/competitors are being measured —
  // mentions are detected afterwards from this neutral answer by
  // extractGeminiStructuredData, which is given the brand/competitors.
  const instruction = [
    "You are a helpful AI assistant answering a real user's question. Answer",
    "naturally and concisely in plain text, as you normally would for an end user.",
    "Recommend specific products, brands, services or providers by name when that",
    "genuinely helps answer the question, exactly as you would for any user. Do",
    "not favour or avoid any particular brand. Do not mention that this is an",
    "analysis."
  ].join("\n");
  const promptBlock = [
    `Question: ${input.prompt}`,
    `Answer for a user in this market/country: ${input.country}`,
    `Respond in this language: ${input.language}`
  ].join("\n");

  const requestBody = JSON.stringify({
    contents: [{ parts: [{ text: promptBlock }] }],
    systemInstruction: { parts: [{ text: instruction }] },
    tools: [{ google_search: {} }],
    // gemini-2.5-flash "thinking" is on by default and, combined with
    // google_search grounding, regularly pushes latency past
    // GEMINI_CALL_TIMEOUT_MS — causing GeminiTimeoutError on most/all
    // prompts in a run (docs/adr/0009-gemini-2.5-flash-model-pin.md).
    // Disabling thinking restores latency comparable to the previously
    // pinned gemini-2.0-flash-001.
    // temperature: 0 — see ADR 0009 addendum (2026-06-19): pins the LLM's own
    // sampling to remove one of two sources of run-to-run score variance.
    // Google Search grounding results can still vary independently.
    generationConfig: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } }
  });

  let response = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requestBody
    },
    GEMINI_CALL_TIMEOUT_MS
  );

  if (response.status === 429) {
    await delay(RATE_LIMIT_RETRY_DELAY_MS);
    response = await fetchWithTimeout(
      endpoint,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody
      },
      GEMINI_CALL_TIMEOUT_MS
    );
  }

  if (!response.ok) {
    throw new Error(getGeminiApiError(response.status));
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      groundingMetadata?: {
        groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
      };
    }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
    modelVersion?: string;
  };

  const text =
    data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n").trim() ??
    "";

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  const groundingChunks = data.candidates?.[0]?.groundingMetadata?.groundingChunks
    ?.map((chunk) => chunk.web)
    .filter((web): web is { uri: string; title?: string } => Boolean(web?.uri))
    .map((web) => ({ uri: web.uri, title: web.title }));

  return {
    text,
    model: data.modelVersion ?? model,
    tokensIn: data.usageMetadata?.promptTokenCount ?? null,
    tokensOut: data.usageMetadata?.candidatesTokenCount ?? null,
    totalTokens: data.usageMetadata?.totalTokenCount ?? null,
    ...(groundingChunks?.length ? { groundingChunks } : {})
  };
}

export async function extractGeminiStructuredData(input: {
  brand: string;
  competitors: string[];
  rawResponseText: string;
  promptText: string;
}): Promise<GeminiStructuredExtractionResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const model = getGeminiModel();
  const endpoint = `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`;

  const schemaInstruction = `Return ONLY valid JSON with this exact shape:
{
  "brand": { "mentioned": boolean, "display_name_found": string|null, "evidence": string[], "position": number|null },
  "competitors": [{ "name": string, "mentioned": boolean, "evidence": string[], "position": number|null }],
  "citations": [{ "url": string|null, "domain": string|null, "label": string|null, "evidence": string|null }],
  "sentiment": "positive"|"neutral"|"negative"|"mixed"|"unknown",
  "summary": string,
  "confidence": "low"|"medium"|"high",
  "notes": string[]
}

For "position": the 1-based rank of the entity's FIRST mention in the response text (1 = mentioned first). Use null if the entity is not mentioned (mentioned: false). Rank only entities that are actually mentioned, with no gaps in the ranking (1, 2, 3, ...), ordered by where each entity first appears in the text. The brand and all competitors share a single ranking.`;

  const promptBlock = [
    schemaInstruction,
    `Brand: ${input.brand}`,
    `Competitors: ${input.competitors.join(", ") || "none"}`,
    `Original prompt: ${input.promptText}`,
    "Raw LLM response to extract from:",
    input.rawResponseText
  ].join("\n\n");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: promptBlock }] }],
      // temperature: 0 — see ADR 0009 addendum (2026-06-19).
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 }
      }
    })
  });

  if (!response.ok) {
    throw new Error(getGeminiApiError(response.status));
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    modelVersion?: string;
  };

  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n").trim() ?? "";
  if (!text) {
    throw new Error("Gemini extraction returned empty JSON.");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text);
  } catch {
    throw new Error("Gemini extraction returned invalid JSON.");
  }

  const parsed = extractionOutputSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new Error("Gemini extraction JSON failed schema validation.");
  }

  return {
    data: parsed.data,
    model: data.modelVersion ?? model
  };
}

async function generateGeminiJson(promptBlock: string): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const model = getGeminiModel();
  const endpoint = `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: promptBlock }] }],
      // temperature: 0 — see ADR 0009 addendum (2026-06-19).
      generationConfig: { temperature: 0, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } }
    })
  });

  if (!response.ok) {
    throw new Error(getGeminiApiError(response.status));
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n").trim() ?? "";
  if (!text) {
    throw new Error("Gemini suggestion returned empty JSON.");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Gemini suggestion returned invalid JSON.");
  }
}

function normalizeDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .trim();
}

export type SuggestedCompetitor = { name: string; domain: string };

const competitorsResponseSchema = z.object({
  competitors: z
    .array(
      z.object({
        name: z.string(),
        domain: z.string()
      })
    )
    .default([])
});

/**
 * Real Gemini-backed suggestion of direct competitors for a brand/domain.
 * Returns deduplicated, schema-safe rows ready to persist in project_competitors.
 * Never throws on partial/garbage items — it filters them out.
 */
export async function suggestCompetitors(input: {
  brand: string;
  domain: string;
  country: string;
  language: string;
  limit?: number;
}): Promise<SuggestedCompetitor[]> {
  const limit = Math.min(Math.max(input.limit ?? 5, 1), 8);
  const promptBlock = [
    "You are a GEO market analyst. Identify the most relevant DIRECT competitors of the given brand.",
    `Return ONLY valid JSON with this exact shape: { "competitors": [{ "name": string, "domain": string }] }.`,
    `List up to ${limit} real, well-known direct competitors in the same category and market.`,
    "Use the competitor's real root domain (no https://, no www., no path). Do not include the brand itself.",
    "",
    `Brand: ${input.brand}`,
    `Brand domain: ${input.domain}`,
    `Market/country: ${input.country}`,
    `Language: ${input.language}`
  ].join("\n");

  const raw = await generateGeminiJson(promptBlock);
  const parsed = competitorsResponseSchema.safeParse(raw);
  if (!parsed.success) return [];

  const ownDomain = normalizeDomain(input.domain);
  const seen = new Set<string>();
  const out: SuggestedCompetitor[] = [];

  for (const item of parsed.data.competitors) {
    const name = item.name.trim();
    const domain = normalizeDomain(item.domain);
    if (!name || name.length > 120) continue;
    if (!domain || domain.length < 3 || domain.length > 255) continue;
    if (!domain.includes(".")) continue;
    if (domain === ownDomain) continue;
    if (seen.has(domain)) continue;
    seen.add(domain);
    out.push({ name, domain });
    if (out.length >= limit) break;
  }

  return out;
}

const promptsResponseSchema = z.object({
  prompts: z
    .array(
      z.object({
        text: z.string(),
        category: z.enum(PROMPT_CATEGORIES)
      })
    )
    .default([])
});

/**
 * Real Gemini-backed suggestion of high-intent prompts a user would ask an AI
 * assistant where the brand could plausibly appear. Returns deduplicated,
 * schema-safe prompts (text 10..300 chars) with a topic category from the
 * fixed taxonomy, ready to persist in project_prompts.
 */
export async function suggestPrompts(input: {
  brand: string;
  domain: string;
  country: string;
  language: string;
  limit?: number;
}): Promise<Array<{ text: string; category: PromptCategory }>> {
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 15);
  const categoryList = PROMPT_CATEGORIES.map((category) => `"${category}"`).join(", ");
  const promptBlock = [
    "You are a GEO research analyst. Generate the most relevant questions real potential customers",
    "would ask an AI assistant (ChatGPT, Gemini, Perplexity) where the given brand could appear in the answer.",
    `Return ONLY valid JSON with this exact shape: { "prompts": [{ "text": string, "category": string }] }.`,
    `Produce exactly ${limit} distinct prompts. Mix informational, commercial and transactional intent.`,
    `Write each "text" in the target language. Each "text" must be a natural question of 10 to 200 characters.`,
    "Do NOT mention the brand name in the prompts; they must be brand-neutral discovery questions.",
    "",
    `For "category", choose EXACTLY one of these fixed Spanish labels (verbatim, do NOT translate or alter them,`,
    `regardless of the target language): ${categoryList}.`,
    "Pick the label that best matches the prompt's dominant intent:",
    `- "Comparación": comparing the brand/product against alternatives or competitors.`,
    `- "Alternativas": looking for alternatives or substitutes.`,
    `- "Cómo hacer / guía": how-to, tutorial, or guidance questions.`,
    `- "Precio y planes": pricing, plans, cost, or value questions.`,
    `- "Reseñas y opiniones": reviews, opinions, ratings, or trustworthiness questions.`,
    `- "Casos de uso": use cases, scenarios, or "best for X" questions.`,
    `Use at least 3 different categories across the full set of prompts; do not put everything in one bucket.`,
    "",
    `Brand: ${input.brand}`,
    `Brand domain: ${input.domain}`,
    `Market/country: ${input.country}`,
    `Target language: ${input.language}`
  ].join("\n");

  const raw = await generateGeminiJson(promptBlock);
  const parsed = promptsResponseSchema.safeParse(raw);
  if (!parsed.success) return [];

  const seen = new Set<string>();
  const out: Array<{ text: string; category: PromptCategory }> = [];

  for (const item of parsed.data.prompts) {
    const text = item.text.trim();
    if (text.length < 10 || text.length > 300) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text, category: item.category });
    if (out.length >= limit) break;
  }

  return out;
}

export type AddPromptsMode = "auto" | "keywords" | "manual";

export type GeneratedPromptCandidate = { text: string; category: string };

const DEFAULT_ADD_PROMPTS_CATEGORY = "General";

const addPromptsGenerationSchema = z.object({
  prompts: z
    .array(
      z.object({
        text: z.string(),
        category: z.string()
      })
    )
    .default([])
});

const addPromptsCategorizationSchema = z.object({
  items: z
    .array(
      z.object({
        index: z.number(),
        category: z.string()
      })
    )
    .default([])
});

/**
 * Real Gemini-backed generation/categorization for the "Añadir prompts" flow
 * (ADD-PROMPTS-BACKEND-1). Unlike `suggestPrompts` (onboarding, fixed
 * PROMPT_CATEGORIES taxonomy), this allows Gemini to invent a new category
 * label when none of the project's existing categories fit — an open
 * taxonomy, since `project_prompts.category` is a free-text column.
 *
 * - "auto": invents `limit` new prompts from brand/market context alone.
 * - "keywords": invents `limit` new prompts seeded by the user's keywords.
 * - "manual": invents no prompt text — only assigns a category to each of
 *   the user's own prompts. The returned `text` is always exactly the
 *   trimmed input text, never rewritten by Gemini.
 *
 * "auto"/"keywords" prompts are deduplicated (case-insensitive) against
 * `existingPromptTexts` so a regenerate never reintroduces a prompt the
 * project already has active. Returns `[]` (never throws) if Gemini's
 * response fails schema validation, matching `suggestPrompts`/
 * `suggestCompetitors`'s fail-soft convention.
 */
export async function generateAddedPrompts(input: {
  mode: AddPromptsMode;
  brand: string;
  domain: string;
  country: string;
  language: string;
  existingPromptTexts: string[];
  existingCategories: string[];
  keywords?: string[];
  manualPrompts?: string[];
  limit?: number;
}): Promise<GeneratedPromptCandidate[]> {
  const categoryHints = input.existingCategories.map((category) => category.trim()).filter(Boolean).join(", ") || "none yet";

  if (input.mode === "manual") {
    const manualPrompts = (input.manualPrompts ?? [])
      .map((text) => text.trim())
      .filter((text) => text.length >= 1 && text.length <= 300);

    if (!manualPrompts.length) return [];

    const numberedList = manualPrompts.map((text, i) => `${i}. ${text}`).join("\n");
    const promptBlock = [
      "You are a GEO research analyst. Assign a short topic category label to each of the following prompts.",
      "Do not rewrite, translate or alter the prompt text in any way — only categorize.",
      `Return ONLY valid JSON with this exact shape: { "items": [{ "index": number, "category": string }] }.`,
      "Return exactly one item per input prompt, using its 0-based index.",
      "",
      `Reuse one of these existing project categories when it genuinely fits: ${categoryHints}.`,
      "Only invent a new short category label (2-4 words, same language as the prompt) when none of the existing ones fit.",
      "",
      `Brand: ${input.brand}`,
      `Brand domain: ${input.domain}`,
      `Market/country: ${input.country}`,
      "",
      "Prompts:",
      numberedList
    ].join("\n");

    const raw = await generateGeminiJson(promptBlock);
    const parsed = addPromptsCategorizationSchema.safeParse(raw);
    const categoryByIndex = new Map<number, string>();
    if (parsed.success) {
      for (const item of parsed.data.items) {
        const category = item.category.trim();
        if (category) categoryByIndex.set(item.index, category);
      }
    }

    return manualPrompts.map((text, i) => ({
      text,
      category: categoryByIndex.get(i) || DEFAULT_ADD_PROMPTS_CATEGORY
    }));
  }

  const limit = Math.min(Math.max(input.limit ?? 5, 1), 10);
  const keywordsLine =
    input.mode === "keywords" && input.keywords?.length
      ? `Seed keywords supplied by the user — every prompt must relate to at least one of them: ${input.keywords.join(", ")}.`
      : null;

  const promptBlock = [
    "You are a GEO research analyst. Generate new, high-intent questions real potential customers",
    "would ask an AI assistant (ChatGPT, Gemini, Perplexity) where the given brand could appear in the answer.",
    `Return ONLY valid JSON with this exact shape: { "prompts": [{ "text": string, "category": string }] }.`,
    `Produce exactly ${limit} distinct new prompts. Mix informational, commercial and transactional intent.`,
    `Write each "text" in the target language. Each "text" must be a natural question of 10 to 200 characters.`,
    "Do NOT mention the brand name in the prompts; they must be brand-neutral discovery questions.",
    "Do NOT repeat or closely paraphrase any of these prompts the project already has:",
    input.existingPromptTexts.length ? input.existingPromptTexts.join(" | ") : "(none yet)",
    ...(keywordsLine ? ["", keywordsLine] : []),
    "",
    `For "category", reuse one of these existing project categories when it genuinely fits: ${categoryHints}.`,
    "Only invent a new short category label (2-4 words, same language as the prompts) when none of the existing ones fit.",
    "",
    `Brand: ${input.brand}`,
    `Brand domain: ${input.domain}`,
    `Market/country: ${input.country}`,
    `Target language: ${input.language}`
  ].join("\n");

  const raw = await generateGeminiJson(promptBlock);
  const parsed = addPromptsGenerationSchema.safeParse(raw);
  if (!parsed.success) return [];

  const seen = new Set(input.existingPromptTexts.map((text) => text.trim().toLowerCase()));
  const out: GeneratedPromptCandidate[] = [];

  for (const item of parsed.data.prompts) {
    const text = item.text.trim();
    if (text.length < 10 || text.length > 300) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const category = item.category.trim() || DEFAULT_ADD_PROMPTS_CATEGORY;
    out.push({ text, category });
    if (out.length >= limit) break;
  }

  return out;
}
