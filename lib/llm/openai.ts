import "server-only";
import { extractionOutputSchema } from "@/lib/extraction/schema";
import { otherBrandsRelevanceHint, type BusinessProfile, type GeminiVisibilityResponse, type GeminiStructuredExtractionResponse } from "@/lib/llm/gemini";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

// Match Gemini's/Claude's per-call budget — one call per prompt in the scan
// executor, dispatched concurrently inside the ~60s Vercel maxDuration
// (docs/adr/0003-sync-scan-execution-and-maxduration.md).
const OPENAI_CALL_TIMEOUT_MS = 20_000;
const RATE_LIMIT_RETRY_DELAY_MS = 1500;

export class OpenAITimeoutError extends Error {
  constructor(message = "OpenAI API request timed out.") {
    super(message);
    this.name = "OpenAITimeoutError";
  }
}

/**
 * Thrown for misconfiguration (missing API key, unset model) — fatal for the
 * whole run, same treatment as GeminiConfigError/ClaudeConfigError.
 *
 * Unlike Gemini/Claude, there is deliberately NO hardcoded default model
 * here. This module was written in July 2026 against public/third-party
 * documentation of the Responses API (developers.openai.com was unreachable
 * from this environment) — guessing a current small-model id risks exactly
 * the pinning gap that caused the gemini-2.0-flash 404
 * (docs/adr/0002-gemini-model-pinning.md). OPENAI_MODEL must be set
 * explicitly and confirmed live before any real usage.
 */
export class OpenAIConfigError extends Error {}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new OpenAITimeoutError();
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function getOpenAIModel(): string {
  const model = process.env.OPENAI_MODEL?.trim();
  if (!model) throw new OpenAIConfigError("Missing OPENAI_MODEL — no default is assumed, see OpenAIConfigError doc.");
  return model;
}

function getOpenAIApiError(status: number): string {
  if (status === 401) return "OpenAI API authentication failed. Check OPENAI_API_KEY.";
  if (status === 429) return "OpenAI API quota or rate limit reached.";
  if (status === 400) return "OpenAI API rejected the request. Check OPENAI_MODEL and request configuration.";
  return `OpenAI API request failed with status ${status}.`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`
  };
}

type ResponsesOutputTextAnnotation = {
  type: string;
  url?: string;
  title?: string;
};

type ResponsesOutputItem = {
  type: string;
  role?: string;
  content?: Array<{ type: string; text?: string; annotations?: ResponsesOutputTextAnnotation[] }>;
};

type ResponsesApiResult = {
  output?: ResponsesOutputItem[];
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
};

function extractMessageText(data: ResponsesApiResult): { text: string; annotations: ResponsesOutputTextAnnotation[] } {
  const messageItems = (data.output ?? []).filter((item) => item.type === "message");
  const texts: string[] = [];
  const annotations: ResponsesOutputTextAnnotation[] = [];

  for (const item of messageItems) {
    for (const block of item.content ?? []) {
      if (block.type !== "output_text") continue;
      if (block.text) texts.push(block.text);
      if (block.annotations?.length) annotations.push(...block.annotations);
    }
  }

  return { text: texts.join("\n").trim(), annotations };
}

/**
 * True for a Google Maps/Search URL that OpenAI's `web_search` tool attaches
 * as a citation when it has no direct business URL to cite — e.g.
 * `https://www.google.com/maps/search/Alberdiderma%2C+Madrid%2C+Espa%C3%B1a?utm_source=openai`
 * — observed live (founder report, 2026-07-31): for local-business queries
 * ("dermatólogo en Madrid"), EVERY result in the answer cited a Maps search
 * link instead of the clinic's own site. This is a "couldn't find a direct
 * page, here's a search shortcut" fallback, not content the model actually
 * read, so it must never count as a real citation — same reasoning already
 * applied to the equivalent noisy inline-citation case (`resolveCitation`,
 * lib/citations/aggregate-citations.ts, founder review 2026-07-19).
 *
 * Deliberately narrower than "any google.com grounding citation is noise":
 * that module has an explicit, tested case where a genuine grounding
 * citation whose real content happens to be hosted on google.com (e.g. a
 * Google Shopping listing) is kept, not filtered. Only the Maps/plain-search
 * URL *shapes* are excluded here, before they ever reach that pipeline.
 */
function isGoogleMapsSearchNoise(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (hostname !== "google.com") return false;
    return url.pathname.startsWith("/maps/search") || url.pathname === "/search";
  } catch {
    return false;
  }
}

