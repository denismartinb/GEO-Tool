import "server-only";
import { extractionOutputSchema } from "@/lib/extraction/schema";
import { ExtractionError } from "@/lib/llm/extraction-errors";
import { fetchExtractionWithRetry } from "@/lib/llm/extraction-fetch";
import { delay, fetchWithTimeout } from "@/lib/llm/http";
import {
  otherBrandsRelevanceHint,
  type BusinessProfile,
  type GeminiStructuredExtractionResponse,
  type GeminiVisibilityResponse,
  type HomepageEvidenceInput
} from "@/lib/llm/contracts";
import {
  GEMINI_API_URL,
  GeminiConfigError,
  GeminiTimeoutError,
  getGeminiApiError,
  getGeminiModel,
  GEMINI_CALL_TIMEOUT_MS
} from "@/lib/llm/gemini-client";
import {
  EXTRACTION_CALL_TIMEOUT_MS,
  EXTRACTION_MAX_ATTEMPTS,
  EXTRACTION_RETRY_BASE_DELAY_MS,
  EXTRACTION_RETRY_MAX_DELAY_MS
} from "@/lib/scan/constants";
import {
  auditDomainContent,
  type DomainAuditInput,
  type DomainAuditRawResponse
} from "@/lib/web-audit/audit-domain-content";
import { inferBrandAliases, inferBusinessProfile } from "@/lib/projects/infer-business-profile";
import { suggestCompetitors, type SuggestedCompetitor } from "@/lib/competitors/competitor-suggestions-llm";
import {
  generateAddedPrompts,
  suggestPrompts,
  type AddPromptsMode,
  type GeneratedPromptCandidate
} from "@/lib/projects/prompt-suggestions-llm";
import {
  rewriteRecommendation,
  type RecommendationRewrite,
  type RecommendationRewriteInput
} from "@/lib/recommendations/recommendation-rewrite-llm";

// Fase R5: el transporte se fue a `gemini-client.ts`, pero estas dos clases
// eran exports publicos de ESTE modulo. Se reexportan para que el slice no
// cambie ni un solo sitio de llamada; migrar los imports es trabajo del
// siguiente, cuando las nueve funciones de producto salgan de aqui.
export { GeminiConfigError, GeminiTimeoutError };

// Fase R5 (2/2): los tipos que comparten los tres motores viven ahora en
// `lib/llm/contracts.ts`. Se reexportan por la misma razón que las dos clases
// de arriba: ningún sitio de llamada tiene por qué enterarse de que el fichero
// se ha partido, y `gemini.test.ts` importa `otherBrandsRelevanceHint` de aquí.
export { otherBrandsRelevanceHint };
export type {
  BusinessProfile,
  GeminiStructuredExtractionResponse,
  GeminiVisibilityResponse,
  HomepageEvidenceInput
};

// Fase R5 (2/2): las funcionalidades de producto se han ido a sus módulos
// dueños. `gemini.ts` las reexporta y esto NO es provisional: seis ficheros de
// test hacen `vi.mock("@/lib/llm/gemini", …)`, así que esta ruta de import es
// la costura por la que el suite entero sustituye el proveedor. Cambiar los
// sitios de llamada obligaría a reescribir esos mocks, y la regla de la fase es
// que si un slice necesita cambiar un test, es que no era un refactor. Quitar
// la costura es una decisión de estrategia de tests, no un efecto colateral de
// mover código de sitio (log §80).
export { auditDomainContent };
export type { DomainAuditInput, DomainAuditRawResponse };
export { inferBrandAliases, inferBusinessProfile };
export { suggestCompetitors };
export type { SuggestedCompetitor };
export { generateAddedPrompts, suggestPrompts };
export type { AddPromptsMode, GeneratedPromptCandidate };
export { rewriteRecommendation };
export type { RecommendationRewrite, RecommendationRewriteInput };

