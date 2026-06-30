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
 * Hard per-call timeout shared by every direct Gemini `fetch` in this file:
 * `generateGeminiVisibilityAnswer` (one call per prompt in the scan executor,
 * `lib/scan/executor.ts`, dispatched concurrently inside the ~60s Vercel
 * `maxDuration` per docs/adr/0003-sync-scan-execution-and-maxduration.md) and
 * `generateGeminiJson` (the on-demand helper behind add-prompts generation,
 * competitor suggestions and the recommendation rewrite action). None of the
 * on-demand callers' routes set an explicit `maxDuration`, so without this
 * AbortController-based bound a stalled Gemini response hangs the calling
 * server action forever instead of surfacing as an error — exactly the "Mejorar
 * redaccion con IA" button getting stuck with no feedback.
 *
 * 20s ceiling: generous enough that normal Gemini latency (typically a few
 * seconds) never hits it, while bounding how long a single stuck call can
 * block progress. For the scan executor specifically, the 60s budget is a
 * *typical-case* target, not a guarantee: a pathological run where every
 * prompt times out (and retries once, see PROMPT_RETRY_MAX_TOTAL_ATTEMPTS) can
 * still exceed 60s. That worst case is bounded instead by
 * `SCAN_RUNNING_TIMEOUT_SECONDS` + reconciliation's auto-retry
 * (docs/scan-lifecycle.md), not by this per-call timeout alone. A timeout here
 * surfaces as `GeminiTimeoutError`, which every caller treats as a normal
 * recoverable failure (never a crash, never a fake success).
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
  "sentiment_drivers": string[],
  "summary": string,
  "confidence": "low"|"medium"|"high",
  "notes": string[]
}

For "position": the 1-based rank of the entity's FIRST mention in the response text (1 = mentioned first). Use null if the entity is not mentioned (mentioned: false). Rank only entities that are actually mentioned, with no gaps in the ranking (1, 2, 3, ...), ordered by where each entity first appears in the text. The brand and all competitors share a single ranking.

For "sentiment_drivers": ONLY when "sentiment" is "negative" or "mixed", list up to 3 short noun-phrase themes (2-4 words each) that are visible in or evidenced by the response as reasons for the negative perception OF THE BRAND (e.g. "atención al cliente", "plazos de entrega", "precios altos", "equipaje de mano"). Include themes that are clearly implied by the response text, not just ones listed explicitly — for example, if the response says "passengers often report problems with checked baggage fees", extract "checked baggage fees" even though it wasn't presented as a bullet point. Do NOT invent a criticism that has no basis in the response text. Empty array [] for positive/neutral sentiment or when the response gives no indication of any specific negative theme about the brand.`;

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

  const response = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptBlock }] }],
        // temperature: 0 — see ADR 0009 addendum (2026-06-19).
        generationConfig: { temperature: 0, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } }
      })
    },
    GEMINI_CALL_TIMEOUT_MS
  );

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

export type RecommendationRewriteInput = {
  brand: string;
  domain: string;
  language: string;
  recommendationType: string;
  ruleTitle: string;
  ruleDescription: string;
  whyThisMatters: string;
  affectedPrompts: string[];
  mentionedCompetitors: string[];
  citationDomains: string[];
  dominantCompetitor?: string;
  evidenceSnippets: string[];
};

export type RecommendationRewrite = {
  title: string;
  summary: string;
  steps: string[];
  examples: { label: string; content: string }[];
};

const recommendationRewriteSchema = z.object({
  title: z.string(),
  summary: z.string(),
  steps: z.array(z.string()).default([]),
  // Back-compat: accept either the new `examples` array or a legacy single
  // `example` object, so an older-style model response still parses.
  examples: z.array(z.object({ label: z.string(), content: z.string() })).optional(),
  example: z.object({ label: z.string(), content: z.string() }).nullable().optional()
});

const MAX_GENERATED_EXAMPLES = 3;

/**
 * Turns a rule-based recommendation into a structured, copy-paste-ready action
 * plan — using ONLY the facts passed in (the recommendation engine owns "what
 * gap + what evidence"; the caller in lib/recommendations/rewrite-recommendation.ts
 * anchors that evidence and re-validates + sanitizes the result before
 * persisting). This function only builds the prompt and parses Gemini's JSON.
 *
 * Output shape: a specific `title`, a 1-2 sentence `summary`, 3-6 concrete
 * `steps`, and an optional ready-to-paste `example` artifact (e.g. a citable
 * paragraph or FAQ block) the user can drop onto their site. Real examples must
 * stay anchored to the given facts — a placeholder like "[tu dato aquí]" is
 * required where a specific value isn't in the evidence, never an invented one.
 *
 * Fail-soft on schema-invalid output (returns null), matching this file's
 * suggestCompetitors/generateAddedPrompts convention. A network/API failure
 * still throws, also matching that convention — the caller is expected to
 * catch it and fall back safely (no fake success, no raw error surfaced).
 */