/**
 * Generates a brand-neutral visibility answer using OpenAI's Responses API
 * with the `web_search` tool enabled, so results carry real grounding
 * citations (`url_citation` annotations) — unlike Claude's implementation,
 * which has no web search and is always ungrounded. Returns the same
 * GeminiVisibilityResponse shape (including groundingChunks) so the executor
 * and the downstream scoring/extraction pipeline can treat every provider
 * uniformly. Google Maps/Search noise citations (see
 * `isGoogleMapsSearchNoise`) are filtered out before they become
 * groundingChunks at all.
 *
 * `url_citation.url` is (with that one exception) already the real
 * destination page (not a redirect wrapper like Gemini's
 * `vertexaisearch.cloud.google.com` grounding chunks), so callers must NOT
 * run these through `lib/scan/citation-resolution.ts::resolveGroundingRedirects`
 * — that would add an unnecessary live fetch to an arbitrary third-party URL
 * for every citation. This is called out here because wiring this provider
 * into `lib/scan/extraction.ts` (not done yet — this module is not active in
 * the executor's provider list) will need a provider-aware branch for that
 * reason.
 */
export async function generateOpenAIVisibilityAnswer(input: {
  prompt: string;
  country: string;
  language: string;
}): Promise<GeminiVisibilityResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new OpenAIConfigError("Missing OPENAI_API_KEY");

  const model = getOpenAIModel();

  // Brand-blind, neutral simulation prompt (docs/adr/0007-neutral-visibility-simulation.md)
  // — same instruction used for Gemini/Claude, so the three providers measure
  // the same thing.
  const instruction = [
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
    instructions: instruction,
    input: userContent,
    tools: [{ type: "web_search" }],
    // Forced, not "auto": in the first real-world scan (2026-07-18,
    // 10 prompts, gpt-4o-mini) the model chose to answer from memory every
    // single time — zero searches, zero url_citation annotations. An
    // ungrounded-in-practice engine would both lose this provider's whole
    // differentiator vs Claude AND dilute citation_score's denominator,
    // since openai is declared in GROUNDED_PROVIDERS (ADR-0012's structural
    // ceiling, reintroduced by the back door).
    tool_choice: { type: "web_search" },
    temperature: 0
  });

  const headers = buildHeaders(apiKey);

  let response = await fetchWithTimeout(
    OPENAI_RESPONSES_URL,
    { method: "POST", headers, body: requestBody },
    OPENAI_CALL_TIMEOUT_MS
  );

  if (response.status === 429) {
    await delay(RATE_LIMIT_RETRY_DELAY_MS);
    response = await fetchWithTimeout(
      OPENAI_RESPONSES_URL,
      { method: "POST", headers, body: requestBody },
      OPENAI_CALL_TIMEOUT_MS
    );
  }

  if (!response.ok) {
    throw new Error(getOpenAIApiError(response.status));
  }

  const data = (await response.json()) as ResponsesApiResult;
  const { text, annotations } = extractMessageText(data);

  if (!text) {
    throw new Error("OpenAI returned an empty response.");
  }

  const groundingChunks = annotations
    .filter((a): a is ResponsesOutputTextAnnotation & { url: string } => a.type === "url_citation" && Boolean(a.url))
    .filter((a) => !isGoogleMapsSearchNoise(a.url))
    .map((a) => ({ uri: a.url, title: a.title }));

  return {
    text,
    model,
    tokensIn: data.usage?.input_tokens ?? null,
    tokensOut: data.usage?.output_tokens ?? null,
    totalTokens: data.usage?.total_tokens ?? null,
    ...(groundingChunks.length ? { groundingChunks } : {})
  };
}

