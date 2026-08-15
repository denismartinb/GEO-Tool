import "server-only";

import { ExtractionError } from "@/lib/llm/extraction-errors";
import {
  GEMINI_API_URL,
  GeminiConfigError,
  fetchGeminiWithRetry,
  getGeminiModel,
  toIncidentError
} from "@/lib/llm/gemini-client";
import { reportLlmIncident } from "@/lib/llm/llm-incident";

/**
 * PRELAUNCH-HARDENING-1 Fase R5 (2/2) — la llamada de "Auditar mi web", en la
 * zona a la que pertenece.
 *
 * Vivía dentro de `lib/llm/gemini.ts` por un motivo que no era arquitectónico:
 * ahí estaba el cliente HTTP. Aquí le aplica `.claude/rules/web-audit.md`, que
 * es la regla que de verdad la gobierna.
 *
 * Lo que **no** cambia: `lib/llm/gemini.ts` la reexporta, así que
 * `lib/recommendations/domain-coverage.ts` sigue importándola de donde siempre
 * y su test —que hace `vi.mock("@/lib/llm/gemini")`— no se toca.
 */

export type DomainAuditInput = {
  brand: string;
  domain: string;
  language: string;
  topic: string;
};

export type DomainAuditRawResponse = {
  text: string;
  groundingChunks: Array<{ uri: string; title?: string }>;
  model: string;
};

/**
 * RECS-4B ("Auditar mi web"): asks Gemini to search Google, restricted (in
 * the prompt — the API has no hard domain filter) to the brand's own domain,
 * for content related to a specific topic. This is the ONLY place besides
 * generateGeminiVisibilityAnswer that enables `google_search` grounding.
 *
 * Returns the raw text + raw groundingChunks unfiltered — this function does
 * NOT decide what counts as "verified own-domain content". That filtering
 * (resolve each chunk's redirect, keep only ones matching the project's own
 * domain, fail-closed on any that can't be resolved) is the caller's
 * responsibility (lib/recommendations/domain-coverage.ts), mirroring how
 * lib/scan/extraction.ts owns the equivalent decision for the main scan
 * pipeline. Never treat this function's `text` as a verified fact on its
 * own — the model is not hard-restricted to the given domain and may ground
 * on other sites too.
 */
export async function auditDomainContent(input: DomainAuditInput): Promise<DomainAuditRawResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiConfigError("Missing GEMINI_API_KEY");

  const model = getGeminiModel();
  const endpoint = `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`;

  // WEB-AUDIT-DQ (2026-07-05): the input `topic` is a scan prompt — usually a
  // full natural-language question ("¿Cuáles son las políticas de equipaje de
  // mano más comunes…?"). The previous prompt handed Gemini a literal
  // `Search query: site:{domain} {full question}`, which it searched verbatim
  // and got zero grounding chunks for (measured: 5/6 Ryanair topics returned
  // chunks:0). A whole question rarely matches how a page is titled. So we now
  // instruct Gemini to first reduce the question to its core subject keywords
  // and search site:{domain} for THOSE, trying a couple of variations — the
  // model does the keyword extraction (robust across languages, no brittle
  // per-language stopword heuristic). Behavior change reviewed against the
  // DOMAIN-COVERAGE-1 invariants: the model is still not hard-restricted to the
  // domain, so the caller's fail-closed own-domain verification is unchanged
  // and remains the only thing that decides "verified own content".
  const instruction = [
    `You are auditing what "${input.brand}" (domain: ${input.domain}) has ALREADY published on its OWN website about the subject of a user's question, using Google Search restricted to that domain.`,
    "The input may be a full natural-language question, not a search query. First reduce it to its core subject as a few keywords (the product, policy, service, or topic it is about).",
    `Then search the web using site:${input.domain} with those keywords. Do NOT search for the full question text verbatim — a whole question rarely matches how a page is titled. If the first keyword search finds nothing, try one or two alternative keyword phrasings before concluding.`,
    `Only consider pages on ${input.domain} itself. Never describe content from any other domain as if it belonged to this site.`,
    "If you find relevant pages on this exact domain, briefly describe what each one covers, at most one short sentence per page.",
    "If, after trying keyword searches, you do NOT find anything relevant on this domain, say so directly in one short sentence — do not guess.",
    `Respond in this language: ${input.language}.`,
    "Keep the entire response under 500 characters."
  ].join("\n");

  const promptBlock = `User question / topic to audit:\n${input.topic}`;

  const requestBody = JSON.stringify({
    contents: [{ parts: [{ text: promptBlock }] }],
    systemInstruction: { parts: [{ text: instruction }] },
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } }
  });

  // LLM-RESILIENCE-1: was a bare `fetchWithTimeout` that died on the first
  // non-OK status. The audit fires one of these per topic, so a rate-limited
  // minute took out whole topics one by one with nothing to distinguish "no
  // content found on this domain" from "we never got to ask".
  let response: Response;
  try {
    response = await fetchGeminiWithRetry(endpoint, requestBody);
  } catch (error) {
    await reportLlmIncident({
      surface: "web_audit",
      provider: "gemini",
      error: toIncidentError(error),
      domain: input.domain
    });
    throw error;
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> };
    }>;
    modelVersion?: string;
  };

  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n").trim() ?? "";
  if (!text) {
    throw new ExtractionError("empty", "Gemini returned an empty response.");
  }

  const groundingChunks = (data.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [])
    .map((chunk) => chunk.web)
    .filter((web): web is { uri: string; title?: string } => Boolean(web?.uri))
    .map((web) => ({ uri: web.uri, title: web.title }));

  return {
    text,
    groundingChunks,
    model: data.modelVersion ?? model
  };
}
