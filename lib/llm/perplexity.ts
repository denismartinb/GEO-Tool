import "server-only";
import type { GeminiVisibilityResponse } from "@/lib/llm/contracts";
import { delay, fetchWithTimeout } from "@/lib/llm/http";

/**
 * PERPLEXITY-ENGINE-1 Fase 1 — Perplexity as a fourth answer engine, for the
 * operator's tools only (model comparison and sector studies). Nothing in the
 * scan calls this module yet: `LLMScanProvider` does not list "perplexity",
 * so no customer project can reach it (log §274).
 *
 * Why the Agent API (`/v1/agent`) and not Sonar's `/chat/completions`:
 * Perplexity announced Sonar Chat Completions supported until 27 September
 * 2026 and points to the Agent API as its replacement. The Agent API serves
 * many vendors' models; `perplexity/sonar` is Perplexity's own one, the
 * closest thing to what a perplexity.ai user reads, so it is the default.
 *
 * There is deliberately no Perplexity extractor. Turning an answer into
 * structured data is not what this engine is measured on, and the scan's
 * routing (`resolveExtractionRoute`) already sends an unknown provider's
 * rows to Gemini, or to the single cheap extractor once that is switched on.
 */

const PERPLEXITY_AGENT_URL = "https://api.perplexity.ai/v1/agent";
export const PERPLEXITY_DEFAULT_MODEL = "perplexity/sonar";

// Same per-call budget as the other engines (docs/adr/0003).
const PERPLEXITY_CALL_TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 1500;
/** The quickstart asks direct-model requests to allow at least 3 steps (search, read, answer). */
const MAX_STEPS = 3;
const MAX_OUTPUT_TOKENS = 2048;

export class PerplexityTimeoutError extends Error {
  constructor(message = "Perplexity API request timed out.") {
    super(message);
    this.name = "PerplexityTimeoutError";
  }
}

/** Missing key — fatal for the whole run, same treatment as the other engines' config errors. */
export class PerplexityConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PerplexityConfigError";
  }
}

function getPerplexityApiError(status: number): string {
  if (status === 401) return "Perplexity API authentication failed. Check PERPLEXITY_API_KEY.";
  if (status === 402) return "Perplexity API credit exhausted.";
  if (status === 429) return "Perplexity API quota or rate limit reached.";
  if (status === 400) return "Perplexity API rejected the request. Check PERPLEXITY_MODEL and request configuration.";
  return `Perplexity API request failed with status ${status}.`;
}

type AgentSearchResult = { id?: number; url?: string; title?: string };

type AgentOutputItem = {
  type: string;
  results?: AgentSearchResult[];
  content?: Array<{ type: string; text?: string }>;
};

type AgentApiResult = {
  model?: string;
  output?: AgentOutputItem[];
  output_text?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    tool_calls_details?: { search_web?: { invocation?: number } };
  };
};

/** Inline citation markers: `[1]`, `[web:1]`, `[web:1][web:3]`, `[1, 3]`. */
const CITATION_MARKER = /\[(?:web:)?\d+(?:\s*,\s*(?:web:)?\d+)*\]/g;

function citedIds(text: string): Set<number> {
  const ids = new Set<number>();
  for (const marker of text.match(CITATION_MARKER) ?? []) {
    for (const digits of marker.match(/\d+/g) ?? []) ids.add(Number(digits));
  }
  return ids;
}

/**
 * The answer as a reader sees it. Markers are what the app turns into source
 * chips; left in, they would end up in the quotes the report and the
 * extraction take verbatim from the text.
 */