/**
 * Structured extraction of brand mentions, competitors, sentiment, and
 * citations from an OpenAI visibility answer. Same interface and return type
 * as extractGeminiStructuredData / extractClaudeStructuredData. Uses the
 * Responses API without tools — this is a text-in, JSON-out task, no search
 * needed.
 */
export async function extractOpenAIStructuredData(input: {
  brand: string;
  competitors: string[];
  rawResponseText: string;
  promptText: string;
  profile?: BusinessProfile;
}): Promise<GeminiStructuredExtractionResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new OpenAIConfigError("Missing OPENAI_API_KEY");

  const model = getOpenAIModel();

  const schemaInstruction = `Return ONLY valid JSON with this exact shape — no markdown fences, no prose:
{
  "brand": { "mentioned": boolean, "display_name_found": string|null, "evidence": string[], "position": number|null },
  "competitors": [{ "name": string, "mentioned": boolean, "display_name_found": string|null, "evidence": string[], "position": number|null }],
  "citations": [{ "url": string|null, "domain": string|null, "label": string|null, "evidence": string|null }],
  "sentiment": "positive"|"neutral"|"negative"|"mixed"|"unknown",
  "other_brands_mentioned": string[],
  "summary": string,
  "confidence": "low"|"medium"|"high",
  "notes": string[]
}

For "mentioned" (brand and every competitor): set to true ONLY if that entity's name — or an unambiguous variant of it (abbreviation, different capitalization, with/without a legal suffix) — genuinely appears as text in the response below. NEVER set "mentioned": true because the response is merely about the same topic, product category, or industry as that entity — topical relevance is not a mention. If in doubt, use false.

For "display_name_found": the EXACT substring of the response text you are relying on to justify "mentioned": true — copy it character-for-character from the response, do not paraphrase, translate, or normalize it. Use null when "mentioned" is false.

For "evidence": one or more short EXACT quotes (verbatim substrings of the response text, not paraphrased or summarized) that show the mention in context. Empty array [] when "mentioned" is false.

For "competitors": return EXACTLY one entry per name listed under Competitors below, in that same order — never add, omit, or rename any of them. Include an entry even if that competitor is not mentioned at all (mentioned: false, display_name_found: null, evidence: [], position: null). Never add an entry for any brand that is not in the Competitors list, even if it appears in the response text — put those under "other_brands_mentioned" instead.

For "position": the 1-based rank of the entity's FIRST mention in the response text (1 = mentioned first). Use null if not mentioned. Rank only mentioned entities with no gaps (1, 2, 3...). Brand and competitors share a single ranking.

For "other_brands_mentioned": list the real, actual company or brand names that appear in the response text and are NEITHER "${input.brand}" NOR any of the names listed under Competitors below. Only include names genuinely present in the text — never invent one. Exclude generic terms or product categories.${otherBrandsRelevanceHint(input.profile)} Up to 5 entries, each a short canonical name. Empty array [] if none.`;

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
    input: userContent
  });

  const headers = buildHeaders(apiKey);

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers,
    body: requestBody
  });

  if (!response.ok) {
    throw new Error(getOpenAIApiError(response.status));
  }

  const data = (await response.json()) as ResponsesApiResult;
  const { text } = extractMessageText(data);

  if (!text) {
    throw new Error("OpenAI extraction returned empty response.");
  }

  let parsedJson: unknown;
  try {
    // Strip markdown fences the model may add despite the prompt instruction
    const cleaned = text.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();
    parsedJson = JSON.parse(cleaned);
  } catch {
    throw new Error("OpenAI extraction returned invalid JSON.");
  }

  const parsed = extractionOutputSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new Error("OpenAI extraction JSON failed schema validation.");
  }

  return {
    data: parsed.data,
    model
  };
}
