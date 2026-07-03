import "server-only";
import { extractionOutputSchema } from "@/lib/extraction/schema";
import type { GeminiVisibilityResponse, GeminiStructuredExtractionResponse } from "@/lib/llm/gemini";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";
const DEFAULT_CLAUDE_MODEL = "claude-haiku-4-5-20251001";

// Match Gemini's per-call budget. With MAX_REAL_SCAN_PROMPTS=6 concurrent
// calls inside the ~60s Vercel maxDuration, a single stuck Claude call must
// not consume the whole run budget — same reasoning as GEMINI_CALL_TIMEOUT_MS
// in gemini.ts.
const CLAUDE_CALL_TIMEOUT_MS = 20_000;
const RATE_LIMIT_RETRY_DELAY_MS = 1500;

export class ClaudeTimeoutError extends Error {
  constructor(message = "Claude API request timed out.") {
    super(message);
    this.name = "ClaudeTimeoutError";
  }
}

export class ClaudeConfigError extends Error {}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ClaudeTimeoutError();
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function getClaudeModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_CLAUDE_MODEL;
}

function getClaudeApiError(status: number): string {
  if (status === 401) return "Claude API authentication failed. Check ANTHROPIC_API_KEY.";
  if (status === 429) return "Claude API quota or rate limit reached.";
  if (status === 400) return "Claude API rejected the request. Check ANTHROPIC_MODEL and request configuration.";
  return `Claude API request failed with status ${status}.`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_API_VERSION
  };
}

type AnthropicResponse = {
  id: string;
  type: "message";
  role: "assistant";
  content: Array<{ type: "text"; text: string }>;
  model: string;
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
};

function extractText(data: AnthropicResponse): string {
  return data.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

/**
 * Generates a brand-neutral visibility answer using Claude Haiku. Returns the
 * same GeminiVisibilityResponse shape so the executor can use either provider
 * interchangeably without type divergence.
 *
 * Web search / grounding is not enabled: groundingChunks will always be absent,
 * meaning citation_found / citations_count remain 0 for Claude-backed scans.
 * This is honest — no fake citations.
 */
export async function generateClaudeVisibilityAnswer(input: {
  prompt: string;
  country: string;
  language: string;
}): Promise<GeminiVisibilityResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new ClaudeConfigError("Missing ANTHROPIC_API_KEY");

  const model = getClaudeModel();

  const system = [
    "You are a helpful AI assistant answering a real user's question. Answer",
    "naturally and concisely in plain text, as you normally would for an end user.",
    "Recommend specific products, brands, services or providers by name when that",
    "genuinely helps answer the question, exactly as you would for any user. Do",
    "not favour or avoid any particular brand. Do not mention that this is an",
    "analysis."
  ].join("\n");

  const userContent = [
    `Question: ${input.prompt}`,
    `Answer for a user in this market/country: ${input.country}`,
    `Respond in this language: ${input.language}`
  ].join("\n");

  const requestBody = JSON.stringify({
    model,
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: userContent }]
  });

  const headers = buildHeaders(apiKey);

  let response = await fetchWithTimeout(
    ANTHROPIC_API_URL,
    { method: "POST", headers, body: requestBody },
    CLAUDE_CALL_TIMEOUT_MS
  );

  if (response.status === 429) {
    await delay(RATE_LIMIT_RETRY_DELAY_MS);
    response = await fetchWithTimeout(
      ANTHROPIC_API_URL,
      { method: "POST", headers, body: requestBody },
      CLAUDE_CALL_TIMEOUT_MS
    );
  }

  if (!response.ok) {
    throw new Error(getClaudeApiError(response.status));
  }

  const data = (await response.json()) as AnthropicResponse;
  const text = extractText(data);

  if (!text) {
    throw new Error("Claude returned an empty response.");
  }

  return {
    text,
    model: data.model,
    tokensIn: data.usage.input_tokens,
    tokensOut: data.usage.output_tokens,
    totalTokens: data.usage.input_tokens + data.usage.output_tokens
    // groundingChunks intentionally absent — no web search grounding in this implementation
  };
}

/**
 * Structured extraction of brand mentions, competitors, sentiment, and
 * citations from a Claude visibility answer. Same interface and return type
 * as extractGeminiStructuredData.
 */
export async function extractClaudeStructuredData(input: {
  brand: string;
  competitors: string[];
  rawResponseText: string;
  promptText: string;
}): Promise<GeminiStructuredExtractionResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new ClaudeConfigError("Missing ANTHROPIC_API_KEY");

  const model = getClaudeModel();

  const schemaInstruction = `Return ONLY valid JSON with this exact shape — no markdown fences, no prose:
{
  "brand": { "mentioned": boolean, "display_name_found": string|null, "evidence": string[], "position": number|null },
  "competitors": [{ "name": string, "mentioned": boolean, "evidence": string[], "position": number|null }],
  "citations": [{ "url": string|null, "domain": string|null, "label": string|null, "evidence": string|null }],
  "sentiment": "positive"|"neutral"|"negative"|"mixed"|"unknown",
  "other_brands_mentioned": string[],
  "summary": string,
  "confidence": "low"|"medium"|"high",
  "notes": string[]
}

For "position": the 1-based rank of the entity's FIRST mention in the response text (1 = mentioned first). Use null if not mentioned. Rank only mentioned entities with no gaps (1, 2, 3...). Brand and competitors share a single ranking.

For "other_brands_mentioned": list the real, actual company or brand names that appear in the response text and are NEITHER "${input.brand}" NOR any of the names listed under Competitors below. Only include names genuinely present in the text — never invent one. Exclude generic terms or product categories. Up to 5 entries, each a short canonical name. Empty array [] if none.`;

  const userContent = [
    schemaInstruction,
    `Brand: ${input.brand}`,
    `Competitors: ${input.competitors.join(", ") || "none"}`,
    `Original prompt: ${input.promptText}`,
    "Raw LLM response to extract from:",
    input.rawResponseText
  ].join("\n\n");

  const requestBody = JSON.stringify({
    model,
    max_tokens: 2048,
    messages: [{ role: "user", content: userContent }]
  });

  const headers = buildHeaders(apiKey);

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers,
    body: requestBody
  });

  if (!response.ok) {
    throw new Error(getClaudeApiError(response.status));
  }

  const data = (await response.json()) as AnthropicResponse;
  const text = extractText(data);

  if (!text) {
    throw new Error("Claude extraction returned empty response.");
  }

  let parsedJson: unknown;
  try {
    // Strip markdown fences that Claude may add despite the prompt instruction
    const cleaned = text.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();
    parsedJson = JSON.parse(cleaned);
  } catch {
    throw new Error("Claude extraction returned invalid JSON.");
  }

  const parsed = extractionOutputSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new Error("Claude extraction JSON failed schema validation.");
  }

  return {
    data: parsed.data,
    model: data.model
  };
}