// La espera fija del ÚNICO reintento de la generación por prompt del escaneo.
// No sube al cliente: el resto de llamadas usa el backoff exponencial con
// jitter de `fetchGeminiWithRetry`, y esta ruta conserva su reintento simple
// a propósito (LLM-RESILIENCE-1 no la tocó).
const RATE_LIMIT_RETRY_DELAY_MS = 1500;


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
    GEMINI_CALL_TIMEOUT_MS,
    () => new GeminiTimeoutError()
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
      GEMINI_CALL_TIMEOUT_MS,
    () => new GeminiTimeoutError()
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
  profile?: BusinessProfile;
  /** Absolute epoch-ms budget for the whole extraction pass (EXTRACTION-RELIABILITY-1) — no attempt or backoff starts past it. */
  deadlineAt?: number;
}): Promise<GeminiStructuredExtractionResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  // Categorized rather than a bare Error: at the extraction stage this is a
  // per-row failure to be recorded, not the run-level abort that a missing
  // key during *generation* triggers in the executor.
  if (!apiKey) throw new ExtractionError("config", "Missing GEMINI_API_KEY");

  const model = getGeminiModel();
  const endpoint = `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`;

  const schemaInstruction = `Return ONLY valid JSON with this exact shape:
{
  "brand": { "mentioned": boolean, "display_name_found": string|null, "evidence": string[], "position": number|null },
  "competitors": [{ "name": string, "mentioned": boolean, "display_name_found": string|null, "evidence": string[], "position": number|null }],
  "citations": [{ "url": string|null, "domain": string|null, "label": string|null, "evidence": string|null }],
  "sentiment": "positive"|"neutral"|"negative"|"mixed"|"unknown",
  "sentiment_drivers": string[],
  "other_brands_mentioned": string[],
  "summary": string,
  "confidence": "low"|"medium"|"high",
  "notes": string[]
}

For "mentioned" (brand and every competitor): set to true ONLY if that entity's name — or an unambiguous variant of it (abbreviation, different capitalization, with/without a legal suffix) — genuinely appears as text in the response below. NEVER set "mentioned": true because the response is merely about the same topic, product category, or industry as that entity — topical relevance is not a mention. If in doubt, use false.

For "display_name_found": the EXACT substring of the response text you are relying on to justify "mentioned": true — copy it character-for-character from the response, do not paraphrase, translate, or normalize it. Use null when "mentioned" is false.

For "evidence": one or more short EXACT quotes (verbatim substrings of the response text, not paraphrased or summarized) that show the mention in context. Empty array [] when "mentioned" is false.

For "competitors": return EXACTLY one entry per name listed under Competitors below, in that same order — never add, omit, or rename any of them. Include an entry even if that competitor is not mentioned at all (mentioned: false, display_name_found: null, evidence: [], position: null). Never add an entry for any brand that is not in the Competitors list, even if it appears in the response text — put those under "other_brands_mentioned" instead.

For "position": the 1-based rank of the entity's FIRST mention in the response text (1 = mentioned first). Use null if the entity is not mentioned (mentioned: false). Rank only entities that are actually mentioned, with no gaps in the ranking (1, 2, 3, ...), ordered by where each entity first appears in the text. The brand and all competitors share a single ranking.

For "sentiment_drivers": ONLY when "sentiment" is "negative" or "mixed", list up to 3 short noun-phrase themes (2-4 words each) that are visible in or evidenced by the response as reasons for the negative perception OF THE BRAND (e.g. "atención al cliente", "plazos de entrega", "precios altos", "equipaje de mano"). Include themes that are clearly implied by the response text, not just ones listed explicitly — for example, if the response says "passengers often report problems with checked baggage fees", extract "checked baggage fees" even though it wasn't presented as a bullet point. Do NOT invent a criticism that has no basis in the response text. Empty array [] for positive/neutral sentiment or when the response gives no indication of any specific negative theme about the brand.

For "other_brands_mentioned": list the real, actual company or brand names that appear in the response text and are NEITHER "${input.brand}" NOR any of the names listed under Competitors below. This surfaces brands the AI mentions that are not currently being tracked. Only include names that are genuinely present in the response text — never invent one. Exclude generic terms, product categories, or descriptive phrases (e.g. "aerolíneas low-cost" is not a brand name).${otherBrandsRelevanceHint(input.profile)} Up to 5 entries, each a short canonical name (e.g. "IKEA", not "la marca IKEA" or "la empresa sueca IKEA"). Empty array [] if none.`;

  const promptBlock = [
    schemaInstruction,
    `Brand: ${input.brand}`,
    `Competitors: ${input.competitors.join(", ") || "none"}`,
    `Original prompt: ${input.promptText}`,
    "Raw LLM response to extract from:",
    input.rawResponseText
  ].join("\n\n");

  const response = await fetchExtractionWithRetry(
    endpoint,
    {
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
    },
    {
      timeoutMs: EXTRACTION_CALL_TIMEOUT_MS,
      maxAttempts: EXTRACTION_MAX_ATTEMPTS,
      baseDelayMs: EXTRACTION_RETRY_BASE_DELAY_MS,
      maxDelayMs: EXTRACTION_RETRY_MAX_DELAY_MS,
      deadlineAt: input.deadlineAt,
      describeStatus: getGeminiApiError,
      timeoutMessage: "Gemini extraction request timed out."
    }
  );

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    modelVersion?: string;
  };

  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n").trim() ?? "";
  if (!text) {
    throw new ExtractionError("empty", "Gemini extraction returned empty JSON.");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text);
  } catch {
    throw new ExtractionError("invalid_json", "Gemini extraction returned invalid JSON.");
  }

  const parsed = extractionOutputSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new ExtractionError("schema", "Gemini extraction JSON failed schema validation.");
  }

  return {
    data: parsed.data,
    model: data.modelVersion ?? model
  };
}