/**
 * Type-specific asset guidance (Fase C1). The base prompt produces a generic
 * action plan; this steers the steps and example artifacts toward the
 * deliverable that actually fits each gap type — a comparison page for a
 * competitor gap, a FAQ for an informational gap, an Organization schema for an
 * entity-clarity gap, etc. Returns null for unknown types (generic plan). All
 * anti-fabrication rules in the base prompt still apply.
 */
function assetPlaybook(input: RecommendationRewriteInput): string | null {
  const competitor = input.dominantCompetitor ?? input.mentionedCompetitors[0] ?? "el competidor";
  switch (input.recommendationType) {
    case "close_competitor_gap":
      return `ASSET FOCUS — comparison page: build the plan around a "${input.brand} vs ${competitor}" or "alternativa a ${competitor}" page. Provide as examples a page outline (H1 + H2/H3 sections) and a short comparison table (rows = criteria; columns = ${input.brand} and ${competitor} only), using only the given facts and [tu dato aquí] placeholders.`;
    case "add_comparison_content":
      return `ASSET FOCUS — comparison: provide as examples a concise comparison table (rows = criteria; one column for ${input.brand} and one per named competitor only) and a FAQPage JSON-LD snippet answering the comparative query.`;
    case "create_faq_section":
      return "ASSET FOCUS — FAQ: provide as examples 2-4 concise question/answer pairs matching the affected prompts, plus a FAQPage JSON-LD snippet wrapping them.";
    case "strengthen_brand_entity_clarity":
      return `ASSET FOCUS — entity clarity: provide as examples an Organization JSON-LD snippet (name "${input.brand}", url the brand domain, a short description, its category) and a brief "Acerca de" page outline stating the brand's category and key descriptors.`;
    case "add_citation_block":
      return "ASSET FOCUS — citable block: provide as examples a factual, directly-extractable paragraph answering the affected query, and an Article or FAQPage JSON-LD snippet.";
    case "address_negative_narrative":
      return "ASSET FOCUS — counter-narrative: AI answers carry a recurring negative perception of the brand around the theme in the facts below. Provide as examples (1) a content brief to counter it — target page, angle, and the factual points/proof to publish (use only given facts; [tu dato aquí] for any specific metric), and (2) a short, citable factual paragraph that directly addresses that theme. Stay factual and respectful: correct with evidence, never deny, attack, or invent figures.";
    case "pursue_citation_sources":
      return "ASSET FOCUS — digital PR / get cited by your sources: the domains below are sources the AI already trusts in this space that do not mention the brand. Do NOT assume they are all press to email — infer each one's likely type from the domain and give the RIGHT play: publication/blog/listicle/media -> pitch a contribution or request inclusion; marketplace/comparator/directory -> get listed or claim a profile; community/forum (e.g. reddit, quora) -> participate helpfully, never a cold email; an apparent company/provider or a competitor of the brand, or a clearly out-of-market site (a country TLD that does not match the brand's market) -> mark it 'no es un objetivo de outreach' and exclude it from the plan. Examples to provide: (1) a prioritized list of ONLY the relevant sources, each tagged with its type and its specific play; (2) ONE adaptable outreach template ONLY for the sources where outreach actually applies (publications) — placeholders for names/links, never invent metrics. Use ONLY the domains given.";
    case "increase_brand_visibility":
      return "ASSET FOCUS — content brief: provide as examples a content brief (target query, search intent, H1 + H2 outline, key entities) and a concise citable intro paragraph for the page.";
    default:
      return null;
  }
}

