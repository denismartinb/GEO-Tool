import "server-only";
import { z } from "zod";
import { extractionOutputSchema, type ExtractionOutput } from "@/lib/extraction/schema";
import { PROMPT_CATEGORIES, type PromptCategory } from "@/lib/projects/prompt-categories";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_MODEL_ERROR = "Invalid GEMINI_MODEL. Use a valid Gemini model id such as gemini-2.0-flash.";

function getGeminiModel() {
  const configuredValue = process.env.GEMINI_MODEL;
  const configuredModel = configuredValue === undefined ? DEFAULT_GEMINI_MODEL : configuredValue.trim();
  const model = configuredModel.startsWith("models/") ? configuredModel.slice("models/".length) : configuredModel;

  if (!/^gemini-[a-z0-9][a-z0-9._-]*$/i.test(model)) {
    throw new Error(GEMINI_MODEL_ERROR);
  }

  return model;
}

function getGeminiApiError(status: number) {
  if (status === 429) return "Gemini API quota or rate limit reached.";
  if (status === 400) return "Gemini API rejected the request. Check GEMINI_MODEL and request configuration.";
  return `Gemini API request failed with status ${status}.`;
}

export type GeminiVisibilityResponse = {
  text: string;
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
  totalTokens: number | null;
};

export type GeminiStructuredExtractionResponse = {
  data: ExtractionOutput;
  model: string;
};

export async function generateGeminiVisibilityAnswer(input: {
  prompt: string;
  brand: string;
  competitors: string[];
  country: string;
  language: string;
}): Promise<GeminiVisibilityResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const model = getGeminiModel();
  const endpoint = `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`;

  const instruction =
    "You are a GEO visibility analyst. Answer naturally in plain text. Mention the brand and relevant competitors when useful.";
  const promptBlock = [
    `Prompt: ${input.prompt}`,
    `Brand: ${input.brand}`,
    `Competitors: ${input.competitors.join(", ") || "none"}`,
    `Country: ${input.country}`,
    `Language: ${input.language}`
  ].join("\n");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: promptBlock }] }],
      systemInstruction: { parts: [{ text: instruction }] }
    })
  });

  if (!response.ok) {
    throw new Error(getGeminiApiError(response.status));
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
    modelVersion?: string;
  };

  const text =
    data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n").trim() ??
    "";

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return {
    text,
    model: data.modelVersion ?? model,
    tokensIn: data.usageMetadata?.promptTokenCount ?? null,
    tokensOut: data.usageMetadata?.candidatesTokenCount ?? null,
    totalTokens: data.usageMetadata?.totalTokenCount ?? null
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
  "brand": { "mentioned": boolean, "display_name_found": string|null, "evidence": string[] },
  "competitors": [{ "name": string, "mentioned": boolean, "evidence": string[] }],
  "citations": [{ "url": string|null, "domain": string|null, "label": string|null, "evidence": string|null }],
  "sentiment": "positive"|"neutral"|"negative"|"mixed"|"unknown",
  "summary": string,
  "confidence": "low"|"medium"|"high",
  "notes": string[]
}`;

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
      generationConfig: {
        responseMimeType: "application/json"
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
      generationConfig: { responseMimeType: "application/json" }
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