export function stripCitationMarkers(text: string): string {
  return text
    .replace(CITATION_MARKER, "")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function answerText(data: AgentApiResult): string {
  const parts: string[] = [];
  for (const item of data.output ?? []) {
    if (item.type !== "message") continue;
    for (const block of item.content ?? []) {
      if (block.type === "output_text" && block.text) parts.push(block.text);
    }
  }
  const joined = parts.join("\n").trim();
  return joined || (data.output_text ?? "").trim();
}

/**
 * Sources the answer actually used. When the text carries markers, only the
 * results it cites count, which is what a perplexity.ai reader sees under the
 * answer. With no markers there is nothing to tell them apart, so every
 * retrieved result counts, the same way Gemini's grounding chunks do.
 */
export function selectCitedSources(text: string, results: AgentSearchResult[]): Array<{ uri: string; title?: string }> {
  const withUrl = results.filter((result): result is AgentSearchResult & { url: string } => Boolean(result.url));
  const ids = citedIds(text);
  const cited = ids.size ? withUrl.filter((result) => typeof result.id === "number" && ids.has(result.id)) : withUrl;
  const seen = new Set<string>();
  const sources: Array<{ uri: string; title?: string }> = [];
  for (const result of cited) {
    if (seen.has(result.url)) continue;
    seen.add(result.url);
    sources.push(result.title ? { uri: result.url, title: result.title } : { uri: result.url });
  }
  return sources;
}

/** `user_location.country` takes an ISO 3166-1 alpha-2 code; anything else is left out rather than guessed. */
function isoCountry(country: string): string | null {
  const code = country.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

async function postWithRetry(apiKey: string, body: string): Promise<Response> {
  const init = {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body
  };
  const call = () =>
    fetchWithTimeout(PERPLEXITY_AGENT_URL, init, PERPLEXITY_CALL_TIMEOUT_MS, () => new PerplexityTimeoutError());

  const first = await call();
  if (first.status !== 429 && first.status < 500) return first;
  await delay(RETRY_DELAY_MS);
  return call();
}

/**
 * Generates a brand-neutral visibility answer with Perplexity's web search.
 * Same instruction as the other three engines (docs/adr/0007), same return
 * shape, so the comparison and the study read it like any other engine. URLs
 * in `search_results` are final pages, not redirect wrappers, so they must
 * not go through `resolveGroundingRedirects`.
 */
export async function generatePerplexityVisibilityAnswer(input: {
  prompt: string;
  country: string;
  language: string;
  /** Overrides `PERPLEXITY_MODEL` for this call only (MODEL-COMPARE-1). */
  model?: string;
}): Promise<GeminiVisibilityResponse> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new PerplexityConfigError("Missing PERPLEXITY_API_KEY");

  const model = input.model || process.env.PERPLEXITY_MODEL?.trim() || PERPLEXITY_DEFAULT_MODEL;

  const instructions = [
    "You are a helpful AI assistant answering a real user's question. Answer",
    "naturally and concisely in plain text, as you normally would for an end user.",
    "Recommend specific products, brands, services or providers by name when that",
    "genuinely helps answer the question, exactly as you would for any user. Do",
    "not favour or avoid any particular brand. Do not mention that this is an",
    "analysis. Search the web before answering."
  ].join("\n");

  const userContent = [
    `Question: ${input.prompt}`,
    `Answer for a user in this market/country: ${input.country}`,
    `Respond in this language: ${input.language}`
  ].join("\n");

  const country = isoCountry(input.country);
  const body = JSON.stringify({
    model,
    instructions,
    input: userContent,
    tools: [{ type: "web_search", search_type: "web", ...(country ? { user_location: { country } } : {}) }],
    max_steps: MAX_STEPS,
    max_output_tokens: MAX_OUTPUT_TOKENS
  });

  const response = await postWithRetry(apiKey, body);
  if (!response.ok) throw new Error(getPerplexityApiError(response.status));

  const data = (await response.json()) as AgentApiResult;
  const rawText = answerText(data);
  if (!rawText) throw new Error("Perplexity returned an empty response.");

  const results = (data.output ?? []).filter((item) => item.type === "search_results").flatMap((item) => item.results ?? []);
  const groundingChunks = selectCitedSources(rawText, results);
  const searchItems = (data.output ?? []).filter((item) => item.type === "search_results").length;

  return {
    text: stripCitationMarkers(rawText),
    model: data.model || model,
    tokensIn: data.usage?.input_tokens ?? null,
    tokensOut: data.usage?.output_tokens ?? null,
    totalTokens: data.usage?.total_tokens ?? null,
    ...(groundingChunks.length ? { groundingChunks } : {}),
    searchQueries: data.usage?.tool_calls_details?.search_web?.invocation ?? searchItems
  };
}