export async function rewriteRecommendation(input: RecommendationRewriteInput): Promise<RecommendationRewrite | null> {
  const playbook = assetPlaybook(input);
  const promptBlock = [
    "You are a senior GEO (Generative Engine Optimization) consultant writing one concrete, copy-paste-ready action plan on a brand's dashboard.",
    "Turn the generic recommendation below into a specific, complete plan this exact brand can act on immediately.",
    "You MUST use ONLY the facts listed below. Do NOT invent any fact, statistic, competitor name, domain, page or detail not explicitly given.",
    "Where a specific value (a number, a price, a date) would be needed but is not in the facts, write a clearly-marked placeholder like [tu dato aquí]. NEVER invent the value.",
    "Do NOT mention any competitor name other than the ones explicitly listed under 'Competitors you may mention'.",
    "Do NOT mention any domain or URL other than the ones explicitly listed under 'Domains you may mention'.",
    "If no competitors or domains are listed below, do not invent or imply any.",
    `Write entirely in this language: ${input.language}.`,
    'Return ONLY valid JSON with this exact shape: { "title": string, "summary": string, "steps": string[], "examples": { "label": string, "content": string }[] }.',
    '"title": a single concise, specific sentence, max 140 characters, no surrounding quotes.',
    '"summary": 1-2 sentences, max 400 characters, why this matters for this brand given the facts.',
    '"steps": 3 to 6 concrete, specific actions (each max 200 characters) the brand should take, grounded in the real prompts/competitors below.',
    "IMPORTANT: the brand may ALREADY have this information on its site but in a form AI engines cannot read. So the steps MUST cover not just creating content but making it machine-readable: at least one step on HOW to expose/structure it for AI — clear semantic HTML and descriptive headings, structured data (JSON-LD schema such as FAQPage/Article/Organization) where relevant, content crawlable as real text (not hidden behind scripts, images or logins), and concise directly-extractable answers. Phrase it as 'if you already have this, expose it like this; if not, create it like this'.",
    '"examples": 1 to 3 ready-to-paste TEMPLATE artifacts the user adapts before publishing — one per distinct deliverable the steps call for (e.g. a citable factual paragraph, a short FAQ, a JSON-LD schema snippet). Each is an example to review and fill in, never a verified fact. Each item: "label" names it (max 80 chars); "content" is the pasteable text (max 1200 chars). Return [] only if no useful artifact can be grounded in the facts.',
    "In any example (especially JSON-LD), the ONLY URLs/domains you may use are the brand domain above and schema.org (for @context). For any other URL — social profiles, third-party pages — use a placeholder like https://[tu-dominio]/pagina; NEVER write a real third-party or competitor domain.",
    ...(playbook ? ["", playbook] : []),
    "",
    `Brand: ${input.brand}`,
    `Brand domain: ${input.domain}`,
    `Recommendation type: ${input.recommendationType}`,
    "",
    "Generic title to improve:",
    input.ruleTitle,
    "Generic description to improve:",
    input.ruleDescription,
    "",
    "Why this matters (real reasoning from the scan):",
    input.whyThisMatters || "(none given)",
    ...(input.dominantCompetitor ? ["", `Dominant competitor in this specific gap: ${input.dominantCompetitor}`] : []),
    "",
    "Real prompts (from this project's actual last scan) affected by this gap:",
    input.affectedPrompts.length ? input.affectedPrompts.map((p) => `- ${p}`).join("\n") : "(none given)",
    "",
    "Real evidence snippets extracted from actual AI answers:",
    input.evidenceSnippets.length ? input.evidenceSnippets.map((s) => `- ${s}`).join("\n") : "(none given)",
    "",
    "Competitors you may mention (do not mention any other competitor):",
    input.mentionedCompetitors.length ? input.mentionedCompetitors.join(", ") : "(none — do not name any competitor)",
    "",
    "Domains you may mention (do not mention any other domain):",
    input.citationDomains.length ? input.citationDomains.join(", ") : "(none — do not name any domain)"
  ].join("\n");

  const raw = await generateGeminiJson(promptBlock);
  const parsed = recommendationRewriteSchema.safeParse(raw);
  if (!parsed.success) return null;

  const title = parsed.data.title.trim();
  const summary = parsed.data.summary.trim();
  if (!title || !summary) return null;
  if (title.length > 200 || summary.length > 600) return null;

  const steps = parsed.data.steps.map((step) => step.trim()).filter((step) => step.length > 0 && step.length <= 400);

  const rawExamples = parsed.data.examples ?? (parsed.data.example ? [parsed.data.example] : []);
  const examples = rawExamples
    .map((item) => ({ label: item.label.trim(), content: item.content.trim() }))
    .filter((item) => item.label.length > 0 && item.content.length > 0 && item.content.length <= 2000)
    .slice(0, MAX_GENERATED_EXAMPLES);

  return { title, summary, steps, examples };
}
